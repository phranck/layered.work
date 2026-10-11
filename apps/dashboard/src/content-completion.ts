import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
  startCompletion,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  accepts,
  argumentsOf,
  COMPONENT_NAMES,
  type ComponentDefinition,
  type ComponentName,
  childOf,
  components,
  NODE,
  OPEN_VALUE_REFERENCE,
  type Parameter,
  SPACE_STEPS,
  writtenKindOf,
  writtenValueOf,
} from "@layered/content";
import { type MediaKind, type MediaLibraryItem, UPLOAD_TYPES } from "@layered/schemas";
import type { SyntaxNode } from "@lezer/common";
import { componentSnippet, WITH_STOPS } from "./editor-toolbar.js";

/**
 * Completion for the content language: which components exist, which
 * parameters the one being written takes, and which values a parameter accepts.
 *
 * **Everything offered comes from the register.** The names, the descriptions,
 * the parameters, the closed sets of values and which component belongs inside
 * which: adding a component to the register changes what is offered here with
 * no edit to this file.
 *
 * **The enclosing component is read from the parse tree, the line being typed
 * from its text.** A component that is half written is not a component yet, and
 * the parser rightly says so, so the arguments under the cursor are read off the
 * current line. Which component's body the cursor stands in, and the fields of a
 * table's rows, come from the tree, which is the server's own reading of them.
 */

/** A register entry, read through the shape every entry has. */
const definitionOf = (name: string): ComponentDefinition | undefined =>
  (components as Readonly<Record<string, ComponentDefinition>>)[name];

/** The start of a component on its line, with only indentation before it. */
const COMPONENT_START = /^\s*([A-Z][A-Za-z0-9]*)?$/;

/** A component whose argument list is open at the cursor, on the cursor's line. */
const OPEN_ARGUMENTS = /^\s*([A-Z][A-Za-z0-9]*)\s*\(([^)]*)$/;

/**
 * The name of the component whose body the position stands in, if any.
 *
 * @param state - The editor's state.
 * @param position - Where the cursor is.
 */
function enclosingComponent(state: EditorState, position: number): SyntaxNode | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, -1); node; node = node.parent) {
    if (node.name === NODE.ComponentBody && node.parent?.name === NODE.Component) return node.parent;
  }
  return null;
}

/** A component node's name, as written. */
function nameOf(state: EditorState, node: SyntaxNode): string {
  const nameNode = childOf(node, NODE.ComponentName);
  return nameNode ? state.sliceDoc(nameNode.from, nameNode.to) : "";
}

/**
 * The components that may be written here: the parts of the enclosing
 * component where it holds parts, and otherwise everything that stands on its
 * own.
 */
function componentsAllowedIn(container: string | undefined): ComponentName[] {
  const held = container ? definitionOf(container)?.holds : undefined;
  if (held) return COMPONENT_NAMES.filter((name) => held.includes(name));
  return COMPONENT_NAMES.filter((name) => !definitionOf(name)?.within);
}

/** One component, as the list offers it: its description, and its snippet. */
function componentOption(name: ComponentName): Completion {
  const definition = components[name];
  return snippetCompletion(componentSnippet(name, WITH_STOPS), {
    label: name,
    detail: definition.body === "never" ? "()" : "{ }",
    info: definition.description,
    type: "class",
  });
}

/**
 * A part of a container, as the list offers it inside that container.
 *
 * A row arrives with every field its table's columns show, in the columns'
 * order, so it is complete the moment it is written. A column arrives with its
 * field left open rather than with a placeholder name, which could be a field
 * another column already shows.
 *
 * @param name - The part.
 * @param shown - The fields the container's columns show, in their order.
 */
function partOption(name: ComponentName, shown: readonly string[]): Completion {
  const definition = components[name] as ComponentDefinition;
  const template =
    definition.fields && shown.length > 0
      ? `${name}(${shown.map((field) => `${field}: "\${}"`).join(", ")})`
      : // biome-ignore lint/suspicious/noTemplateCurlyInString: `${}` is CodeMirror's snippet field syntax.
        componentSnippet(name, { ...WITH_STOPS, field: "${}" });
  return snippetCompletion(template, {
    label: name,
    detail: definition.body === "never" ? "()" : "{ }",
    info: definition.description,
    type: "class",
  });
}

/**
 * The fields of the rows and columns in one container, as two sets: the names
 * the rows carry and the names the columns show.
 *
 * @param state - The editor's state.
 * @param container - The component whose parts to read.
 */
function fieldsIn(state: EditorState, container: SyntaxNode): { carried: Set<string>; shown: Set<string> } {
  const carried = new Set<string>();
  const shown = new Set<string>();
  const body = childOf(container, NODE.ComponentBody);

  for (let part = body?.firstChild ?? null; part; part = part.nextSibling) {
    if (part.name !== NODE.Component) continue;
    const definition = definitionOf(nameOf(state, part));
    if (!definition) continue;

    for (const argument of argumentsOf(part)) {
      const nameNode = childOf(argument, NODE.ArgumentName);
      const valueNode = writtenValueOf(argument);
      if (!nameNode) continue;
      const name = state.sliceDoc(nameNode.from, nameNode.to);
      if (definition.fields && !definition.parameters[name]) carried.add(name);
      const parameter = definition.parameters[name];
      if (parameter?.kind === "field" && valueNode && writtenKindOf(valueNode) === "keyword") {
        shown.add(state.sliceDoc(valueNode.from, valueNode.to));
      }
    }
  }
  return { carried, shown };
}

/** The names already written in an argument list, with strings taken out first. */
function writtenParameterNames(argumentsText: string): Set<string> {
  const bare = argumentsText.replace(/"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?/g, '""');
  return new Set([...bare.matchAll(/(?:^|,)\s*([a-z][A-Za-z0-9]*)\s*:/g)].map((match) => match[1] ?? ""));
}

/** Whether the value written first without a name is already there. */
function hasUnnamedValue(argumentsText: string): boolean {
  const first = argumentsText.split(",")[0]?.trim() ?? "";
  return first !== "" && !/^[a-z][A-Za-z0-9]*\s*:/.test(first);
}

/** The values a parameter takes, where they are a closed set. */
function valuesFor(parameter: Parameter, fields: () => Set<string>): string[] {
  switch (parameter.kind) {
    case "keyword":
      return [...(parameter.values ?? [])];
    case "step":
      return [...SPACE_STEPS];
    case "flag":
      return ["true", "false"];
    case "field":
      return [...fields()];
    default:
      return [];
  }
}

/**
 * One parameter, as the list offers it.
 *
 * Text is inserted with its quotes and the cursor between them. A parameter
 * with a closed set of values is inserted with its colon, and the list of those
 * values opens at once, because nothing else could be written there.
 *
 * @param name - The name it is written under.
 * @param parameter - What it takes.
 * @param extra - The detail, the description and the ranking to show it with.
 */
function parameterOption(
  name: string,
  parameter: Parameter,
  extra: Pick<Completion, "detail" | "info" | "boost">,
): Completion {
  const quoted = parameter.kind === "text" || parameter.kind === "slug" || parameter.kind === "form";
  if (quoted) return snippetCompletion(`${name}: "\${}"`, { label: name, type: "property", ...extra });
  return {
    label: name,
    type: "property",
    ...extra,
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: `${name}: ` },
        selection: { anchor: from + name.length + 2 },
      });
      startCompletion(view);
    },
  };
}

/**
 * The words the completion list shows beside an option, read in the interface's
 * language each time the list opens.
 */
export interface CompletionLabels {
  /** Beside the value a parameter takes where none is written. */
  defaultValue(): string;
  /** Beside a field a row lacks that one of its table's columns shows. */
  shownField(): string;
}

/**
 * Completes component names at the start of a line, parameter names inside an
 * argument list, and values after a parameter's colon.
 *
 * @param labels - The words shown beside an option, in the interface's language.
 * @returns A completion source for the surface, which answers with what to
 *   offer, or null where nothing in the language fits.
 */
export function contentCompletions(labels: CompletionLabels) {
  return (context: CompletionContext): CompletionResult | null => completeContent(context, labels);
}

/**
 * What `contentCompletions` offers where the cursor stands.
 *
 * @param context - Where the cursor is, and whether completion was asked for.
 * @param labels - The words shown beside an option.
 */
function completeContent(context: CompletionContext, labels: CompletionLabels): CompletionResult | null {
  const { state, pos: position } = context;
  const line = state.doc.lineAt(position);
  const before = state.sliceDoc(line.from, position);
  const container = enclosingComponent(state, position);
  const containerName = container ? nameOf(state, container) : undefined;

  // A component name, at the start of its line. Only while a name is being
  // typed or when asked for, because every paragraph starts at a line's start.
  const start = COMPONENT_START.exec(before);
  if (start) {
    const typed = start[1] ?? "";
    if (typed === "" && !context.explicit) return null;
    const shown = container ? [...fieldsIn(state, container).shown] : [];
    return {
      from: position - typed.length,
      options: componentsAllowedIn(containerName).map((name) =>
        container ? partOption(name, shown) : componentOption(name),
      ),
      validFor: /^[A-Z][A-Za-z0-9]*$/,
    };
  }

  const open = OPEN_ARGUMENTS.exec(before);
  const definition = open ? definitionOf(open[1] ?? "") : undefined;
  if (!open || !definition) return null;
  const argumentsText = open[2] ?? "";
  const rest = state.sliceDoc(position, line.to);
  const fields = () => {
    if (!container) return new Set<string>();
    const found = fieldsIn(state, container);
    return definition.fields ? found.shown : found.carried;
  };

  // A value, after `name:`. A closed set opens at once, because there is
  // nothing else that could be written there.
  const value = /([a-z][A-Za-z0-9]*)\s*:\s*([A-Za-z0-9]*)$/.exec(argumentsText);
  if (value) {
    const name = value[1] ?? "";
    const typed = value[2] ?? "";
    const parameter =
      definition.parameters[name] ?? (definition.fields?.kind === "field" ? definition.fields : undefined);
    if (!parameter) return null;
    const values = valuesFor(parameter, fields);
    const options = values.map(
      (option, index): Completion => ({
        label: option,
        type: "enum",
        detail: option === String(parameter.default) ? labels.defaultValue() : undefined,
        // In the order the register gives them, rather than alphabetically.
        boost: values.length - index,
      }),
    );
    if (options.length === 0) return null;
    return { from: position - typed.length, options, validFor: /^[A-Za-z0-9]*$/ };
  }

  // A parameter name, where an argument starts: after the bracket or a comma.
  const argument = /(?:^|,)\s*([a-z][A-Za-z0-9]*)?$/.exec(argumentsText);
  if (!argument) return null;
  const typed = argument[1] ?? "";
  const written = writtenParameterNames(argumentsText + rest);
  const unnamedGiven = hasUnnamedValue(argumentsText + rest);

  // In the register's order, which is the order a person reads them in, with
  // what the component cannot do without ahead of the rest. The list sorts by
  // boost before it sorts by name.
  const declared = Object.entries(definition.parameters);
  const options: Completion[] = declared
    .filter(([name]) => !written.has(name) && !(name === definition.unnamed && unnamedGiven))
    .map(([name, parameter]) =>
      parameterOption(name, parameter, {
        detail: accepts(parameter),
        info: parameter.description,
        boost: (parameter.required ? declared.length : 0) - declared.findIndex(([other]) => other === name),
      }),
    );

  // A row's fields are the ones its table's columns show and it lacks.
  if (definition.fields) {
    for (const field of fields()) {
      if (written.has(field)) continue;
      options.push(parameterOption(field, definition.fields, { detail: labels.shownField() }));
    }
  }

  if (options.length === 0) return null;
  return { from: position - typed.length, options, validFor: /^[a-z][A-Za-z0-9]*$/ };
}

/** A file of the library, as the completion list offers it. */
export type LibraryFile = Pick<MediaLibraryItem, "slug" | "kind" | "url">;

/**
 * What completion asks of the media library.
 *
 * Handed in rather than fetched here, so the list can be tested without a
 * server and the surface stays a surface: the dashboard decides how a file is
 * found and how one is uploaded.
 */
export type MediaLibrary = {
  /** Files of one kind whose slug, alt text or caption contains the query, newest first. */
  search(kind: MediaKind, query: string): Promise<readonly LibraryFile[]>;
  /**
   * Lets the author choose a file of that kind and uploads it.
   *
   * @returns The new file's slug, or null when nothing was uploaded, which
   *   includes a failed upload the dashboard has already reported.
   */
  upload(kind: MediaKind): Promise<string | null>;
  /**
   * Uploads files the author dropped or pasted, one after another in the order
   * given, and calls back with each one the library took before the next one
   * starts. A refused or failed file is reported by the dashboard and skipped.
   */
  uploadFiles(
    files: readonly File[],
    uploaded: (file: { kind: MediaKind; slug: string }) => void,
  ): Promise<void>;
  /** What the entry that uploads is called, in the interface's language when the list opens. */
  uploadLabel(): string;
};

/** An entry of the list that can carry a picture to show before its name. */
type LibraryCompletion = Completion & { thumbnail?: string };

/**
 * A quoted value being written at the end of an argument list: the parameter's
 * name where one is written, and what has been typed inside the quotes.
 */
const OPEN_STRING = /(?:^|,)\s*(?:([a-z][A-Za-z0-9]*)\s*:\s*)?"([^"]*)$/;

/**
 * Puts a slug into the quotes it is being written in, closing them where they
 * are still open, and leaves the cursor after the closing quote.
 */
function insertSlug(view: EditorView, slug: string, from: number, to: number): void {
  const closed = view.state.sliceDoc(to, to + 1) === '"';
  view.dispatch({
    changes: { from, to, insert: closed ? slug : `${slug}"` },
    selection: { anchor: from + slug.length + 1 },
    userEvent: "input.complete",
  });
}

/**
 * The entry that uploads.
 *
 * The chooser opens within the keystroke or click that picked the entry,
 * because a browser opens one only in answer to the person. Once the upload is
 * done the slug goes where the author was typing, or to the cursor where that
 * text has changed in the meantime.
 */
function uploadEntry(library: MediaLibrary, kind: MediaKind): Completion {
  return {
    label: library.uploadLabel(),
    apply: (view, _completion, from, to) => {
      const typed = view.state.sliceDoc(from, to);
      void library.upload(kind).then((slug) => {
        if (!slug || !view.dom.isConnected) return;
        const head = view.state.selection.main.head;
        const unchanged = view.state.sliceDoc(from, to) === typed;
        insertSlug(view, slug, unchanged ? from : head, unchanged ? to : head);
      });
    },
  };
}

/**
 * Completes a file inside the quotes of a parameter that names one.
 *
 * Only files of the kind the register gives that parameter are offered, newest
 * first, matching what has been typed against their slug, alt text and caption.
 * The list is the library's own answer, so it is shown as given rather than
 * filtered a second time here, and asked again as the author types. The entry
 * that uploads comes last, where the library accepts uploads of that kind.
 *
 * @param library - Where the files come from.
 * @returns A completion source for the surface.
 */
export function libraryCompletions(library: MediaLibrary) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const { state, pos: position } = context;
    const before = state.sliceDoc(state.doc.lineAt(position).from, position);
    const open = OPEN_ARGUMENTS.exec(before);
    const definition = open ? definitionOf(open[1] ?? "") : undefined;
    const quoted = OPEN_STRING.exec(open?.[2] ?? "");
    if (!definition || !quoted) return null;

    // A value written without a name belongs to the unnamed parameter only when
    // it is the first argument.
    const name = quoted[1] ?? (quoted.index === 0 ? definition.unnamed : undefined);
    const parameter = name ? definition.parameters[name] : undefined;
    if (parameter?.kind !== "slug" || !parameter.media) return null;

    const kind = parameter.media;
    const typed = quoted[2] ?? "";
    const files = await library.search(kind, typed);
    if (context.aborted) return null;

    const options: Completion[] = files.map(
      (file): LibraryCompletion => ({
        label: file.slug,
        thumbnail: file.kind === "image" ? (file.url ?? undefined) : undefined,
        apply: (view, _completion, from, to) => insertSlug(view, file.slug, from, to),
      }),
    );
    if (UPLOAD_TYPES[kind]) options.push(uploadEntry(library, kind));
    return { from: position - typed.length, options, filter: false };
  };
}

/** A named value, as the completion list offers it and the validator knows it. */
export type KnownValue = { name: string; value: string };

/** Where Markdown keeps text as written, which a reference inside is not one. */
const CODE_NODES = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);

/**
 * Puts a value's name into the reference being written and closes it, keeping
 * the closing braces the bracket closing has already typed, and leaves the
 * cursor after them.
 */
function insertReference(view: EditorView, name: string, from: number, to: number): void {
  const opening = view.state.sliceDoc(from - 1, from) === "{" ? " " : "";
  const closing = /^ ?\}\}/.exec(view.state.sliceDoc(to, to + 3))?.[0];
  const insert = closing ? `${opening}${name}${closing.startsWith(" ") ? "" : " "}` : `${opening}${name} }}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length + (closing?.length ?? 0) },
    userEvent: "input.complete",
  });
}

/**
 * Completes the name of a named value after `{{`, showing each value's text
 * beside its name, everywhere but in code.
 *
 * @param values - The values as they stand, read each time the list opens.
 * @returns A completion source for the surface.
 */
export function valueCompletions(values: () => readonly KnownValue[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos: position } = context;
    const open = OPEN_VALUE_REFERENCE.exec(state.sliceDoc(state.doc.lineAt(position).from, position));
    if (!open) return null;
    for (
      let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, -1);
      node;
      node = node.parent
    ) {
      if (CODE_NODES.has(node.name)) return null;
    }
    const options = values().map(
      (value): Completion => ({
        label: value.name,
        detail: value.value,
        type: "variable",
        apply: (view, _completion, from, to) => insertReference(view, value.name, from, to),
      }),
    );
    if (options.length === 0) return null;
    const typed = open[1] ?? "";
    return { from: position - typed.length, options, validFor: /^[A-Za-z0-9-]*$/ };
  };
}

/** A picture's thumbnail before its name in the list, and nothing beside any other entry. */
function thumbnailOf(completion: Completion): Node | null {
  const source = (completion as LibraryCompletion).thumbnail;
  if (!source) return null;
  const image = document.createElement("img");
  image.className = "cm-completionThumbnail";
  image.src = source;
  image.alt = "";
  image.loading = "lazy";
  return image;
}

/**
 * The completion, as one extension for the surface.
 *
 * It opens while a name is typed and on Ctrl-Space, and its list closes on
 * Escape; Enter takes the highlighted entry, and Tab then moves between the
 * places a snippet leaves open.
 *
 * @param labels - The words shown beside a component's option, in the
 *   interface's language. Without them nothing completes components, which is
 *   right for a text whose profile holds none: every paragraph there starts
 *   with what looks like the start of a component's name.
 * @param library - The media library, which completes the quotes of a file
 *   parameter where it is given.
 * @param values - The named values, or a mail's placeholders, which complete a
 *   reference after `{{` where they are given.
 */
export function contentAutocompletion(
  labels: CompletionLabels | undefined,
  library?: MediaLibrary,
  values?: () => readonly KnownValue[],
) {
  return autocompletion({
    override: [
      ...(labels ? [contentCompletions(labels)] : []),
      ...(library ? [libraryCompletions(library)] : []),
      ...(values ? [valueCompletions(values)] : []),
    ],
    icons: false,
    addToOptions: [{ render: thumbnailOf, position: 20 }],
  });
}

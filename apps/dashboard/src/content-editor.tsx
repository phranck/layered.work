import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { commonmarkLanguage, markdown } from "@codemirror/lang-markdown";
import type { LanguageSupport } from "@codemirror/language";
import { forceLinting } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { CONTENT_SYNTAX, type Finding } from "@layered/content";
import type { MediaKind } from "@layered/schemas";
import { type Ref, useEffect, useEffectEvent, useImperativeHandle, useRef } from "react";
import {
  type CompletionLabels,
  contentAutocompletion,
  type KnownValue,
  type MediaLibrary,
} from "./content-completion.js";
import { contentFileDrop } from "./content-files.js";
import { componentHighlighting, contentHighlighting } from "./content-highlight.js";
import { contentIndentation, reindentDocument } from "./content-indent.js";
import { insertComponentBlock } from "./content-insert.js";
import { contentValidation } from "./content-lint.js";
import type { CheckedContent } from "./content-validation.js";
import { useDashboardLanguage } from "./language-context.js";
import { tableSync } from "./table-sync.js";

/**
 * The writing surface for an entry's body.
 *
 * CodeMirror 6, parsing with the content language's own Lezer extension, so
 * what the author types is parsed into exactly the tree the server parses.
 * Highlighting, completion and validation build on that tree in their own
 * steps; this is the surface they attach to.
 */

/**
 * The content language as CodeMirror takes it.
 *
 * CommonMark as the base, extended by the same list the server's parser is
 * configured from. `@codemirror/lang-markdown` would otherwise default to its
 * own Markdown, which adds subscript, superscript and emoji, and its tree would
 * then differ from the server's on exactly those characters. The highlighting
 * extension adds tags to node types and no nodes, so the tree stays the same. HTML tag
 * completion is off, because the content language is written with components
 * rather than markup.
 */
export function contentLanguage(): LanguageSupport {
  return markdown({
    base: commonmarkLanguage,
    extensions: [...CONTENT_SYNTAX, componentHighlighting],
    completeHTMLTags: false,
  });
}

/**
 * How the surface looks, which is mostly that it looks like nothing of its own.
 *
 * The face, its ligatures, the code size, the line height, the surface and the
 * edge all come from `.editor__surface` in the shared UI package, so the editor
 * inherits them rather than stating them a second time. The caret takes the
 * accent, and the browser's focus outline is replaced by the surface's own
 * focus, which the stylesheet draws.
 */
const surfaceTheme = EditorView.theme(
  {
    // The editor fills the surface and scrolls inside it, padded where the
    // surface used to be, so the text runs to the edge as it scrolls.
    "&": {
      flex: "1",
      minHeight: "0",
      color: "inherit",
      backgroundColor: "transparent",
      fontSize: "inherit",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      padding: "var(--space-5)",
      fontFamily: "inherit",
      lineHeight: "inherit",
      overflow: "auto",
    },
    ".cm-content": { padding: "0", caretColor: "var(--text-accent)" },
    ".cm-line": { padding: "0" },
    ".cm-cursor": { borderLeftColor: "var(--text-accent)" },

    // The bracket beside the cursor and the one it pairs with are outlined, and
    // one with no partner is marked as an error. Written with the focus selector
    // the default styles use, because a plainer selector would lose to them.
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: "var(--accent-tint)",
      outline: "1px solid var(--edge-strong)",
    },
    "&.cm-focused .cm-nonmatchingBracket": {
      color: "var(--state-danger)",
      outline: "1px solid var(--state-danger)",
    },

    // The completion list is an overlay of the workbench, so it takes the
    // overlay's surface, edge and lift, and the editor's own face and size.
    ".cm-tooltip": {
      color: "var(--text-primary)",
      backgroundColor: "var(--surface-overlay)",
      border: "1px solid var(--edge-strong)",
      borderRadius: "var(--radius-control)",
      boxShadow: "var(--lift-3)",
      overflow: "hidden",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--text-code)",
      maxHeight: "18em",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
      padding: "var(--space-1) var(--space-3)",
      lineHeight: "1.5",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      color: "var(--text-primary)",
      backgroundColor: "var(--accent-tint)",
    },
    ".cm-completionDetail": {
      marginLeft: "var(--space-3)",
      fontStyle: "normal",
      color: "var(--text-muted)",
    },
    ".cm-completionMatchedText": { textDecoration: "none", color: "var(--text-accent)" },
    // A picture from the library, small enough to sit on the line of its name.
    ".cm-completionThumbnail": {
      width: "var(--space-6)",
      height: "var(--space-6)",
      marginRight: "var(--space-2)",
      objectFit: "cover",
      borderRadius: "var(--radius-chip)",
      verticalAlign: "middle",
    },
    ".cm-tooltip.cm-completionInfo": {
      maxWidth: "28em",
      padding: "var(--space-2) var(--space-3)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)",
    },
  },
  { dark: true },
);

/**
 * Everything the surface does, in one list.
 *
 * Prose is most of what is written here, so lines wrap. The standard keymap
 * brings undo and redo, find and replace, and several cursors: a further
 * cursor is added with Alt and a click, or Mod-D on the next match.
 *
 * @param label - What the surface is called to assistive technology.
 * @param completionLabels - The words completion shows beside an option.
 * @param library - The media library completion offers files from, where there is one.
 * @param values - The named values completion offers after `{{`.
 */
function surfaceExtensions(
  label: string,
  completionLabels: CompletionLabels,
  library: MediaLibrary | undefined,
  values: () => readonly KnownValue[],
): Extension[] {
  return [
    contentLanguage(),
    contentHighlighting(),
    contentAutocompletion(completionLabels, library, values),
    library ? contentFileDrop(library) : [],
    contentIndentation(),
    tableSync(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", spellcheck: "true" }),
    surfaceTheme,
  ];
}

/**
 * What the toolbar can ask of the surface. Every command acts on every
 * selection, so the several cursors the surface allows are all served, and
 * every one gives the focus back to the text.
 */
export interface ContentEditorHandle {
  /**
   * Puts markup around each selection, or around a placeholder that is left
   * selected where nothing was.
   */
  wrap(before: string, after: string, placeholder: string): void;
  /** Starts every line a selection touches with the prefix, such as `## ` or `> `. */
  prefixLines(prefix: string): void;
  /**
   * Inserts a block on lines of its own, with a blank line before it where the
   * cursor stands in text. The cursor goes to the first empty quotes in the
   * block, or into an empty body, or to its end.
   */
  insertBlock(text: string): void;
  /**
   * Puts the indentation of every line right, from the structure of the
   * document, so the same text comes out the same however it was indented before.
   */
  reindent(): void;
  /** Selects and scrolls the reported range into view. */
  selectFinding(finding: Pick<Finding, "from" | "to">): void;
}

/** Props for the writing surface. */
export interface ContentEditorProps {
  /** Receives the commands the toolbar uses. */
  editorRef?: Ref<ContentEditorHandle>;
  onValidation?: (checked: CheckedContent) => void;
  /** The body, as plain text. */
  value: string;
  /** Called with the whole body, as plain text, after every change the author makes. */
  onChange: (value: string) => void;
  /** What the surface is called to assistive technology. */
  label: string;
  /**
   * The media library, which completes the quotes of a file parameter. Whether
   * there is one is read when the surface is created; what it answers is read
   * each time it is asked.
   */
  library?: MediaLibrary;
  /**
   * The named values, which complete a reference after `{{` and decide which
   * names the validator accepts. Undefined while they are loading, when
   * references are taken on trust.
   */
  values?: readonly KnownValue[];
}

/**
 * A CodeMirror surface for one body.
 *
 * Plain text in and plain text out: the editor holds no state the document
 * does not carry, so saving the text and opening it again gives back the same
 * editor. A `value` that changes from outside, such as a reloaded entry,
 * replaces the document; a `value` that is only the echo of the author's own
 * typing is recognised and left alone, so the cursor does not jump.
 */
export function ContentEditor({
  value,
  onChange,
  label,
  editorRef,
  onValidation,
  library,
  values,
}: ContentEditorProps) {
  const { text } = useDashboardLanguage();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useImperativeHandle(
    editorRef,
    () => ({
      selectFinding(finding) {
        const current = view.current;
        if (!current) return;
        const from = Math.min(current.state.doc.length, finding.from);
        const to = Math.min(current.state.doc.length, finding.to);
        current.dispatch({
          selection: EditorSelection.range(from, to),
          effects: EditorView.scrollIntoView(from, { y: "center" }),
        });
        current.focus();
      },
      wrap(before, after, placeholder) {
        const current = view.current;
        if (!current) return;
        current.dispatch(
          current.state.changeByRange((range) => {
            const inner = range.empty ? placeholder : current.state.sliceDoc(range.from, range.to);
            return {
              changes: { from: range.from, to: range.to, insert: `${before}${inner}${after}` },
              range: EditorSelection.range(
                range.from + before.length,
                range.from + before.length + inner.length,
              ),
            };
          }),
        );
        current.focus();
      },
      prefixLines(prefix) {
        const current = view.current;
        if (!current) return;
        const starts = new Set<number>();
        for (const range of current.state.selection.ranges) {
          for (let at = range.from; at <= range.to; ) {
            const line = current.state.doc.lineAt(at);
            if (!line.text.startsWith(prefix)) starts.add(line.from);
            at = line.to + 1;
          }
        }
        current.dispatch({ changes: [...starts].map((from) => ({ from, insert: prefix })) });
        current.focus();
      },
      insertBlock(text) {
        const current = view.current;
        if (!current) return;
        insertComponentBlock(current, text);
        current.focus();
      },
      reindent() {
        const current = view.current;
        if (!current) return;
        reindentDocument(current);
        current.focus();
      },
    }),
    [],
  );
  const validated = useEffectEvent((checked: CheckedContent) => onValidation?.(checked));
  const message = useEffectEvent((finding: Finding) => text("contentFinding", finding));
  const defaultValueLabel = useEffectEvent(() => text("completionDefault"));
  const shownFieldLabel = useEffectEvent(() => text("completionShownField"));
  const changed = useEffectEvent((body: string) => onChange(body));
  const searchLibrary = useEffectEvent(
    (kind: MediaKind, query: string) => library?.search(kind, query) ?? Promise.resolve([]),
  );
  const uploadToLibrary = useEffectEvent((kind: MediaKind) => library?.upload(kind) ?? Promise.resolve(null));
  const uploadFilesToLibrary = useEffectEvent(
    (files: readonly File[], uploaded: (file: { kind: MediaKind; slug: string }) => void) =>
      library?.uploadFiles(files, uploaded) ?? Promise.resolve(),
  );
  const libraryUploadLabel = useEffectEvent(() => library?.uploadLabel() ?? "");
  const knownValues = useEffectEvent((): readonly KnownValue[] => values ?? []);
  const knownValueNames = useEffectEvent(() =>
    values ? new Set(values.map((value) => value.name)) : undefined,
  );
  const initialValue = useRef(value);
  const initialLabel = useRef(label);
  const hasLibrary = useRef(library !== undefined);

  useEffect(() => {
    if (!host.current) return;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          surfaceExtensions(
            initialLabel.current,
            { defaultValue: () => defaultValueLabel(), shownField: () => shownFieldLabel() },
            hasLibrary.current
              ? {
                  search: (kind, query) => searchLibrary(kind, query),
                  upload: (kind) => uploadToLibrary(kind),
                  uploadFiles: (files, uploaded) => uploadFilesToLibrary(files, uploaded),
                  uploadLabel: () => libraryUploadLabel(),
                }
              : undefined,
            () => knownValues(),
          ),
          contentValidation(
            (checked) => validated(checked),
            (finding) => message(finding),
            () => knownValueNames(),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);

  // The validator runs when the text changes, so a list of values that arrives
  // or changes afterwards is checked against at once rather than at the next key.
  useEffect(() => {
    if (values && view.current) forceLinting(view.current);
  }, [values]);

  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() === value) return;
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="content-editor" />;
}

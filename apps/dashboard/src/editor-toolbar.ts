import { type ComponentDefinition, type ComponentName, components, type Parameter } from "@layered/content";
import {
  ArrowsOutLineVerticalIcon,
  CardsIcon,
  ColumnsIcon,
  CubeIcon,
  CursorClickIcon,
  FilePdfIcon,
  GridFourIcon,
  type IconProps,
  ImageIcon,
  ImagesIcon,
  MinusIcon,
  NoteIcon,
  RowsIcon,
  TableIcon,
  TextboxIcon,
  VideoCameraIcon,
} from "@layered/ui/icons";
import type { ComponentType } from "react";

/**
 * What the toolbar above the writing surface inserts.
 *
 * Markdown for what Markdown covers, and a component for everything else. The
 * components and how each is written come from the content register, so a new
 * component needs only a place in one of the groups below, and a test refuses a
 * register entry that has none. A part of something larger, such as a column of
 * a table, has no tool of its own: it arrives with its whole.
 */

/** The components that stand on their own, which are the ones with a tool. */
export type ToolbarComponent = {
  [Name in ComponentName]: (typeof components)[Name] extends { within: string } ? never : Name;
}[ComponentName];

/**
 * What stands where the author has still to write something.
 *
 * The toolbar inserts plain text and puts the cursor in the first empty quotes.
 * Completion inserts a snippet, whose `${}` fields Tab moves between, and whose
 * fields of the same name are edited together: a table's column and row share
 * the field `${name}`, so renaming it in one renames it in the other.
 */
export type SnippetForm = { text: string; field: string; body: string };

/**
 * One level of indentation: what a body is indented by in the snippets below,
 * and what the writing surface keeps every body indented by as it is typed and
 * reindented.
 */
export const INDENT_UNIT = "  ";

/** Plain text, as the toolbar inserts it. */
export const PLAIN: SnippetForm = { text: '""', field: "name", body: "" };

/** A snippet with tab stops, as completion inserts it. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: `${}` is CodeMirror's snippet field syntax, not a template.
export const WITH_STOPS: SnippetForm = { text: '"${}"', field: "${name}", body: "${}" };

/** A bare value standing in for a parameter until the author writes one. */
function placeholderFor(parameter: Parameter, form: SnippetForm): string {
  switch (parameter.kind) {
    case "text":
    case "slug":
    case "form":
      return form.text;
    case "number":
      return String(parameter.default ?? parameter.range?.[0] ?? 1);
    case "step":
      return String(parameter.default ?? 5);
    case "keyword":
      return String(parameter.default ?? parameter.values?.[0] ?? "");
    case "flag":
      return String(parameter.default ?? true);
    case "icon":
      return "";
    case "field":
      return form.field;
  }
}

/**
 * A component as the toolbar inserts it: its required values as empty
 * placeholders and an empty body where it needs one, and nothing else. A
 * component whose body is a list of parts gets one of each part instead, so a
 * table arrives with a column and a row that already belong together.
 *
 * Built from the register rather than from the register's example, because an
 * example carries somebody else's words and an insertion should carry none.
 *
 * @param name - A component from the register.
 */
export function componentSnippet(name: ComponentName, form: SnippetForm = PLAIN): string {
  const definition: ComponentDefinition = components[name];
  const parameters = Object.entries(definition.parameters) as [string, Parameter][];
  const unnamed = definition.unnamed;
  const required = parameters.filter(([, parameter]) => parameter.required);
  const values = [
    ...required.filter(([key]) => key === unnamed).map(([, parameter]) => placeholderFor(parameter, form)),
    ...required
      .filter(([key]) => key !== unnamed)
      .map(([key, parameter]) => `${key}: ${placeholderFor(parameter, form)}`),
    ...(definition.fields ? [`${form.field}: ${placeholderFor(definition.fields, form)}`] : []),
  ];
  const head = values.length > 0 || definition.body === "never" ? `${name}(${values.join(", ")})` : name;
  if (definition.body !== "required") return head;

  const parts = (definition.holds ?? []).map(
    (part) => `${INDENT_UNIT}${componentSnippet(part as ComponentName, form)}`,
  );
  return `${head} {\n${parts.length > 0 ? parts.join("\n") : `${INDENT_UNIT}${form.body}`}\n}`;
}

/**
 * The components with a tool, grouped by what they are for, in the order the
 * toolbar shows them. A divider is drawn between groups.
 */
export const COMPONENT_GROUPS: readonly (readonly ToolbarComponent[])[] = [
  ["Image", "Gallery", "Model", "Video", "YouTube", "Pdf"],
  ["Note", "Card", "Table", "Form", "Button"],
  ["VStack", "HStack", "Grid", "Spacer", "Divider"],
];

/**
 * The icon each component's tool shows in place of its name, which stays the
 * tool's accessible label and its tooltip. Keyed by every component that has a
 * tool, so one added to the register without an icon fails the type check.
 */
export const COMPONENT_ICONS: Readonly<Record<ToolbarComponent, ComponentType<IconProps>>> = {
  Image: ImageIcon,
  Gallery: ImagesIcon,
  Model: CubeIcon,
  Video: VideoCameraIcon,
  YouTube: VideoCameraIcon,
  Pdf: FilePdfIcon,
  Note: NoteIcon,
  Card: CardsIcon,
  Table: TableIcon,
  Form: TextboxIcon,
  Button: CursorClickIcon,
  VStack: RowsIcon,
  HStack: ColumnsIcon,
  Grid: GridFourIcon,
  Spacer: ArrowsOutLineVerticalIcon,
  Divider: MinusIcon,
};

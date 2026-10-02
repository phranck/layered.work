import { type ComponentName, components, type Parameter } from "@layered/content";

/**
 * What the toolbar above the writing surface inserts.
 *
 * Markdown for what Markdown covers, and a component for everything else. The
 * components and how each is written come from the content register, so a new
 * component needs only a place in one of the groups below, and a test refuses a
 * register entry that has none.
 */

/** A bare value standing in for a parameter until the author writes one. */
function placeholderFor(parameter: Parameter): string {
  switch (parameter.kind) {
    case "text":
    case "slug":
      return '""';
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
  }
}

/**
 * A component as the toolbar inserts it: its required values as empty
 * placeholders and an empty body where it needs one, and nothing else.
 *
 * Built from the register rather than from the register's example, because an
 * example carries somebody else's words and an insertion should carry none.
 *
 * @param name - A component from the register.
 */
export function componentSnippet(name: ComponentName): string {
  const definition = components[name];
  const parameters = Object.entries(definition.parameters) as [string, Parameter][];
  const unnamed = "unnamed" in definition ? definition.unnamed : undefined;
  const required = parameters.filter(([, parameter]) => parameter.required);
  const values = [
    ...required.filter(([key]) => key === unnamed).map(([, parameter]) => placeholderFor(parameter)),
    ...required
      .filter(([key]) => key !== unnamed)
      .map(([key, parameter]) => `${key}: ${placeholderFor(parameter)}`),
  ];
  const head = values.length > 0 || definition.body === "never" ? `${name}(${values.join(", ")})` : name;
  return definition.body === "required" ? `${head} {\n  \n}` : head;
}

/**
 * The components, grouped by what they are for, in the order the toolbar shows
 * them. A divider is drawn between groups.
 */
export const COMPONENT_GROUPS: readonly (readonly ComponentName[])[] = [
  ["Image", "Gallery", "Model", "Video", "Pdf"],
  ["Note", "Card", "Button"],
  ["VStack", "HStack", "Grid", "Spacer", "Divider"],
];

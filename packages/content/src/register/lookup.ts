import { COMPONENT_NAMES, type ComponentName, components } from "./components.js";
import type { ComponentDefinition, Parameter, Register } from "./kinds.js";

/**
 * Reading the register.
 *
 * Every consumer asks the same questions of it, so they are answered once here
 * rather than four times slightly differently. In particular, "is this a
 * component" and "is this a component under a name it used to have" are the
 * same lookup with different consequences, and keeping them together is what
 * stops one of them being forgotten.
 */

/** What a name turned out to mean. */
export type Resolution =
  | { found: true; name: ComponentName; definition: ComponentDefinition; deprecated?: string }
  | { found: false; name: string; suggestion?: ComponentName };

/**
 * Old names, worked out once rather than searched for on every lookup.
 *
 * Read through a widened view of the register, because `as const satisfies`
 * narrows it to exactly what is written, and nothing is deprecated yet: the
 * property is absent from the literal type and present in the shape.
 */
function aliasesOf(register: Register): Map<string, { name: string; message: string }> {
  return new Map(
    Object.entries(register).flatMap(([name, definition]) =>
      (definition.aliases ?? []).map((alias) => [alias.was, { name, message: alias.message }] as const),
    ),
  );
}

/** The real register, widened, and its aliases. */
const REGISTER: Register = components;
const ALIASES = aliasesOf(REGISTER);

/**
 * Works out what a written name refers to.
 *
 * @param written - The name as it appears in the document.
 * @param register - Which register to read. The real one unless a test is
 *   exercising a shape the real one does not have yet, such as a deprecation.
 * @returns What it means, with the message to show when it is an old name, or
 *   the nearest thing to it when it means nothing.
 */
export function resolveComponent(written: string, register: Register = REGISTER): Resolution {
  const definition = register[written];
  if (definition) {
    return { found: true, name: written as ComponentName, definition };
  }

  const aliases = register === REGISTER ? ALIASES : aliasesOf(register);
  const alias = aliases.get(written);
  const aliased = alias && register[alias.name];
  if (alias && aliased) {
    return {
      found: true,
      name: alias.name as ComponentName,
      definition: aliased,
      deprecated: alias.message,
    };
  }

  return { found: false, name: written, suggestion: nearest(written, Object.keys(register)) };
}

/**
 * The component whose name is closest to what was written.
 *
 * Only useful for a near miss, which is what it is for: somebody who wrote
 * `VStac` gets `VStack`, and somebody who wrote `Carousel` gets nothing, which
 * is more helpful than being offered `Card`.
 *
 * @param written - What was actually written.
 * @param names - The component names to measure against.
 */
function nearest(written: string, names: string[]): ComponentName | undefined {
  const lower = written.toLowerCase();
  let best: { name: ComponentName; distance: number } | undefined;

  for (const name of names) {
    const distance = editDistance(lower, name.toLowerCase());
    if (!best || distance < best.distance) best = { name: name as ComponentName, distance };
  }

  // A third of the length, so a short name tolerates one wrong letter and a
  // long one tolerates two. Beyond that a suggestion is a guess.
  return best && best.distance <= Math.max(1, Math.floor(written.length / 3)) ? best.name : undefined;
}

/** How many single-character changes turn one string into the other. */
function editDistance(from: string, to: string): number {
  let previous = Array.from({ length: to.length + 1 }, (_, index) => index);

  for (let row = 1; row <= from.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= to.length; column += 1) {
      const substitution = (previous[column - 1] ?? 0) + (from[row - 1] === to[column - 1] ? 0 : 1);
      current[column] = Math.min(substitution, (previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1);
    }
    previous = current;
  }

  return previous[to.length] ?? to.length;
}

/**
 * The parameter a value written first without a name belongs to.
 *
 * @param definition - The component it was written on.
 * @returns The name and the parameter, or nothing when this component takes no
 *   unnamed value.
 */
export function unnamedParameter(
  definition: ComponentDefinition,
): { name: string; parameter: Parameter } | undefined {
  const name = definition.unnamed;
  if (!name) return undefined;

  const parameter = definition.parameters[name];
  return parameter ? { name, parameter } : undefined;
}

/**
 * What a component is when nothing is written.
 *
 * Applied by the renderer rather than by the parser, so that what an author
 * wrote and what a component does with it stay separable: a document that says
 * nothing about spacing keeps saying nothing about it, and the default can
 * change without every entry being rewritten.
 *
 * @param definition - The component to read.
 */
export function defaultsOf(definition: ComponentDefinition): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(definition.parameters)
      .filter(([, parameter]) => parameter.default !== undefined)
      .map(([name, parameter]) => [name, parameter.default as string | number | boolean]),
  );
}

/**
 * Everything an editor needs to offer a component, in the order the register
 * declares them.
 *
 * Here rather than in the editor so that a component added to the register
 * appears in the completion list with nothing else edited, which is the
 * acceptance this register was written against.
 */
export function completionList(): {
  name: ComponentName;
  description: string;
  takesBody: boolean;
  parameters: string[];
}[] {
  return COMPONENT_NAMES.map((name) => ({
    name,
    description: components[name].description,
    takesBody: components[name].body !== "never",
    parameters: Object.keys(components[name].parameters),
  }));
}

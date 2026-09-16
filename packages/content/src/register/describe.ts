import { SPACE_STEP_RANGE } from "./components.js";
import type { Parameter } from "./kinds.js";

/**
 * Saying in words what the register says in types.
 *
 * Two things need the same sentence: the validator, refusing a value and having
 * to say what would have been accepted, and the reference, listing what each
 * parameter takes. Written twice they would drift, and the drift would be a
 * document promising something the parser refuses.
 */

/**
 * What a parameter accepts, as the end of a sentence.
 *
 * Reads on from "which takes", so it begins in lower case and names no subject:
 * "tone, which takes one of success, info, warning, or danger".
 *
 * @param parameter - What the register says about it.
 * @returns The phrase, without a full stop.
 */
export function accepts(parameter: Parameter): string {
  switch (parameter.kind) {
    case "text":
      return "text in quotes";
    case "slug":
      return "the name of a file in the media library, in quotes";
    case "number":
      return parameter.range
        ? `a whole number from ${parameter.range[0]} to ${parameter.range[1]}`
        : "a whole number";
    case "step":
      return `a step of the space scale, from ${SPACE_STEP_RANGE.first} to ${SPACE_STEP_RANGE.last}`;
    case "flag":
      return "true or false";
    case "keyword":
      return `one of ${either(parameter.values ?? [])}`;
    case "icon":
      return "the name of an icon";
  }
}

/**
 * A list as a person would say it aloud, with the Oxford comma.
 *
 * @param values - What there is to choose from.
 * @returns The list, read out.
 */
export function either(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "nothing";
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, or ${values[values.length - 1]}`;
}

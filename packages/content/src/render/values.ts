import { parseContent } from "../parser/index.js";
import { NODE } from "../parser/nodes.js";

/**
 * Replacing every reference to a named value with the value's text.
 *
 * The backend does this before a body leaves it, so every reader of a body,
 * the renderer as much as a summary, a reading time or a feed, sees the text a
 * reader sees without knowing values exist.
 *
 * **A value is always text.** Every character Markdown could read as syntax is
 * escaped with a backslash, which Markdown takes off again, so a value can never
 * open a link, an emphasis or a component, whatever it holds.
 *
 * **Only references the parser found are replaced.** One inside a code span or
 * a fence is an example and stays as written, and so does one inside a quoted
 * argument, which the parser reads as a string rather than as prose.
 */

/** ASCII punctuation, which is every character a Markdown backslash escapes. */
const MARKDOWN_PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

/**
 * A value's text, written so that Markdown reads it back as exactly that text.
 *
 * @param value - The value as stored.
 */
function asMarkdownText(value: string): string {
  return value.replace(MARKDOWN_PUNCTUATION, (character) => `\\${character}`);
}

/** One reference the parser found: where it stands in the body, and the name it holds. */
interface FoundReference {
  from: number;
  to: number;
  name: string;
}

/**
 * Every reference the parser finds in a body, in the order they stand.
 *
 * The one reading that resolving and counting share, so a reference that is
 * replaced is exactly a reference that keeps its value from being deleted.
 *
 * @param source - The body as written.
 */
function valueReferencesIn(source: string): FoundReference[] {
  const found: FoundReference[] = [];
  if (!source.includes("{{")) return found;
  parseContent(source).iterate({
    enter(node) {
      if (node.name !== NODE.ValueReference) return true;
      const nameNode = node.node.getChild(NODE.ValueName);
      if (nameNode)
        found.push({ from: node.from, to: node.to, name: source.slice(nameNode.from, nameNode.to) });
      // A reference holds only its name, so there is nothing further down to find.
      return false;
    },
  });
  return found;
}

/**
 * A body with every reference to a known value replaced by that value.
 *
 * @param source - The body as written.
 * @param values - Every value, by its name.
 * @returns The body with each reference whose name is in `values` replaced. A
 *   reference to any other name is left as written, which the validator has
 *   already refused for anything published.
 */
export function resolveValues(source: string, values: ReadonlyMap<string, string>): string {
  if (values.size === 0) return source;
  let resolved = "";
  let at = 0;
  for (const reference of valueReferencesIn(source)) {
    const value = values.get(reference.name);
    if (value === undefined) continue;
    resolved += source.slice(at, reference.from) + asMarkdownText(value);
    at = reference.to;
  }
  return resolved + source.slice(at);
}

/**
 * The names a body refers to, read the way `resolveValues` reads them.
 *
 * What a value may not be deleted over, so it counts exactly the references
 * that would otherwise be left pointing at nothing, and none in code.
 *
 * @param source - The body as written.
 * @returns Each name once.
 */
export function referencedValueNames(source: string): Set<string> {
  return new Set(valueReferencesIn(source).map((reference) => reference.name));
}

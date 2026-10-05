import { parseContent } from "../parser/index.js";
import { NODE } from "../parser/nodes.js";
import { argumentsOf, childOf, unquote, writtenKindOf, writtenValueOf } from "../parser/read.js";
import type { Register } from "../register/kinds.js";
import { resolveComponent, unnamedParameter } from "../register/lookup.js";

/**
 * Which files from the media library a document names, and where.
 *
 * A name is a media reference because the register says the parameter it is
 * written for takes one, not because it looks like a file name. That is the
 * same binding the validator does, so the two cannot disagree about which
 * values are files: a caption that happens to read like a slug is a caption.
 */

/** One file named in a document. */
export type MediaReference = {
  /** The name, without its quotes. */
  slug: string;
  /** Where the quoted value starts, opening quote included. */
  from: number;
  /** Where it ends, closing quote included. */
  to: number;
};

/**
 * Every media reference in a document, in the order written.
 *
 * Parameters the register does not know name nothing here, and neither does a
 * component whose arguments could not be read: the validator reports those, and
 * guessing at them would invent references. A component the parser marked for
 * something else, such as text beside it on its line, still names the files its
 * arguments name, because those were read to the end and the library must not
 * let a file go that a draft still names.
 *
 * @param text - The document as written.
 * @param register - Which register to bind against. The real one unless a
 *   test says otherwise.
 * @returns One entry per written reference, so a file named twice appears twice.
 */
export function mediaReferences(text: string, register?: Register): MediaReference[] {
  const found: MediaReference[] = [];

  parseContent(text).iterate({
    enter(node) {
      if (node.name !== NODE.Component && node.name !== NODE.ComponentError) return true;

      const nameNode = childOf(node.node, NODE.ComponentName);
      if (!nameNode) return true;
      const resolution = resolveComponent(text.slice(nameNode.from, nameNode.to), register);
      if (!resolution.found) return true;

      let unnamedTaken = false;
      for (const argument of argumentsOf(node.node)) {
        const valueNode = writtenValueOf(argument);
        if (!valueNode) continue;

        const nameChild = childOf(argument, NODE.ArgumentName);
        let parameter = nameChild
          ? resolution.definition.parameters[text.slice(nameChild.from, nameChild.to)]
          : undefined;
        if (!nameChild && !unnamedTaken) {
          parameter = unnamedParameter(resolution.definition)?.parameter;
          unnamedTaken = true;
        }

        if (parameter?.kind !== "slug" || writtenKindOf(valueNode) !== "string") continue;
        found.push({
          slug: unquote(text.slice(valueNode.from, valueNode.to)),
          from: valueNode.from,
          to: valueNode.to,
        });
      }
      return true;
    },
  });

  return found;
}

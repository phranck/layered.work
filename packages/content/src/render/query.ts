import type { RenderNode } from "./model.js";

/**
 * Whether anything in a rendered document is drawn by the named component.
 *
 * The name is the register's `renders` rather than what an author writes, so a
 * component that is renamed in the language keeps answering the same question.
 *
 * A page asks this about its own body before it is sent, because one of the
 * answers decides a response header: a `Model` needs a permission in the
 * content policy that no other page is given.
 *
 * @param nodes - A rendered document, or any part of one.
 * @param renders - What draws it, as `ComponentNode.renders` spells it.
 * @returns Whether at least one node anywhere in the tree is drawn by it.
 */
export function rendersComponent(nodes: readonly RenderNode[], renders: string): boolean {
  return nodes.some(
    (node) =>
      (node.kind === "component" && node.renders === renders) ||
      ((node.kind === "component" || node.kind === "element") && rendersComponent(node.children, renders)),
  );
}

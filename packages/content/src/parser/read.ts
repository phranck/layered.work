import type { SyntaxNode } from "@lezer/common";
import { NODE, VALUE_NODE } from "./nodes.js";
import type { ArgumentKind } from "./scan.js";

/**
 * Getting about a parse tree.
 *
 * The validator and the renderer ask the same questions of it: which child is
 * the name, which arguments were written, which of them was written without
 * one, and what a quoted value says without its quotes. They do different
 * things with the answers, so what is shared here is the navigation and not the
 * interpretation.
 */

/** Which written form each value node stands for, read off the parser's own map. */
const WRITTEN_KIND: Record<string, ArgumentKind> = Object.fromEntries(
  Object.entries(VALUE_NODE).map(([kind, name]) => [name, kind as ArgumentKind]),
);

/** The node names a value may appear under. */
const VALUE_NAMES = new Set<string>(Object.values(VALUE_NODE));

/**
 * The first direct child of this node with that name.
 *
 * @param node - The node to look inside.
 * @param name - The node name to look for.
 * @returns The child, or nothing.
 */
export function childOf(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let at = node.firstChild; at; at = at.nextSibling) {
    if (at.name === name) return at;
  }
  return null;
}

/** Every direct child of this node, in order. */
export function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let at = node.firstChild; at; at = at.nextSibling) children.push(at);
  return children;
}

/**
 * The arguments written on a component.
 *
 * Direct children only. A component nested inside this one has arguments of its
 * own, and whoever is walking will reach it separately.
 *
 * @param node - A component node.
 * @returns One node per argument, in the order they were written.
 */
export function argumentsOf(node: SyntaxNode): SyntaxNode[] {
  const list = childOf(node, NODE.ComponentArguments);
  if (!list) return [];

  const items: SyntaxNode[] = [];
  for (let at = list.firstChild; at; at = at.nextSibling) {
    if (at.name === NODE.ComponentArgument) items.push(at);
  }
  return items;
}

/**
 * The value node of one argument, whichever of the written forms it is.
 *
 * @param argument - One argument node.
 * @returns The value, or nothing when the argument has none.
 */
export function writtenValueOf(argument: SyntaxNode): SyntaxNode | null {
  for (let at = argument.firstChild; at; at = at.nextSibling) {
    if (VALUE_NAMES.has(at.name)) return at;
  }
  return null;
}

/**
 * Which of the written forms a value node is.
 *
 * @param node - A value node.
 * @returns The form, or nothing when the node is not a value at all.
 */
export function writtenKindOf(node: SyntaxNode): ArgumentKind | undefined {
  return WRITTEN_KIND[node.name];
}

/**
 * A quoted value without its quotes, and without the backslashes inside it.
 *
 * @param raw - The value exactly as written, quotes included.
 * @returns What it says.
 */
export function unquote(raw: string): string {
  return raw.slice(1, -1).replace(/\\(.)/g, "$1");
}

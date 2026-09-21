import type { RenderNode } from "./model.js";

/** The text a heading displays, independent of its inline emphasis and links. */
function headingText(nodes: readonly RenderNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return node.value;
      if (node.kind === "element" && node.tag === "img") return node.attributes.alt ?? "";
      if (node.kind === "element" || node.kind === "component") return headingText(node.children);
      return "";
    })
    .join("");
}

/** Preserve Publii's published slugs, then disambiguate within this document. */
export function headingId(nodes: readonly RenderNode[], used: Set<string>): string {
  const base =
    headingText(nodes)
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N} -]/gu, "")
      .replaceAll(" ", "-") || "heading";
  let id = base;
  let occurrence = 2;
  while (used.has(id)) id = `${base}-${occurrence++}`;
  used.add(id);
  return id;
}

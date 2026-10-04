import type { ElementNode, RenderNode } from "@layered/content";
import { createElement, Fragment, type ReactNode } from "react";
import { CodeBlock } from "./code-block.js";
import { CONTENT_RENDERERS } from "./content-adapters.js";
import { ContentPlaceholder } from "./content-placeholder.js";
import { contentUrl, type MediaResolver } from "./content-shared.js";

const proseTags = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "li",
  "hr",
  "br",
  "em",
  "strong",
  "del",
  "code",
  "a",
  "img",
  "table",
  "caption",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
function renderElement(
  node: ElementNode,
  media: MediaResolver,
  resolveUrl?: (url: string) => string,
): ReactNode {
  const children = renderNodes(node.children, media, resolveUrl);
  if (!proseTags.has(node.tag)) return children;
  const attributes: Record<string, string | undefined> = {};
  for (const name of ["alt", "title", "data-task", "data-align"])
    if (node.attributes[name]) attributes[name] = node.attributes[name];
  if (/^h[1-6]$/.test(node.tag)) attributes.id = node.attributes.id;
  if (node.tag === "a") {
    const href = contentUrl(node.attributes.href);
    attributes.href = href ? contentUrl(resolveUrl?.(href) ?? href) : undefined;
  }
  if (node.tag === "img") {
    const src = contentUrl(node.attributes.src, true);
    attributes.src = src ? contentUrl(resolveUrl?.(src) ?? src, true) : undefined;
    attributes.alt = node.attributes.alt ?? "";
    if (!attributes.src) return createElement("span", null, attributes.alt);
    return createElement("img", { ...attributes, loading: "lazy", decoding: "async" });
  }
  if (node.tag === "table") {
    return createElement("div", { className: "content-table" }, createElement("table", attributes, children));
  }
  if (node.tag === "hr" || node.tag === "br") return createElement(node.tag);
  return createElement(node.tag, attributes, children);
}
function renderNode(node: RenderNode, media: MediaResolver, resolveUrl?: (url: string) => string): ReactNode {
  switch (node.kind) {
    case "text":
      return node.value;
    case "placeholder":
      return createElement(ContentPlaceholder, { name: node.name });
    case "code":
      return createElement(CodeBlock, { source: node.source, language: node.language });
    case "element":
      return renderElement(node, media, resolveUrl);
    case "component":
      return Object.hasOwn(CONTENT_RENDERERS, node.renders)
        ? CONTENT_RENDERERS[node.renders]?.(node, media, renderNodes(node.children, media, resolveUrl))
        : createElement(ContentPlaceholder, { name: node.name });
  }
}
/** Draw a stateless snapshot in authored order; the model has no mutable list identity. */
export function renderNodes(
  nodes: readonly RenderNode[],
  media: MediaResolver,
  resolveUrl?: (url: string) => string,
): ReactNode {
  // The render model is a static document snapshot with no identity or mutable
  // list state. Position keys preserve the authored order, including repeated prose.
  return nodes.map((node, index) =>
    createElement(Fragment, { key: index }, renderNode(node, media, resolveUrl)),
  );
}

import type { ElementNode, RenderNode } from "@layered/content";
import { createElement, Fragment, type ReactNode } from "react";
import { CodeBlock } from "./code-block.js";
import { CONTENT_RENDERERS } from "./content-adapters.js";
import { ContentPlaceholder } from "./content-placeholder.js";
import { contentUrl, type MediaResolver } from "./content-shared.js";
import { MermaidDiagram } from "./mermaid-diagram.js";

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
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
function renderElement(node: ElementNode, media: MediaResolver): ReactNode {
  const children = renderNodes(node.children, media);
  if (!proseTags.has(node.tag)) return children;
  const attributes: Record<string, string | undefined> = {};
  for (const name of ["alt", "title", "data-task"])
    if (node.attributes[name]) attributes[name] = node.attributes[name];
  if (/^h[1-6]$/.test(node.tag)) attributes.id = node.attributes.id;
  if (node.tag === "a") attributes.href = contentUrl(node.attributes.href);
  if (node.tag === "img") {
    attributes.src = contentUrl(node.attributes.src, true);
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
function renderNode(node: RenderNode, media: MediaResolver): ReactNode {
  switch (node.kind) {
    case "text":
      return node.value;
    case "placeholder":
      return createElement(ContentPlaceholder, { name: node.name });
    case "code":
      if (node.language?.trim().toLowerCase() === "mermaid") {
        return createElement(MermaidDiagram, { source: node.source });
      }
      return createElement(CodeBlock, { source: node.source, language: node.language });
    case "element":
      return renderElement(node, media);
    case "component":
      return Object.hasOwn(CONTENT_RENDERERS, node.renders)
        ? CONTENT_RENDERERS[node.renders]?.(node, media, renderNodes(node.children, media))
        : createElement(ContentPlaceholder, { name: node.name });
  }
}
/** Draw a stateless snapshot in authored order; the model has no mutable list identity. */
export function renderNodes(nodes: readonly RenderNode[], media: MediaResolver): ReactNode {
  // The render model is a static document snapshot with no identity or mutable
  // list state. Position keys preserve the authored order, including repeated prose.
  return nodes.map((node, index) => createElement(Fragment, { key: index }, renderNode(node, media)));
}

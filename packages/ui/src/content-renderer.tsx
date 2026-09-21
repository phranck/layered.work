import type { RenderNode } from "@layered/content";
import { renderNodes } from "./content-render-model.js";
import type { MediaResolver } from "./content-shared.js";

export type { MediaAsset, MediaResolver } from "./content-shared.js";
/** An already interpreted document and its localized media library. */
export interface ContentRendererProps {
  nodes: readonly RenderNode[];
  media: MediaResolver;
}
/** Render the shared content model as safe, server-renderable site components. */
export function ContentRenderer({ nodes, media }: ContentRendererProps) {
  return <div className="content-prose">{renderNodes(nodes, media)}</div>;
}

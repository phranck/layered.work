import type { RenderNode } from "@layered/content";
import { renderNodes } from "./content-render-model.js";
import type { MediaResolver } from "./content-shared.js";
import type { FormEmbedProps } from "./form-embed.js";

export type { MediaAsset, MediaResolver } from "./content-shared.js";
/** An already interpreted document and its localized media library. */
export interface ContentRendererProps {
  nodes: readonly RenderNode[];
  media: MediaResolver;
  /** Resolve safe authored links to the address that serves their content. */
  resolveUrl?: (url: string) => string;
  forms?: Readonly<Record<string, FormEmbedProps>>;
}
/** Render the shared content model as safe, server-renderable site components. */
export function ContentRenderer({ nodes, media, resolveUrl, forms }: ContentRendererProps) {
  return <div className="content-prose">{renderNodes(nodes, media, resolveUrl, forms)}</div>;
}

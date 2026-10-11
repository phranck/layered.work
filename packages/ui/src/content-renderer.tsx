import { type RenderNode, renderInline } from "@layered/content";
import type { ContentLanguage } from "@layered/schemas";
import { renderNodes } from "./content-render-model.js";
import type { ContentUrlResolver, MediaResolver } from "./content-shared.js";
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

/** A line of text written in the inline profile. */
export interface InlineContentProps {
  /** The text as written. */
  text: string;
  /** The language whose quotation marks it takes, where it is known. */
  language?: ContentLanguage;
  /** Resolve safe authored links to the address that serves their content. */
  resolveUrl?: ContentUrlResolver;
}

/** The library a line of text draws from, which is none: the inline profile has no pictures. */
const NO_MEDIA: MediaResolver = () => undefined;

/**
 * A caption, a notice or a message written in the inline profile, drawn as the
 * words, emphasis and links it holds and nothing around them, so it stands in
 * whatever element the caller puts it in. Its links pass the same check as an
 * entry's, so an address an entry could not link to is no link here either.
 */
export function InlineContent({ text, language, resolveUrl }: InlineContentProps) {
  return <>{renderNodes(renderInline(text, { language }), NO_MEDIA, resolveUrl)}</>;
}

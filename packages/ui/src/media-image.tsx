import type { CSSProperties } from "react";
import { contentUrl, imagePosition, type MediaAsset } from "./content-shared.js";

/** What a surface decides about a library picture it draws. */
export interface MediaImageProps {
  /** The picture, with its candidates, its formats and its focal point. */
  asset: MediaAsset;
  /** The words for it here, where the surface has better ones than the library. */
  alt?: string;
  /** The widths it is drawn at, which is what decides the candidate a browser fetches. */
  sizes?: string;
  className?: string;
  /** Laid over the crop this component sets from the picture's focal point. */
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: "high" | "low" | "auto";
}

/**
 * Whether every candidate of a `srcset` is an address a page may load.
 *
 * A single bad candidate drops the whole attribute rather than the one entry,
 * because a browser given a shortened list would silently choose a size the
 * page did not mean.
 *
 * @param srcSet - The attribute as the library published it.
 */
function loadableSrcSet(srcSet: string | undefined): string | undefined {
  if (!srcSet) return undefined;
  return srcSet.split(",").every((candidate) => contentUrl(candidate.trim().split(/\s+/)[0], true))
    ? srcSet
    : undefined;
}

/**
 * One library picture, in every format the library holds for it.
 *
 * A browser takes the first format it can read and falls through to the `img`,
 * which carries the one every browser reads. Where the library offers nothing
 * beyond that one, the `img` stands on its own and the markup is what it was
 * before any of this existed.
 *
 * Every surface that draws a library picture uses this: the figure in a body,
 * the entry card, the project hero, the article cover and the home page. They
 * differ in the widths they draw at and in how soon the picture is wanted, so
 * those are the props, and the crop follows the picture's own focal point
 * everywhere.
 */
export function MediaImage({
  asset,
  alt,
  sizes,
  className,
  style,
  loading,
  decoding,
  fetchPriority,
}: MediaImageProps) {
  const srcSet = loadableSrcSet(asset.srcSet);
  const sources = (asset.sources ?? []).flatMap((source) => {
    const candidates = loadableSrcSet(source.srcSet);
    return candidates ? [{ type: source.type, srcSet: candidates }] : [];
  });
  const image = (
    <img
      className={className}
      src={asset.src}
      srcSet={srcSet}
      sizes={srcSet || sources.length ? (sizes ?? asset.sizes) : undefined}
      alt={alt ?? asset.alt ?? ""}
      width={asset.width}
      height={asset.height}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      style={{ objectPosition: imagePosition(asset), ...style }}
    />
  );
  if (sources.length === 0) return image;
  return (
    <picture>
      {sources.map((source) => (
        <source key={source.type} type={source.type} srcSet={source.srcSet} sizes={sizes ?? asset.sizes} />
      ))}
      {image}
    </picture>
  );
}

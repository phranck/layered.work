import type { PropsOf } from "@layered/content";
import type { ComponentPropsWithoutRef } from "react";
import { ContentPlaceholder } from "./content-placeholder.js";
// The renderer imports the adapters, which import this module. Every binding in
// that circle is read while rendering and never while loading, so none is met
// unfinished.
import { InlineContent } from "./content-renderer.js";
import { contentUrl, type MediaAsset, type MediaProps } from "./content-shared.js";
import { MediaCredit } from "./media-credit.js";
import { MediaImage } from "./media-image.js";
/** A library image and the author overrides declared in the register. */
export type FigureProps = PropsOf<"Image"> & MediaProps;
/** The shared semantic media frame. */
function FigureRoot(props: ComponentPropsWithoutRef<"figure">) {
  return <figure {...props} className={`content-figure ${props.className ?? ""}`} />;
}
/** The shared caption below a media frame. */
function FigureCaption(props: ComponentPropsWithoutRef<"figcaption">) {
  return <figcaption {...props} className="content-figure__caption" />;
}
/** The library's responsive image, preserving its dimensions and focal point. */
function FigureImage({ asset, alt }: { asset: MediaAsset; alt?: string }) {
  const src = contentUrl(asset.src, true);
  if (!src) return <ContentPlaceholder name={asset.filename ?? "image"} />;
  const placeholder =
    asset.placeholder && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.placeholder)
      ? asset.placeholder
      : undefined;
  return (
    <MediaImage
      asset={{ ...asset, src }}
      alt={alt}
      sizes={asset.sizes ?? "100vw"}
      className="content-figure__image"
      loading="lazy"
      decoding="async"
      style={placeholder ? { backgroundImage: `url(${placeholder})` } : undefined}
    />
  );
}
function FigureContent({ slug, caption, alt, media }: FigureProps) {
  const asset = media(slug);
  if (!asset || !contentUrl(asset.src, true)) return <ContentPlaceholder name={slug} />;
  const text = caption ?? asset.caption;
  return (
    <FigureRoot>
      <FigureImage asset={asset} alt={alt} />
      {(text || asset.credit) && (
        <FigureCaption>
          {text && <InlineContent text={text} />}
          {asset.credit && <MediaCredit credit={asset.credit} />}
        </FigureCaption>
      )}
    </FigureRoot>
  );
}
/** A library image with reusable frame, image and caption compound parts. */
export const Figure = Object.assign(FigureContent, {
  Root: FigureRoot,
  Image: FigureImage,
  Caption: FigureCaption,
});

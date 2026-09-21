import type { PropsOf } from "@layered/content";
import type { ComponentPropsWithoutRef } from "react";
import { ContentPlaceholder } from "./content-placeholder.js";
import { contentUrl, type MediaAsset, type MediaProps } from "./content-shared.js";
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
  const focal = asset.focalPoint;
  const placeholder =
    asset.placeholder && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.placeholder)
      ? asset.placeholder
      : undefined;
  const srcSet = asset.srcSet
    ?.split(",")
    .every((candidate) => contentUrl(candidate.trim().split(/\s+/)[0], true))
    ? asset.srcSet
    : undefined;
  return (
    <img
      className="content-figure__image"
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? (asset.sizes ?? "100vw") : undefined}
      alt={alt ?? asset.alt ?? ""}
      width={asset.width}
      height={asset.height}
      loading="lazy"
      decoding="async"
      style={{
        ...(focal ? { objectPosition: `${focal.x * 100}% ${focal.y * 100}%` } : {}),
        ...(placeholder ? { backgroundImage: `url(${placeholder})` } : {}),
      }}
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
      {text && <FigureCaption>{text}</FigureCaption>}
    </FigureRoot>
  );
}
/** A library image with reusable frame, image and caption compound parts. */
export const Figure = Object.assign(FigureContent, {
  Root: FigureRoot,
  Image: FigureImage,
  Caption: FigureCaption,
});

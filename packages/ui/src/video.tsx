import type { PropsOf } from "@layered/content";
import { ContentPlaceholder } from "./content-placeholder.js";
import { contentUrl, type MediaProps } from "./content-shared.js";
import { Figure } from "./figure.js";
/** Video parameters and the library that resolves video and poster. */
export type VideoProps = PropsOf<"Video"> & MediaProps;
/** Native, keyboard-accessible video playback with a resolved library poster. */
export function Video({ slug, poster, caption, media }: VideoProps) {
  const asset = media(slug);
  const src = contentUrl(asset?.src, true);
  if (!asset || !src) return <ContentPlaceholder name={slug} />;
  const text = caption ?? asset.caption;
  return (
    <Figure.Root className="content-video">
      {/* biome-ignore lint/a11y/useMediaCaption: Real caption tracks are resolved and rendered below; the rule cannot inspect the mapped library tracks. */}
      <video
        controls
        preload="metadata"
        playsInline
        poster={poster ? contentUrl(media(poster)?.src, true) : undefined}
        aria-label={asset.alt ?? caption ?? asset.filename ?? slug}
      >
        <source src={src} type={asset.mime} />
        {asset.captions?.map((track) => {
          const source = contentUrl(track.src, true);
          return source ? (
            <track key={source} kind="captions" src={source} srcLang={track.language} label={track.label} />
          ) : null;
        })}
        <a href={src}>Download video</a>
      </video>
      {text && <Figure.Caption>{text}</Figure.Caption>}
    </Figure.Root>
  );
}

import { type PropsOf, youtubeEmbedUrl } from "@layered/content";
import { ContentPlaceholder } from "./content-placeholder.js";
import { Figure } from "./figure.js";

export type YouTubeProps = PropsOf<"YouTube">;

/** A provider frame whose address is normalized again at the rendering boundary. */
export function YouTube({ url, title }: YouTubeProps) {
  const src = youtubeEmbedUrl(url);
  if (!src) return <ContentPlaceholder name="YouTube" />;
  return (
    <Figure.Root className="content-video">
      <iframe
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </Figure.Root>
  );
}

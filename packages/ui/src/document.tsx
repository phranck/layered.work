import type { PropsOf } from "@layered/content";
import { FilePdfIcon } from "@phosphor-icons/react/dist/ssr/FilePdf";
import { Button } from "./button.js";
import { ContentPlaceholder } from "./content-placeholder.js";
import { contentUrl, type MediaProps } from "./content-shared.js";
/** Document parameters and the library that resolves its source. */
export type DocumentProps = PropsOf<"Pdf"> & MediaProps;
/** A native document link, readable in the browser or downloadable by its menu. */
export function Document({ slug, label, media }: DocumentProps) {
  const asset = media(slug);
  const href = contentUrl(asset?.src, true);
  if (!asset || !href) return <ContentPlaceholder name={slug} />;
  return (
    <div className="content-document">
      <Button.Link href={href} type={asset.mime} icon={<FilePdfIcon weight="duotone" />}>
        {label ?? asset.filename ?? slug}
      </Button.Link>
    </div>
  );
}

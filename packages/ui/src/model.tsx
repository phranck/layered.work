import type { PropsOf } from "@layered/content";
import { ArrowsInIcon } from "@phosphor-icons/react/dist/ssr/ArrowsIn";
import { ArrowsOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowsOut";
import { createElement } from "react";
import { Button } from "./button.js";
import { ContentPlaceholder } from "./content-placeholder.js";
import { contentUrl, type MediaProps } from "./content-shared.js";
import { Figure } from "./figure.js";
/** Model parameters and the library that resolves its source. */
export type ModelProps = PropsOf<"Model"> & MediaProps;
/** Server-renderable viewer upgraded by the website's model-viewer island. */
export function Model({ slug, alt, caption, media }: ModelProps) {
  const asset = media(slug);
  const src = contentUrl(asset?.src, true);
  if (!asset || !src) return <ContentPlaceholder name={slug} />;
  const label = alt ?? asset.alt ?? slug;
  return (
    <Figure.Root className="content-model" id={slug}>
      <div className="content-model__stage">
        <div className="content-model__viewport">
          {createElement("model-viewer", {
            src,
            alt: label,
            "camera-controls": true,
            "touch-action": "pan-y",
            loading: "lazy",
          })}
          <Button.Icon
            className="content-model__zoom"
            label="Expand 3D view"
            data-model-zoom=""
            aria-haspopup="dialog"
            aria-expanded="false"
            disabled
            icon={
              <>
                <ArrowsOutIcon className="content-model__expand" weight="duotone" />
                <ArrowsInIcon className="content-model__collapse" weight="duotone" />
              </>
            }
          />
        </div>
      </div>
      <Figure.Caption>{caption ?? asset.caption ?? alt ?? asset.alt}</Figure.Caption>
      {/* Focusable by script alone, so opening the viewer can rest the focus on
          the dialog rather than forcing it onto the close button, which would
          draw a keyboard focus ring nobody navigated to. */}
      <dialog className="content-model__dialog" aria-label={label} tabIndex={-1} />
    </Figure.Root>
  );
}

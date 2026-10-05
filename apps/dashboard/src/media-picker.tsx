import type { AccountMediaItem } from "@layered/schemas";
import { useId } from "react";
import { MediaBrowser } from "./media-browser.js";
import { CardDialog } from "./modal.js";

/** The shared browser returns the stable slug plus the image metadata its caller needs. */
export function MediaPicker({
  onCancel,
  onChoose,
}: {
  onCancel: () => void;
  onChoose: (item: AccountMediaItem) => void;
}) {
  const labelId = useId();
  return (
    <CardDialog labelId={labelId} onClose={onCancel}>
      <MediaBrowser
        labelId={labelId}
        imageOnly
        onCancel={onCancel}
        onChoose={(_slug, item) => {
          if (item.url && item.width && item.height)
            onChoose({
              id: item.id,
              slug: item.slug,
              url: item.url,
              width: item.width,
              height: item.height,
              processingState: item.processingState,
              focalPoint: item.focalPoint,
            });
        }}
      />
    </CardDialog>
  );
}

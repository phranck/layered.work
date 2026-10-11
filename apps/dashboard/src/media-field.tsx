import type { PictureShape } from "@layered/schemas";
import { Button, Field, imagePosition } from "@layered/ui";
import { ImagesIcon, XIcon } from "@layered/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaPicker } from "./media-picker.js";
import { queryKeys } from "./query-keys.js";

/** Props for a field that names one picture from the library. */
export interface MediaFieldProps {
  label: string;
  hint?: string;
  /** What the field says whilst no picture is chosen. */
  none: string;
  mediaId: string | null;
  /** The shape the site gives the picture, which the field shows it in. */
  shape: PictureShape;
  editable: boolean;
  onChange: (mediaId: string | null) => void;
}

/**
 * A field that names one library picture: the picture in the shape the site
 * gives it, or what stands in for none, with a button that removes it and one
 * that opens the picker.
 *
 * The picture is read from the library by its id, so its address and its focal
 * point are the ones stored now, and a focal point moved in the library moves
 * here as well.
 */
export function MediaField({ label, hint, none, mediaId, shape, editable, onChange }: MediaFieldProps) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const [picking, setPicking] = useState(false);
  const picture = useQuery({
    queryKey: queryKeys.mediaDetail(mediaId ?? ""),
    queryFn: () => api.fetchMediaDetail(mediaId ?? ""),
    enabled: mediaId !== null,
  });
  const shown = mediaId !== null ? picture.data : undefined;
  return (
    <Field label={label} hint={hint}>
      <div className="media-field">
        {shown?.url ? (
          <img
            src={shown.url}
            alt=""
            data-shape={shape}
            style={shape === "home-plate" ? { objectPosition: imagePosition(shown) } : undefined}
          />
        ) : (
          <span className="media-field__name">
            {mediaId === null ? none : picture.isError ? mediaId : text("loading")}
          </span>
        )}
        <span className="actions media-field__actions">
          {mediaId && (
            <Button disabled={!editable} icon={<XIcon />} onClick={() => onChange(null)}>
              {text("remove")}
            </Button>
          )}
          <Button disabled={!editable} icon={<ImagesIcon />} onClick={() => setPicking(true)}>
            {text("mediaPicker")}
          </Button>
        </span>
      </div>
      {mediaId !== null && picture.isError && <ErrorNotice error={picture.error} />}
      {picking && (
        <MediaPicker
          onCancel={() => setPicking(false)}
          onChoose={(item) => {
            onChange(item.id);
            setPicking(false);
          }}
        />
      )}
    </Field>
  );
}

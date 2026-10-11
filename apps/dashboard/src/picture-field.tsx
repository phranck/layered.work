import type { PictureShape } from "@layered/schemas";
import { Field, imagePosition } from "@layered/ui";
import { useState } from "react";
import { ActionButton } from "./action-button.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaPicker } from "./media-picker.js";
import { useMediaDetail } from "./media-query.js";

/** Props for a field that names one picture from the library. */
export interface PictureFieldProps {
  label: string;
  hint?: string;
  /** What the field says while no picture is chosen. */
  none: string;
  mediaId: string | null;
  /** The shape the site gives the picture, which the field shows it in. */
  shape: PictureShape;
  editable: boolean;
  onChange: (mediaId: string | null) => void;
}

/**
 * The dashboard's one field for a picture from the library, wherever a setting
 * holds one: the site's sharing picture and watermark, and a home block's
 * picture.
 *
 * Drawn in the mockup's shape: one sunken line holding the picture, its file
 * name in the face code is set in, and at its end the button that opens the
 * picker and the one that takes the picture out. The picture is cropped to the
 * shape the site gives it, so the crop is the one a reader will see. It is read
 * from the library by its id, so its address and its focal point are the ones
 * stored now, and a focal point moved in the library moves here as well.
 */
export function PictureField({ label, hint, none, mediaId, shape, editable, onChange }: PictureFieldProps) {
  const { text } = useDashboardLanguage();
  const [picking, setPicking] = useState(false);
  const picture = useMediaDetail(mediaId);
  const shown = mediaId !== null ? picture.data : undefined;
  return (
    <Field label={label} hint={hint}>
      <div className="picture-field">
        {shown?.url && (
          <img
            src={shown.url}
            alt=""
            data-shape={shape}
            style={shape === "home-plate" ? { objectPosition: imagePosition(shown) } : undefined}
          />
        )}
        <span className="picture-field__name" data-empty={shown?.slug ? undefined : ""}>
          {mediaId === null ? none : (shown?.slug ?? (picture.isError ? mediaId : text("loading")))}
        </span>
        <span className="actions picture-field__actions">
          <ActionButton action="choosePicture" disabled={!editable} onClick={() => setPicking(true)}>
            {text("mediaPicker")}
          </ActionButton>
          {mediaId && (
            <ActionButton.Icon
              action="remove"
              label={text("remove")}
              disabled={!editable}
              onClick={() => onChange(null)}
            />
          )}
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

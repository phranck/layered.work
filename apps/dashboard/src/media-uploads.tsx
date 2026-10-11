import { ACCEPTED_IMAGE_TYPES } from "@layered/schemas";
import { Button } from "@layered/ui";
import { UploadSimpleIcon } from "@layered/ui/icons";
import { useRef } from "react";
import "./media-uploads.css";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import type { UploadProgress } from "./media-query.js";

/**
 * The button that starts an upload of pictures into the library, beside a
 * hidden file control it opens, so it looks like every other action.
 *
 * @param pending - Whether an upload is running, which disables the button.
 * @param start - Receives the chosen files.
 */
export function MediaUploadButton({ pending, start }: { pending: boolean; start: (files: File[]) => void }) {
  const { text } = useDashboardLanguage();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button icon={<UploadSimpleIcon />} onClick={() => input.current?.click()} disabled={pending}>
        {text("mediaUpload")}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        onChange={(event) => {
          start(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </>
  );
}

/**
 * Each file of an upload with how far it has got, or why it failed. Read out
 * politely as it changes.
 *
 * @param items - The progress of every file.
 */
export function MediaUploadProgress({ items }: { items: UploadProgress[] }) {
  const { text } = useDashboardLanguage();
  return (
    <div aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className="media-upload">
          <span className="media-upload__name" title={item.name}>
            {item.name}
          </span>
          <progress
            max={100}
            value={item.percent}
            aria-label={text("mediaUploadProgress", item.name, item.percent)}
          />
          {item.error ? <ErrorNotice error={item.error} /> : <span>{item.percent}%</span>}
        </div>
      ))}
    </div>
  );
}

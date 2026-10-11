import { type ReactNode, useRef } from "react";
import "./media-uploads.css";
import { type Action, ActionButton } from "./action-button.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import type { UploadProgress } from "./media-query.js";

/** Props for a button that opens the browser's file chooser. */
interface FileChooserButtonProps {
  /** The action the button carries, whose icon it takes. */
  action: Action;
  /** The MIME types the chooser offers. */
  types: readonly string[];
  /** Whether more than one file may be chosen at once. */
  multiple?: boolean;
  disabled?: boolean;
  /** Receives the chosen files, and is not called when the chooser is dismissed. */
  onFiles: (files: File[]) => void;
  /** The button's label. */
  children: ReactNode;
}

/**
 * A button that opens the browser's file chooser, for every place in the
 * dashboard where a file is chosen from a click: an upload to the library and
 * an account's portrait. The browser's own control stays hidden behind the
 * button, so the action looks like every other one, and it is emptied after
 * each choice, so choosing the same file again starts a new upload.
 *
 * The editor's completion chooses its file through `chooseFile` instead,
 * because it asks from outside a render, where no element can be drawn.
 */
export function FileChooserButton({
  action,
  types,
  multiple,
  disabled,
  onFiles,
  children,
}: FileChooserButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <ActionButton action={action} disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </ActionButton>
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept={types.join(",")}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) onFiles(files);
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

import { ACCEPTED_IMAGE_TYPES, type MediaLibraryItem, UPLOAD_TYPES } from "@layered/schemas";
import { Button } from "@layered/ui";
import { UploadSimpleIcon } from "@layered/ui/icons";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { MediaLibrary } from "./content-completion.js";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useNotify } from "./notifications.js";

type Progress = { id: number; name: string; percent: number; error?: unknown };

/**
 * Every cached view of the library that a new file changes: the library screen,
 * the account's choice of picture, and the counts in the sidebar.
 *
 * @param client - The dashboard's query cache.
 */
export async function refreshMediaQueries(client: QueryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: ["media"] });
  await client.invalidateQueries({ queryKey: ["account-media"] });
  await client.invalidateQueries({ queryKey: ["dashboard-counts"] });
}

/**
 * Opens the browser's file chooser for one file of the given types.
 *
 * Has to be called within the person's own click or keystroke, because a
 * browser opens a chooser only then.
 *
 * @param types - The MIME types the chooser offers.
 * @returns The chosen file, or null when the chooser was dismissed.
 */
export function chooseFile(types: readonly string[]): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = types.join(",");
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

/**
 * The media library as the writing surface's completion asks for it: files of
 * one kind, newest first, and an upload of a file the author chooses.
 *
 * A failed upload is reported here and answered with null, so the surface only
 * ever learns whether there is a slug to insert.
 */
export function useMediaLibrary(): MediaLibrary {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { notifyError } = useNotify();
  const { text } = useDashboardLanguage();
  return {
    search: async (kind, query) => (await api.fetchMedia(query, kind, 1, false, "newest")).items,
    upload: async (kind) => {
      const file = await chooseFile(UPLOAD_TYPES[kind] ?? []);
      if (!file) return null;
      try {
        const uploaded = await api.uploadMedia(file);
        await refreshMediaQueries(client);
        return uploaded.slug;
      } catch (error) {
        notifyError(error);
        return null;
      }
    },
    uploadLabel: () => text("completionUpload"),
  };
}
/** A sequential upload queue retains per-file failures and selects the final successful file. */
export function useMediaUploads(onComplete: (item: MediaLibraryItem) => void) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const [progress, setProgress] = useState<Progress[]>([]);
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      setProgress(files.map((file, id) => ({ id, name: file.name, percent: 0 })));
      let last: MediaLibraryItem | undefined;
      // Serialize upload/finalization requests to bound storage/API traffic; selection follows input order.
      for (const [id, file] of files.entries()) {
        try {
          // react-doctor-disable-next-line react-doctor/async-await-in-loop
          const uploaded = await api.uploadMedia(file, (percent) =>
            setProgress((current) => current.map((item) => (item.id === id ? { ...item, percent } : item))),
          );
          last = await api.fetchMediaDetail(uploaded.id);
          await refreshMediaQueries(client);
        } catch (error) {
          setProgress((current) => current.map((item) => (item.id === id ? { ...item, error } : item)));
        }
      }
      return last;
    },
    onSuccess: (last) => {
      if (last) onComplete(last);
    },
  });
  return {
    progress,
    pending: upload.isPending,
    start: (files: File[]) => {
      if (files.length && !upload.isPending) upload.mutate(files);
    },
  };
}
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
export function MediaUploadProgress({ items }: { items: Progress[] }) {
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

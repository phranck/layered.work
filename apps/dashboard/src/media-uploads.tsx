import {
  ACCEPTED_IMAGE_TYPES,
  type MediaLibraryItem,
  UPLOAD_TYPES,
  type UploadedMedia,
  uploadKindOf,
} from "@layered/schemas";
import { Button } from "@layered/ui";
import { UploadSimpleIcon } from "@layered/ui/icons";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useRef, useState } from "react";
import type { DashboardApi } from "./api.js";
import type { MediaLibrary } from "./content-completion.js";
import "./media-uploads.css";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useNotify } from "./notifications.js";

/** How far one upload has got, and why it failed where it did. */
export type UploadProgress = { id: number; name: string; percent: number; error?: unknown };

/**
 * Uploads files one after another, in the order given, keeping each one's
 * progress, and hands every file the library took to `uploaded` before the
 * next one starts.
 *
 * One at a time, so the requests to storage and to the API stay bounded and
 * whatever follows an upload happens in the order of the files. A file that
 * fails keeps its error in its progress, and the rest go on.
 *
 * @param api - The dashboard's API.
 * @param files - The files, in the order the author gave them.
 * @param setProgress - Where the progress of every file is kept.
 * @param uploaded - What to do with each file once the library has it.
 */
export async function uploadInOrder(
  api: DashboardApi,
  files: readonly File[],
  setProgress: Dispatch<SetStateAction<UploadProgress[]>>,
  uploaded: (media: UploadedMedia, file: File) => Promise<void> | void,
): Promise<void> {
  setProgress(files.map((file, id) => ({ id, name: file.name, percent: 0 })));
  for (const [id, file] of files.entries()) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const media = await api.uploadMedia(file, (percent) =>
        setProgress((current) => current.map((item) => (item.id === id ? { ...item, percent } : item))),
      );
      await uploaded(media, file);
    } catch (error) {
      setProgress((current) => current.map((item) => (item.id === id ? { ...item, error } : item)));
    }
  }
}

/**
 * Every cached view of the library that a new file changes: the library screen,
 * the account's choice of picture, and the counts in the sidebar.
 *
 * @param client - The dashboard's query cache.
 */
export async function refreshMediaQueries(client: QueryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: ["media"] });
  await client.invalidateQueries({ queryKey: ["account-media"] });
  await refreshCounts(client);
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
 * The media library as the writing surface asks for it: files of one kind,
 * newest first, an upload of a file the author chooses, and an upload of files
 * dropped or pasted onto the text, with their progress for the surface to show.
 *
 * A failed upload is reported here, as a notification for the chosen file and
 * in the progress for dropped ones, so the surface only ever learns which files
 * there are components to insert for.
 */
export function useMediaLibrary(): { library: MediaLibrary; progress: UploadProgress[] } {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { notifyError } = useNotify();
  const { text } = useDashboardLanguage();
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  return {
    progress,
    library: {
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
      uploadFiles: async (files, uploaded) => {
        await uploadInOrder(api, files, setProgress, (media, file) => {
          const kind = uploadKindOf(file.type);
          if (kind) uploaded({ kind, slug: media.slug });
        });
        // A file that arrived leaves the list, and one that failed stays with
        // its reason until the next upload replaces the list.
        setProgress((current) => current.filter((item) => item.error !== undefined));
        await refreshMediaQueries(client);
      },
      uploadLabel: () => text("completionUpload"),
    },
  };
}
/** A sequential upload queue retains per-file failures and selects the final successful file. */
export function useMediaUploads(onComplete: (item: MediaLibraryItem) => void) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const completed: MediaLibraryItem[] = [];
      await uploadInOrder(api, files, setProgress, async (uploaded) => {
        completed.push(await api.fetchMediaDetail(uploaded.id));
        await refreshMediaQueries(client);
      });
      return completed.at(-1);
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

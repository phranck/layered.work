import {
  CONTENT_LANGUAGES,
  type MediaDeletionResult,
  type MediaDetail,
  type MediaKind,
  type MediaLibraryItem,
  type SaveMediaMetadataBody,
  UPLOAD_TYPES,
  type UploadedMedia,
  uploadKindOf,
  type WatermarkAnchor,
} from "@layered/schemas";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useState } from "react";
import type { DashboardApi } from "./api.js";
import type { MediaLibrary } from "./content-completion.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { useDashboardLanguage } from "./language-context.js";
import { pollWhileProcessing } from "./media-processing.js";
import { useNotify } from "./notifications.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";

/**
 * The media library as the dashboard holds it, and every change made to it:
 * pages of the library, one file's detail, uploads, Unsplash imports, a file's
 * descriptions and its deletion.
 *
 * Every view of the library shares one cache prefix, so a file that arrives,
 * changes or goes refreshes the library screen, every picker and every detail
 * at once.
 */

/** What each kind of file is called in the catalogue. */
export const MEDIA_KIND_TEXT: Record<MediaKind, DashboardStringKey> = {
  image: "mediaKindImage",
  video: "mediaKindVideo",
  document: "mediaKindDocument",
  model: "mediaKindModel",
};

/** What each watermark position is called in the catalogue. */
export const WATERMARK_ANCHOR_TEXT: Record<WatermarkAnchor, DashboardStringKey> = {
  "top-left": "watermarkTopLeft",
  top: "watermarkTop",
  "top-right": "watermarkTopRight",
  left: "watermarkLeft",
  center: "watermarkCenter",
  right: "watermarkRight",
  "bottom-left": "watermarkBottomLeft",
  bottom: "watermarkBottom",
  "bottom-right": "watermarkBottomRight",
};

/**
 * Every cached view of the library that a change to a file reaches: each page
 * of the library, which the library screen and every picker show, each file's
 * detail, and the counts in the sidebar. Every change to the library refreshes
 * through this, whether a file arrived, changed or went.
 *
 * @param client - The dashboard's query cache.
 */
export async function refreshMediaQueries(client: QueryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: queryKeys.everyMediaQuery });
  await refreshCounts(client);
}

/** What a page of the library is narrowed to. */
export interface MediaFilter {
  /** Text in the slug, the alt text or the caption, or empty for every file. */
  search: string;
  /** One kind of file, or `all`. */
  kind: string;
  /** The page, counted from one. */
  page: number;
  /** Whether only files nothing uses are shown. */
  unused: boolean;
}

/**
 * One page of the library, asked again while a file on it is still being
 * processed, so its state appears without a reload.
 *
 * @param filter - What the page is narrowed to.
 */
export function useMediaPage(filter: MediaFilter) {
  const api = useDashboardApi();
  const { search, kind, page, unused } = filter;
  return useQuery({
    queryKey: queryKeys.mediaPage(search, kind, page, unused),
    queryFn: () => api.fetchMedia(search, kind, page, unused),
    retry: false,
    refetchInterval: (current) =>
      pollWhileProcessing(current.state.data?.items.map((item) => item.processingState) ?? []),
  });
}

/**
 * One file with its uses and its processing, asked again while it is still
 * being processed, so its variants appear without a reload.
 *
 * @param id - The file's id, or null where no file is named, which asks nothing.
 */
export function useMediaDetail(id: string | null) {
  const api = useDashboardApi();
  return useQuery({
    queryKey: queryKeys.mediaDetail(id ?? ""),
    queryFn: () => api.fetchMediaDetail(id ?? ""),
    enabled: id !== null,
    retry: false,
    refetchInterval: (current) =>
      pollWhileProcessing(current.state.data ? [current.state.data.processing.state] : []),
  });
}

/**
 * What the detail dialog changes about a file, taken out of what it opened:
 * its focal point, its alt text and caption in both languages, and its
 * watermark.
 *
 * @param detail - The file as the API returned it.
 */
export function metadataDraftOf(detail: MediaDetail): SaveMediaMetadataBody {
  return {
    focalPoint: detail.focalPoint,
    translations: CONTENT_LANGUAGES.map((language) => ({ language, ...detail.translations[language] })),
    watermark: detail.watermark,
  };
}

/**
 * The descriptions as a save stores them.
 *
 * An alt text of exactly nothing marks the picture as decorative and is kept
 * as it is. Any other alt text and every caption are trimmed, and one that is
 * only blank becomes no text at all.
 *
 * @param value - The draft as the dialog holds it.
 */
export function storedMetadata(value: SaveMediaMetadataBody): SaveMediaMetadataBody {
  return {
    ...value,
    translations: value.translations.map((translation) => ({
      ...translation,
      altText:
        translation.altText === null || translation.altText === ""
          ? translation.altText
          : translation.altText.trim() || null,
      caption: translation.caption?.trim() || null,
    })),
  };
}

/**
 * Stores a file's descriptions, focal point and watermark, and waits for every
 * view of the library to be fetched again before it counts as done, so the
 * dialog closes onto the stored state.
 *
 * @param detail - The file being described.
 * @param reactions - What the dialog does once it is stored or has failed.
 * @returns The mutation, which takes the draft as the dialog holds it.
 */
export function useSaveMediaMetadata(
  detail: MediaDetail,
  reactions: Reactions<MediaDetail, SaveMediaMetadataBody>,
) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: SaveMediaMetadataBody) => api.saveMediaMetadata(detail.id, storedMetadata(value)),
    onError: (error) => reactions.onError?.(error),
    onSuccess: async (stored, value) => {
      await refreshMediaQueries(client);
      reactions.onSuccess?.(stored, value);
    },
  });
}

/**
 * Deletes a file. A refusal fetches the file again, because what refused it,
 * a use or its processing, is what the dialog then has to show.
 *
 * @param detail - The file to delete.
 * @param reactions - What the dialog does once it is deleted or has failed.
 */
export function useDeleteMedia(detail: MediaDetail, reactions: Reactions<MediaDeletionResult>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteMedia(detail.id),
    onError: (error) => {
      void client.invalidateQueries({ queryKey: queryKeys.mediaDetail(detail.id) });
      reactions.onError?.(error);
    },
    onSuccess: async (result) => {
      await refreshMediaQueries(client);
      reactions.onSuccess?.(result);
    },
  });
}

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

/**
 * The library's own upload queue: files go up one after another, each one's
 * failure stays in its progress, and the last file that arrived is handed on,
 * so the library opens it or the picker chooses it.
 *
 * @param onComplete - Receives the last file the library took.
 * @returns The progress of every file, whether an upload is running, and
 *   `start`, which ignores an empty choice and a second start while one runs.
 */
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

/**
 * One page of Unsplash photos for a search, through the API, which holds the
 * access key. Nothing is asked before something was searched for.
 *
 * @param search - What was searched for.
 * @param page - The page, counted from one.
 */
export function useUnsplashSearch(search: string, page: number) {
  const api = useDashboardApi();
  return useQuery({
    queryKey: queryKeys.unsplash(search, page),
    queryFn: () => api.searchUnsplash(search, page),
    enabled: search !== "",
    retry: false,
  });
}

/**
 * Takes one Unsplash photo into the library, which also tells Unsplash it was
 * used, and answers with the library picture it became, as an upload does.
 *
 * @param reactions - What the search does once the picture is in the library or has failed.
 * @returns The mutation, which takes the photo's id.
 */
export function useImportUnsplash(reactions: Reactions<MediaLibraryItem, string>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: string) => {
      const imported = await api.importUnsplash(photoId);
      const item = await api.fetchMediaDetail(imported.id);
      await refreshMediaQueries(client);
      return item;
    },
    onError: (error) => reactions.onError?.(error),
    onSuccess: (item, photoId) => reactions.onSuccess?.(item, photoId),
  });
}

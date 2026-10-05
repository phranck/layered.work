import { ACCEPTED_IMAGE_TYPES, type MediaLibraryItem } from "@layered/schemas";
import { Button } from "@layered/ui";
import { UploadSimpleIcon } from "@layered/ui/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";

type Progress = { id: number; name: string; percent: number; error?: unknown };
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
          await client.invalidateQueries({ queryKey: ["media"] });
          await client.invalidateQueries({ queryKey: ["account-media"] });
          await client.invalidateQueries({ queryKey: ["dashboard-counts"] });
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

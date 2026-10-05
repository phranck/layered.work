import { DashboardApiError } from "./api.js";

/** Use the browser's byte progress events for direct-to-storage uploads. */
export function uploadWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  local: boolean,
  progress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.withCredentials = local;
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        progress(100);
        resolve();
      } else reject(new DashboardApiError("uploadNotAccepted"));
    };
    xhr.onerror = () => reject(new DashboardApiError("uploadNotSent"));
    xhr.onabort = () => reject(new DashboardApiError("uploadNotSent"));
    xhr.send(file);
  });
}

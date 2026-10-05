import { afterEach, expect, it, vi } from "vitest";
import { uploadWithProgress } from "./upload-request.js";

class UploadRequest {
  static instances: UploadRequest[] = [];
  constructor() {
    UploadRequest.instances.push(this);
  }
  upload = { onprogress: (_event: { lengthComputable: boolean; loaded: number; total: number }) => {} };
  status = 200;
  withCredentials = false;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  onload = () => {};
  onerror = () => {};
  onabort = () => {};
}
afterEach(() => {
  vi.unstubAllGlobals();
  UploadRequest.instances = [];
});
function lastRequest() {
  const request = UploadRequest.instances.at(-1);
  if (!request) throw new Error("Upload did not create a request");
  return request;
}
it("reports byte progress and sends only the signed headers without cookies to object storage", async () => {
  vi.stubGlobal("XMLHttpRequest", UploadRequest);
  const progress = vi.fn();
  const file = new File(["bytes"], "picture.png");
  const sent = uploadWithProgress(
    "https://storage.example/signed",
    { "Content-Type": "image/png" },
    file,
    false,
    progress,
  );
  const xhr = lastRequest();
  expect(xhr.open).toHaveBeenCalledWith("PUT", "https://storage.example/signed");
  expect(xhr.withCredentials).toBe(false);
  expect(xhr.setRequestHeader).toHaveBeenCalledExactlyOnceWith("Content-Type", "image/png");
  expect(xhr.send).toHaveBeenCalledWith(file);
  xhr.upload.onprogress({ lengthComputable: true, loaded: 2, total: 5 });
  expect(progress).toHaveBeenCalledWith(40);
  xhr.onload();
  await sent;
  expect(progress).toHaveBeenLastCalledWith(100);
});
it("rejects failed storage responses instead of completing the upload", async () => {
  vi.stubGlobal("XMLHttpRequest", UploadRequest);
  const sent = uploadWithProgress(
    "/api/media/upload/local",
    {},
    new File(["bytes"], "picture.png"),
    true,
    () => {},
  );
  const xhr = lastRequest();
  expect(xhr.withCredentials).toBe(true);
  xhr.status = 403;
  xhr.onload();
  await expect(sent).rejects.toMatchObject({ key: "uploadNotAccepted" });
});

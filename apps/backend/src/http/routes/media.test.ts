import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The upload routes: who may use them, what they accept, and the local route
 * that receives the bytes outside production. The checking of what arrived is
 * tested in `media/upload.test.ts`; here it is replaced.
 */

const root = await mkdtemp(join(tmpdir(), "layered-upload-route-"));
const readSession = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => ({ createUpload: vi.fn(), completeUpload: vi.fn() }));

vi.mock("../../auth/session.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../auth/session.js")>()),
  readSession,
}));
vi.mock("../../media/upload.js", () => upload);
vi.mock("../../media/storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../media/storage.js")>()),
  storageMode: () => ({ kind: "local", root }),
}));

const { app } = await import("../app.js");
const { issueUploadToken } = await import("../../media/upload-token.js");

const userId = "0199f064-43b7-79a8-917f-eefc8c852497";
const principal = {
  userId,
  sessionId: "0199f064-43b7-79a8-917f-eefc8c852499",
  email: "editor@example.com",
  displayName: "Editor",
  role: "editor" as const,
};
const signedIn = { cookie: "layered_session=signed" };

function ask(body: unknown) {
  return app.request("/media/uploads", {
    method: "POST",
    headers: { ...signedIn, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let sequence = 0;
function tokenFor(size: number, owner = userId) {
  sequence += 1;
  const storageKey = `uploads/${String(sequence).padStart(22, "B")}`;
  return {
    storageKey,
    token: issueUploadToken({ storageKey, slug: "portrait", type: "image/png", size, userId: owner }),
  };
}

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the upload routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readSession.mockResolvedValue(principal);
  });

  it("refuses an upload request from somebody who is not signed in", async () => {
    readSession.mockResolvedValue(null);
    const response = await ask({ filename: "a.png", type: "image/png", size: 10 });
    expect(response.status).toBe(401);
    expect(upload.createUpload).not.toHaveBeenCalled();
  });

  it("refuses a name with a path in it, a type it does not take, a size past the limit and extra fields", async () => {
    for (const body of [
      { filename: "../a.png", type: "image/png", size: 10 },
      { filename: "a.svg", type: "image/svg+xml", size: 10 },
      { filename: "a.png", type: "image/png", size: 21 * 1024 * 1024 },
      { filename: "a.png", type: "image/png", size: 10, storageKey: "media/elsewhere" },
    ]) {
      expect((await ask(body)).status).toBe(400);
    }
    expect(upload.createUpload).not.toHaveBeenCalled();
  });

  it("asks for an upload on behalf of whoever is signed in", async () => {
    upload.createUpload.mockResolvedValue({ token: "a.b", url: "/media/uploads/a.b/content", headers: {} });
    const response = await ask({ filename: "Portrait.png", type: "image/png", size: 10 });
    expect(response.status).toBe(200);
    expect(upload.createUpload).toHaveBeenCalledWith(
      { filename: "Portrait.png", type: "image/png", size: 10 },
      userId,
    );
  });

  it("receives the bytes locally, past the API's usual body limit", async () => {
    const size = 2 * 1024 * 1024;
    const { token, storageKey } = tokenFor(size);
    const response = await app.request(`/media/uploads/${token}/content`, {
      method: "PUT",
      headers: { ...signedIn, "content-type": "image/png" },
      body: new Uint8Array(size),
    });
    expect(response.status).toBe(200);
    expect((await readFile(join(root, storageKey))).length).toBe(size);
  });

  it("refuses bytes sent as another type than the token says", async () => {
    const { token } = tokenFor(4);
    const response = await app.request(`/media/uploads/${token}/content`, {
      method: "PUT",
      headers: { ...signedIn, "content-type": "image/jpeg" },
      body: new Uint8Array(4),
    });
    expect(response.status).toBe(400);
  });

  it("refuses bytes for somebody else's upload", async () => {
    const { token } = tokenFor(4, "0199f064-43b7-79a8-917f-eefc8c852500");
    const response = await app.request(`/media/uploads/${token}/content`, {
      method: "PUT",
      headers: { ...signedIn, "content-type": "image/png" },
      body: new Uint8Array(4),
    });
    expect(response.status).toBe(400);
  });

  it("refuses more bytes than the token declares", async () => {
    const { token, storageKey } = tokenFor(4);
    const response = await app.request(`/media/uploads/${token}/content`, {
      method: "PUT",
      headers: { ...signedIn, "content-type": "image/png" },
      body: new Uint8Array(64),
    });
    expect(response.status).toBe(400);
    await expect(readFile(join(root, storageKey))).rejects.toThrow();
  });
});

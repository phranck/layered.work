import { accountMediaPage, accountProfile, ErrorCode, readApiError } from "@layered/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../logger.js";
import { REQUEST_ID_HEADER } from "../request-id.js";

const repository = vi.hoisted(() => ({
  getAccountMediaObject: vi.fn(),
  getAccountProfile: vi.fn(),
  listAccountMedia: vi.fn(),
  updateAccountProfile: vi.fn(),
}));
const storage = vi.hoisted(() => ({ readAccountMediaObject: vi.fn() }));
const readSession = vi.hoisted(() => vi.fn());

vi.mock("../../auth/session.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../auth/session.js")>()),
  readSession,
}));
vi.mock("../../account/repository.js", () => repository);
vi.mock("../../account/storage.js", () => storage);

const { app } = await import("../app.js");

const userId = "0199f064-43b7-79a8-917f-eefc8c852497";
const avatarMediaId = "0199f064-43b7-79a8-917f-eefc8c852498";
const principal = {
  userId,
  sessionId: "0199f064-43b7-79a8-917f-eefc8c852499",
  email: "editor@example.com",
  displayName: "Editor",
  role: "editor" as const,
};
const profile = {
  id: userId,
  email: "editor@example.com",
  displayName: "Editor",
  role: "editor" as const,
  interfaceLanguage: "en" as const,
  avatarMediaId,
  avatarUrl: `/api/account/media/${avatarMediaId}/content`,
};

describe("the account API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("refuses an unauthenticated request before reading account data", async () => {
    readSession.mockResolvedValue(null);

    const response = await app.request("/account");

    expect(response.status).toBe(401);
    expect(repository.getAccountProfile).not.toHaveBeenCalled();
  });

  it("returns the current account profile", async () => {
    readSession.mockResolvedValue(principal);
    repository.getAccountProfile.mockResolvedValue(profile);

    const response = await app.request("/account", { headers: { cookie: "layered_session=signed" } });
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(accountProfile.parse(body.data)).toEqual(profile);
    expect(repository.getAccountProfile).toHaveBeenCalledWith(expect.anything(), userId);
  });

  it("updates only the current account and returns the complete profile", async () => {
    readSession.mockResolvedValue(principal);
    const changed = { ...profile, displayName: "Frank", interfaceLanguage: "de" as const };
    repository.updateAccountProfile.mockResolvedValue(changed);

    const response = await app.request("/account", {
      method: "PATCH",
      headers: { cookie: "layered_session=signed", "content-type": "application/json" },
      body: JSON.stringify({
        displayName: " Frank ",
        email: "EDITOR@EXAMPLE.COM",
        interfaceLanguage: "de",
        avatarMediaId,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: changed });
    expect(repository.updateAccountProfile).toHaveBeenCalledWith(expect.anything(), userId, {
      displayName: "Frank",
      email: "editor@example.com",
      interfaceLanguage: "de",
      avatarMediaId,
    });
  });

  it("strictly refuses role and user id fields before updating", async () => {
    readSession.mockResolvedValue(principal);

    const response = await app.request("/account", {
      method: "PATCH",
      headers: { cookie: "layered_session=signed", "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Editor",
        email: "editor@example.com",
        interfaceLanguage: "en",
        avatarMediaId: null,
        role: "owner",
        userId: "0199f064-43b7-79a8-917f-eefc8c852500",
      }),
    });

    expect(response.status).toBe(400);
    expect(repository.updateAccountProfile).not.toHaveBeenCalled();
  });

  it("reports a duplicate email as a conflict without exposing database details", async () => {
    readSession.mockResolvedValue(principal);
    repository.updateAccountProfile.mockRejectedValue({
      name: "DrizzleQueryError",
      cause: {
        code: "23505",
        constraint_name: "users_email_unique",
        detail: "Key (email)=(taken@example.com) already exists.",
      },
    });

    const response = await app.request("/account", {
      method: "PATCH",
      headers: { cookie: "layered_session=signed", "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Editor",
        email: "taken@example.com",
        interfaceLanguage: "en",
        avatarMediaId: null,
      }),
    });
    const text = await response.text();

    expect(response.status).toBe(409);
    expect(readApiError(JSON.parse(text))?.code).toBe(ErrorCode.Conflict);
    expect(text).not.toContain("users_email_unique");
    expect(text).not.toContain("taken@example.com");
  });

  it("returns a real paginated raster-image library", async () => {
    readSession.mockResolvedValue(principal);
    const page = {
      items: [
        {
          id: avatarMediaId,
          slug: "portrait",
          url: `/api/account/media/${avatarMediaId}/content`,
          width: 800,
          height: 800,
        },
      ],
      page: 2,
      hasMore: true,
    };
    repository.listAccountMedia.mockResolvedValue(page);

    const response = await app.request("/account/media?search=port&page=2", {
      headers: { cookie: "layered_session=signed" },
    });
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(accountMediaPage.parse(body.data)).toEqual(page);
    expect(repository.listAccountMedia).toHaveBeenCalledWith(expect.anything(), { search: "port", page: 2 });
  });

  it("refuses an unreasonably large media page before querying", async () => {
    readSession.mockResolvedValue(principal);

    const response = await app.request("/account/media?page=1000001", {
      headers: { cookie: "layered_session=signed" },
    });

    expect(response.status).toBe(400);
    expect(repository.listAccountMedia).not.toHaveBeenCalled();
  });

  it("streams a stored raster image through the authenticated API with private headers", async () => {
    readSession.mockResolvedValue(principal);
    repository.getAccountMediaObject.mockResolvedValue({
      storageKey: "media/portrait.webp",
      mimeType: "image/webp",
    });
    storage.readAccountMediaObject.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
    );

    const response = await app.request(`/account/media/${avatarMediaId}/content`, {
      headers: { cookie: "layered_session=signed" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("content-security-policy")).toBeTruthy();
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(storage.readAccountMediaObject).toHaveBeenCalledWith("media/portrait.webp");
  });

  it("keeps storage failures behind the safe API error boundary", async () => {
    readSession.mockResolvedValue(principal);
    repository.getAccountMediaObject.mockResolvedValue({
      storageKey: "media/portrait.webp",
      mimeType: "image/webp",
    });
    storage.readAccountMediaObject.mockRejectedValue(new Error("S3 secret and endpoint details"));

    const response = await app.request(`/account/media/${avatarMediaId}/content`, {
      headers: { cookie: "layered_session=signed" },
    });
    const text = await response.text();
    const error = readApiError(JSON.parse(text));

    expect(response.status).toBe(500);
    expect(error?.id).toBe(response.headers.get(REQUEST_ID_HEADER));
    expect(text).not.toContain("S3 secret");
  });

  it("logs a correlated failure when the object stream fails after the response starts", async () => {
    readSession.mockResolvedValue(principal);
    repository.getAccountMediaObject.mockResolvedValue({
      storageKey: "media/portrait.webp",
      mimeType: "image/webp",
    });
    const streamFailure = new Error("stream connection closed");
    storage.readAccountMediaObject.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.error(streamFailure);
        },
      }),
    );
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);

    const response = await app.request(`/account/media/${avatarMediaId}/content`, {
      headers: { cookie: "layered_session=signed" },
    });
    await expect(response.arrayBuffer()).rejects.toBe(streamFailure);

    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: response.headers.get(REQUEST_ID_HEADER),
        errorId: response.headers.get(REQUEST_ID_HEADER),
        code: ErrorCode.Internal,
        status: 200,
        result: "stream_failed",
        err: streamFailure,
      }),
      "account media stream failed",
    );
  });
});

import { accountProfile, ErrorCode, readApiError } from "@layered/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../logger.js";
import { REQUEST_ID_HEADER } from "../request-id.js";

const repository = vi.hoisted(() => ({
  getAccountMediaObject: vi.fn(),
  getAccountProfile: vi.fn(),
  updateAccountProfile: vi.fn(),
}));
const storage = vi.hoisted(() => ({ readMediaObject: vi.fn() }));
const password = vi.hoisted(() => ({ changeAccountPassword: vi.fn() }));
const readSession = vi.hoisted(() => vi.fn());

vi.mock("../../auth/session.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../auth/session.js")>()),
  readSession,
}));
vi.mock("../../account/repository.js", () => repository);
vi.mock("../../media/storage.js", () => storage);
vi.mock("../../account/password.js", () => password);

const { app } = await import("../app.js");
const { forgetRateLimits } = await import("../rate-limit.js");
const { HttpError } = await import("../response.js");

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

  describe("changing the password", () => {
    const change = { currentPassword: "old secret", newPassword: "new secret" };
    const send = (body: unknown, cookie = "layered_session=signed") =>
      app.request("/account/password", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    beforeEach(() => forgetRateLimits());

    it("changes it for the session's own account, keeping that session", async () => {
      readSession.mockResolvedValue(principal);
      password.changeAccountPassword.mockResolvedValue({ otherSessionsEnded: 2 });
      const info = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);

      const response = await send(change);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: { otherSessionsEnded: 2 } });
      expect(password.changeAccountPassword).toHaveBeenCalledWith(
        expect.anything(),
        userId,
        principal.sessionId,
        change,
      );
      // Neither password reaches the log.
      expect(JSON.stringify(info.mock.calls)).not.toContain("secret");
    });

    it("refuses a wrong current password as forbidden, so the dashboard keeps its session", async () => {
      readSession.mockResolvedValue(principal);
      password.changeAccountPassword.mockRejectedValue(
        new HttpError(ErrorCode.Forbidden, "The current password is not correct."),
      );
      vi.spyOn(logger, "info").mockImplementation(() => undefined as never);

      const response = await send(change);

      expect(response.status).toBe(403);
      expect(readApiError(await response.json())?.code).toBe(ErrorCode.Forbidden);
    });

    it("refuses a body with a field it does not declare, or with an empty new password", async () => {
      readSession.mockResolvedValue(principal);

      expect((await send({ ...change, userId: "0199f064-43b7-79a8-917f-eefc8c852500" })).status).toBe(400);
      expect((await send({ ...change, newPassword: "" })).status).toBe(400);
      expect(password.changeAccountPassword).not.toHaveBeenCalled();
    });

    it("refuses an unauthenticated request before reading the body", async () => {
      readSession.mockResolvedValue(null);

      expect((await send(change)).status).toBe(401);
      expect(password.changeAccountPassword).not.toHaveBeenCalled();
    });

    it("stops guessing at the password in use after eight attempts", async () => {
      readSession.mockResolvedValue(principal);
      password.changeAccountPassword.mockRejectedValue(
        new HttpError(ErrorCode.Forbidden, "The current password is not correct."),
      );
      vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
      vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);

      const statuses = [];
      for (let attempt = 0; attempt < 9; attempt += 1) statuses.push((await send(change)).status);

      expect(statuses.slice(0, 8)).toEqual(Array(8).fill(403));
      expect(statuses[8]).toBe(429);
      expect(password.changeAccountPassword).toHaveBeenCalledTimes(8);
    });
  });

  it("streams a stored raster image through the authenticated API with private headers", async () => {
    readSession.mockResolvedValue(principal);
    repository.getAccountMediaObject.mockResolvedValue({
      storageKey: "media/portrait.webp",
      mimeType: "image/webp",
    });
    storage.readMediaObject.mockResolvedValue(
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
    expect(storage.readMediaObject).toHaveBeenCalledWith("media/portrait.webp");
  });

  it("keeps storage failures behind the safe API error boundary", async () => {
    readSession.mockResolvedValue(principal);
    repository.getAccountMediaObject.mockResolvedValue({
      storageKey: "media/portrait.webp",
      mimeType: "image/webp",
    });
    storage.readMediaObject.mockRejectedValue(new Error("S3 secret and endpoint details"));

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
    storage.readMediaObject.mockResolvedValue(
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

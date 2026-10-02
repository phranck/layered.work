import {
  type AccountMediaPage,
  type AccountProfile,
  accountMediaPage,
  accountProfile,
  createUploadBody,
  type DashboardCounts,
  dashboardCounts,
  type ErrorCode,
  readApiError,
  type SignedInAs,
  type SignInBody,
  signedInAs,
  type UpdateAccountBody,
  type UploadedMedia,
  updateAccountBody,
  uploadedMedia,
  uploadTicket,
} from "@layered/schemas";
import type { QueryClient } from "@tanstack/react-query";
import { type DashboardStringKey, ERROR_CODE_TEXT } from "./dashboard-i18n.js";

/**
 * A failure the dashboard can put in front of the reader.
 *
 * It carries a catalogue key rather than a sentence, so the notice that shows it
 * speaks the interface language. A failure the API returned also carries the
 * API's code, which a screen can branch on, and its request id, which is what a
 * log line is found by.
 */
export class DashboardApiError extends Error {
  /**
   * @param key - What the reader is told.
   * @param id - The request id of a failure the API returned.
   * @param code - The API's code for that failure.
   */
  constructor(
    readonly key: DashboardStringKey,
    readonly id?: string,
    readonly code?: ErrorCode,
  ) {
    super(key);
    this.name = "DashboardApiError";
  }
}

/** Anything that checks an unknown value and hands back a typed one, which every schema does. */
interface ResponseSchema<Value> {
  safeParse(value: unknown): { success: true; data: Value } | { success: false };
}

/** Everything the dashboard asks the API, in one place so a test can stand in for it. */
export interface DashboardApi {
  fetchSession(): Promise<SignedInAs | null>;
  fetchDashboardCounts(): Promise<DashboardCounts>;
  fetchAccount(): Promise<AccountProfile>;
  fetchAccountMedia(search: string, page: number): Promise<AccountMediaPage>;
  updateAccount(input: UpdateAccountBody): Promise<AccountProfile>;
  /**
   * Puts a file into the media library: asks for an upload, sends the bytes to
   * the address the answer names, and says it is done.
   *
   * @param file - What the reader chose.
   * @returns The library picture, which is an existing one when the same file
   *   was already there.
   */
  uploadMedia(file: File): Promise<UploadedMedia>;
  signIn(credentials: SignInBody): Promise<SignedInAs>;
  signOut(): Promise<void>;
}

/** The request options for a JSON body sent with the given method. */
function jsonBody(method: string, value: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) };
}

/**
 * The dashboard's client for the API.
 *
 * @param queryClient - Cleared when a protected request finds the session gone,
 *   so nothing signed-in stays on screen.
 * @param onSessionExpired - Called once per expiry, to send the reader to sign in.
 */
export function createDashboardApi(queryClient: QueryClient, onSessionExpired: () => void): DashboardApi {
  let expiryReported = false;

  async function request(path: string, init?: RequestInit, protectedRequest = false): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${__API_BASE__}${path}`, { credentials: "include", ...init });
    } catch {
      throw new DashboardApiError("serverUnreachable");
    }
    if (protectedRequest && response.status === 401) {
      queryClient.clear();
      if (!expiryReported) {
        expiryReported = true;
        onSessionExpired();
      }
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DashboardApiError("serverUnreadable");
    }
    if (!response.ok) {
      const failure = readApiError(body);
      throw failure
        ? new DashboardApiError(ERROR_CODE_TEXT[failure.code], failure.id, failure.code)
        : new DashboardApiError("serverUnexpected");
    }
    return body;
  }

  /**
   * The `data` of a successful answer, checked against what the route promises.
   *
   * @param body - The parsed answer.
   * @param schema - The shape `data` must have.
   */
  function dataOf<Value>(body: unknown, schema: ResponseSchema<Value>): Value {
    if (!body || typeof body !== "object" || !("data" in body)) throw new DashboardApiError("serverInvalid");
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) throw new DashboardApiError("serverInvalid");
    return parsed.data;
  }

  return {
    async fetchSession() {
      const body = await request("/auth/me", { cache: "no-store" });
      if (body && typeof body === "object" && "data" in body && body.data === null) return null;
      return dataOf(body, signedInAs);
    },
    async fetchDashboardCounts() {
      return dataOf(await request("/dashboard/counts", undefined, true), dashboardCounts);
    },
    async fetchAccount() {
      return dataOf(await request("/account", undefined, true), accountProfile);
    },
    async fetchAccountMedia(search, page) {
      const params = new URLSearchParams({ search, page: String(page) });
      return dataOf(await request(`/account/media?${params}`, undefined, true), accountMediaPage);
    },
    async updateAccount(input) {
      const sent = jsonBody("PATCH", updateAccountBody.parse(input));
      return dataOf(await request("/account", sent, true), accountProfile);
    },
    async uploadMedia(file) {
      const asked = createUploadBody.safeParse({ filename: file.name, type: file.type, size: file.size });
      if (!asked.success) throw new DashboardApiError("uploadRefused");
      const ticket = dataOf(
        await request("/media/uploads", jsonBody("POST", asked.data), true),
        uploadTicket,
      );

      // A path is this API's own route, which takes the session; anything else
      // is a presigned bucket address, which is authorised by its signature and
      // must not be sent the cookie.
      const local = ticket.url.startsWith("/");
      let sent: Response;
      try {
        sent = await fetch(local ? `${__API_BASE__}${ticket.url}` : ticket.url, {
          method: "PUT",
          headers: ticket.headers,
          body: file,
          credentials: local ? "include" : "omit",
        });
      } catch {
        throw new DashboardApiError("uploadNotSent");
      }
      if (!sent.ok) throw new DashboardApiError("uploadNotAccepted");

      return dataOf(
        await request("/media/uploads/complete", jsonBody("POST", { token: ticket.token }), true),
        uploadedMedia,
      );
    },
    async signIn(credentials) {
      const session = dataOf(await request("/auth/sign-in", jsonBody("POST", credentials)), signedInAs);
      expiryReported = false;
      return session;
    },
    async signOut() {
      await request("/auth/sign-out", { method: "POST" });
      expiryReported = false;
      queryClient.clear();
    },
  };
}

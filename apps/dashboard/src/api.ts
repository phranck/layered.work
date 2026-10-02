import {
  type AccountMediaPage,
  type AccountProfile,
  accountMediaPage,
  accountProfile,
  createUploadBody,
  type DashboardCounts,
  dashboardCounts,
  MAX_UPLOAD_BYTES,
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

export class DashboardApiError extends Error {
  constructor(
    message: string,
    readonly id?: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DashboardApiError";
  }
}

interface DataEnvelope {
  data: unknown;
}

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

export function createDashboardApi(queryClient: QueryClient, onSessionExpired: () => void): DashboardApi {
  let expiryReported = false;

  async function request(path: string, init?: RequestInit, protectedRequest = false): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${__API_BASE__}${path}`, { credentials: "include", ...init });
    } catch {
      throw new DashboardApiError("Der Server ist nicht erreichbar.");
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
      throw new DashboardApiError("Die Antwort des Servers konnte nicht gelesen werden.");
    }
    if (!response.ok) {
      const failure = readApiError(body);
      throw failure
        ? new DashboardApiError(failure.message, failure.id, failure.code)
        : new DashboardApiError("Der Server hat unerwartet geantwortet.");
    }
    return body;
  }

  function dataOf(body: unknown, invalidMessage: string): unknown {
    if (!body || typeof body !== "object" || !("data" in body)) throw new DashboardApiError(invalidMessage);
    return (body as DataEnvelope).data;
  }

  return {
    async fetchSession() {
      const data = dataOf(
        await request("/auth/me", { cache: "no-store" }),
        "Die Sitzungsantwort ist ungültig.",
      );
      if (data === null) return null;
      const parsed = signedInAs.safeParse(data);
      if (!parsed.success) throw new DashboardApiError("Die Sitzungsantwort ist ungültig.");
      return parsed.data;
    },
    async fetchDashboardCounts() {
      const data = dataOf(
        await request("/dashboard/counts", undefined, true),
        "Die Zahlenantwort ist ungültig.",
      );
      const parsed = dashboardCounts.safeParse(data);
      if (!parsed.success) throw new DashboardApiError("Die Zahlenantwort ist ungültig.");
      return parsed.data;
    },
    async fetchAccount() {
      const data = dataOf(await request("/account", undefined, true), "Die Kontoantwort ist ungültig.");
      const parsed = accountProfile.safeParse(data);
      if (!parsed.success) throw new DashboardApiError("Die Kontoantwort ist ungültig.");
      return parsed.data;
    },
    async fetchAccountMedia(search, page) {
      const params = new URLSearchParams({ search, page: String(page) });
      const data = dataOf(
        await request(`/account/media?${params}`, undefined, true),
        "Die Medienantwort ist ungültig.",
      );
      const parsed = accountMediaPage.safeParse(data);
      if (!parsed.success) throw new DashboardApiError("Die Medienantwort ist ungültig.");
      return parsed.data;
    },
    async updateAccount(input) {
      const body = updateAccountBody.parse(input);
      const data = dataOf(
        await request(
          "/account",
          { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
          true,
        ),
        "Die Kontoantwort ist ungültig.",
      );
      const parsed = accountProfile.safeParse(data);
      if (!parsed.success) throw new DashboardApiError("Die Kontoantwort ist ungültig.");
      return parsed.data;
    },
    async uploadMedia(file) {
      const asked = createUploadBody.safeParse({ filename: file.name, type: file.type, size: file.size });
      if (!asked.success) {
        throw new DashboardApiError(
          `Nur JPEG, PNG, WebP, AVIF und GIF bis ${MAX_UPLOAD_BYTES / 1024 / 1024} MB können hochgeladen werden.`,
        );
      }
      const ticket = uploadTicket.safeParse(
        dataOf(
          await request(
            "/media/uploads",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(asked.data),
            },
            true,
          ),
          "Die Upload-Antwort ist ungültig.",
        ),
      );
      if (!ticket.success) throw new DashboardApiError("Die Upload-Antwort ist ungültig.");

      // A path is this API's own route, which takes the session; anything else
      // is a presigned bucket address, which is authorised by its signature and
      // must not be sent the cookie.
      const local = ticket.data.url.startsWith("/");
      let sent: Response;
      try {
        sent = await fetch(local ? `${__API_BASE__}${ticket.data.url}` : ticket.data.url, {
          method: "PUT",
          headers: ticket.data.headers,
          body: file,
          credentials: local ? "include" : "omit",
        });
      } catch {
        throw new DashboardApiError("Die Datei konnte nicht gesendet werden.");
      }
      if (!sent.ok) throw new DashboardApiError("Die Datei wurde nicht angenommen.");

      const data = dataOf(
        await request(
          "/media/uploads/complete",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: ticket.data.token }),
          },
          true,
        ),
        "Die Upload-Antwort ist ungültig.",
      );
      const parsed = uploadedMedia.safeParse(data);
      if (!parsed.success) throw new DashboardApiError("Die Upload-Antwort ist ungültig.");
      return parsed.data;
    },
    async signIn(credentials) {
      const data = dataOf(
        await request("/auth/sign-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(credentials),
        }),
        "Die Anmeldeantwort ist ungültig.",
      );
      const parsed = signedInAs.safeParse(data);
      if (!parsed.success) throw new DashboardApiError("Die Anmeldeantwort ist ungültig.");
      expiryReported = false;
      return parsed.data;
    },
    async signOut() {
      await request("/auth/sign-out", { method: "POST" });
      expiryReported = false;
      queryClient.clear();
    },
  };
}

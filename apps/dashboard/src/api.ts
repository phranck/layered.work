import {
  type AccountMediaPage,
  type AccountProfile,
  accountMediaPage,
  accountProfile,
  type DashboardCounts,
  dashboardCounts,
  readApiError,
  type SignedInAs,
  type SignInBody,
  signedInAs,
  type UpdateAccountBody,
  updateAccountBody,
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

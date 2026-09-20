import {
  type DashboardCounts,
  dashboardCounts,
  readApiError,
  type SignedInAs,
  signedInAs,
} from "@layered/schemas";

export class DashboardApiError extends Error {
  constructor(
    message: string,
    readonly id?: string,
  ) {
    super(message);
    this.name = "DashboardApiError";
  }
}

async function get(path: string): Promise<unknown> {
  const response = await fetch(`${__API_ORIGIN__}${path}`, { credentials: "include" });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DashboardApiError("Die Antwort des Servers konnte nicht gelesen werden.");
  }
  if (!response.ok) {
    const failure = readApiError(body);
    throw failure
      ? new DashboardApiError(failure.message, failure.id)
      : new DashboardApiError("Der Server hat unerwartet geantwortet.");
  }
  return body;
}

export async function fetchSession(): Promise<SignedInAs | null> {
  const body = await get("/auth/me");
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new DashboardApiError("Die Sitzungsantwort ist ungültig.");
  }
  if (body.data === null) return null;
  const parsed = signedInAs.safeParse(body.data);
  if (!parsed.success) throw new DashboardApiError("Die Sitzungsantwort ist ungültig.");
  return parsed.data;
}

export async function fetchDashboardCounts(): Promise<DashboardCounts> {
  const body = await get("/dashboard/counts");
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new DashboardApiError("Die Zahlenantwort ist ungültig.");
  }
  const parsed = dashboardCounts.safeParse(body.data);
  if (!parsed.success) throw new DashboardApiError("Die Zahlenantwort ist ungültig.");
  return parsed.data;
}

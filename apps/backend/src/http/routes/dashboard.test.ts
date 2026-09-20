import { dashboardCounts, ErrorCode, readApiError } from "@layered/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_ID_HEADER } from "../request-id.js";
import { INTERNAL_MESSAGE } from "../response.js";

const { readDashboardCounts, readSession } = vi.hoisted(() => ({
  readDashboardCounts: vi.fn(),
  readSession: vi.fn(),
}));

vi.mock("../../auth/session.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../auth/session.js")>()),
  readSession,
}));

vi.mock("./dashboard-counts.js", () => ({ readDashboardCounts }));

const { app } = await import("../app.js");

const principal = {
  userId: "0199f064-43b7-79a8-917f-eefc8c852497",
  sessionId: "0199f064-43b7-79a8-917f-eefc8c852498",
  email: "editor@example.com",
  displayName: "Editor",
  role: "editor" as const,
};

const counts = {
  posts: 8,
  pages: 5,
  tags: 13,
  media: 21,
  blocks: 3,
  mainNav: 7,
  footerNav: 4,
  social: 6,
  forms: null,
  submissions: null,
  mailTemplates: null,
};

describe("GET /dashboard/counts", () => {
  beforeEach(() => {
    readSession.mockReset();
    readDashboardCounts.mockReset();
  });

  it("refuses an unauthenticated request before reading counts", async () => {
    readSession.mockResolvedValue(null);

    const response = await app.request("/dashboard/counts");
    const failure = readApiError(await response.json());

    expect(response.status).toBe(401);
    expect(failure?.code).toBe(ErrorCode.Unauthenticated);
    expect(readDashboardCounts).not.toHaveBeenCalled();
  });

  it("returns the stored row counts and marks unsupported domains unavailable", async () => {
    readSession.mockResolvedValue(principal);
    readDashboardCounts.mockResolvedValue(counts);

    const response = await app.request("/dashboard/counts", {
      headers: { cookie: "layered_session=signed-session" },
    });
    const body = (await response.json()) as { data: unknown };
    const parsed = dashboardCounts.parse(body.data);

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: counts });
    expect(parsed).toEqual(counts);
    expect(parsed.forms).toBeNull();
    expect(parsed.submissions).toBeNull();
    expect(parsed.mailTemplates).toBeNull();
  });

  it("turns a database failure into a safe error with a request id", async () => {
    readSession.mockResolvedValue(principal);
    readDashboardCounts.mockRejectedValue(
      new Error("select failed for postgres://admin:secret@database.internal/layered"),
    );

    const response = await app.request("/dashboard/counts", {
      headers: { cookie: "layered_session=signed-session" },
    });
    const failure = readApiError(await response.json());

    expect(response.status).toBe(500);
    expect(failure).toEqual({
      code: ErrorCode.Internal,
      message: INTERNAL_MESSAGE,
      id: response.headers.get(REQUEST_ID_HEADER),
    });
    expect(failure?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

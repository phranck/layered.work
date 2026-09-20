import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDashboardApi, DashboardApiError } from "./api.js";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => vi.stubGlobal("__API_BASE__", "/api"));
afterEach(() => vi.unstubAllGlobals());

describe("dashboard API authentication", () => {
  it("does not treat a rejected sign-in as an expired session", async () => {
    const expired = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ error: { code: "unauthenticated", message: "Anmeldung abgelehnt.", id: "login-1" } }, 401),
        ),
    );
    const api = createDashboardApi(new QueryClient(), expired);

    await expect(api.signIn({ email: "nobody@example.com", password: "wrong" })).rejects.toMatchObject({
      message: "Anmeldung abgelehnt.",
      id: "login-1",
    });
    expect(expired).not.toHaveBeenCalled();
  });

  it("clears cached identity and reports concurrent protected 401 responses once", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["session"], { id: "old" });
    const expired = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ error: { code: "unauthenticated", message: "Sitzung abgelaufen.", id: "expired-1" } }, 401),
        ),
    );
    const api = createDashboardApi(queryClient, expired);

    const results = await Promise.allSettled([api.fetchDashboardCounts(), api.fetchDashboardCounts()]);

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["session"])).toBeUndefined();
    expect(results[0]).toMatchObject({ reason: expect.any(DashboardApiError) });
  });

  it("expires the session even when a protected 401 has no readable JSON body", async () => {
    const expired = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    const api = createDashboardApi(new QueryClient(), expired);

    await expect(api.fetchDashboardCounts()).rejects.toThrow(
      "Die Antwort des Servers konnte nicht gelesen werden.",
    );
    expect(expired).toHaveBeenCalledTimes(1);
  });
});

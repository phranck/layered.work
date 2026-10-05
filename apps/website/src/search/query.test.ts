import { afterEach, expect, it, vi } from "vitest";
import { createRepository } from "../content/repository.js";
import { loadSearch, searchFailure } from "./query.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses the backend ranking and passes the language and paging without publishing bodies", async () => {
  vi.stubEnv("API_URL", "https://api.example.test");
  const fetch = vi.fn(async (_url: URL) =>
    Response.json({
      entries: [{ path: "/runners/", title: "Runners", kind: "post", language: "en" }],
      total: 1,
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await loadSearch({ q: "running", language: "en", page: 2, limit: 6 });
  expect(result.entries[0]?.title).toBe("Runners");
  const requested = new URL(String(fetch.mock.calls[0]?.[0]));
  expect(requested.pathname).toBe("/content/search");
  expect(requested.searchParams.get("language")).toBe("en");
  expect(requested.searchParams.get("page")).toBe("2");
});
it("preserves a backend error code, safe message and error id instead of treating failure as no matches", async () => {
  vi.stubEnv("API_URL", "https://api.example.test");
  vi.stubGlobal("fetch", async () =>
    Response.json(
      { error: { code: "internal", message: "Search failed safely.", id: "search-probe" } },
      { status: 500 },
    ),
  );
  try {
    await loadSearch({ q: "running", language: "en", page: 1, limit: 6 });
    throw new Error("Expected failure");
  } catch (error) {
    const failure = searchFailure(error);
    expect(failure.errorId).toBe("search-probe");
    expect(failure.code).toBe("internal");
  }
});
it("uses only public snapshot data when deliberately rendered without an API", async () => {
  vi.stubEnv("API_URL", "");
  const base = {
    id: "test",
    title: "Runners",
    slug: "runners",
    path: "/runners/",
    language: "en",
    kind: "post",
    body: "running",
    publishedAt: null,
    updatedAt: null,
    topics: [],
  };
  const repository = createRepository({
    entries: [{ ...base, visibility: "hidden" }],
    media: [],
    topics: [],
    redirects: [],
  });
  expect(await loadSearch({ q: "running", language: "en", page: 1, limit: 6 }, repository)).toEqual({
    entries: [],
    total: 0,
  });
});

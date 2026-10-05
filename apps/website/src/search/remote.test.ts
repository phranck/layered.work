import { afterEach, expect, it, vi } from "vitest";
import { createRemoteSearch } from "./remote.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("debounces typing and prevents an older response replacing a newer query", async () => {
  vi.useFakeTimers();
  const responses: ((value: Response) => void)[] = [];
  const fetch = vi.fn(
    (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<Response>((resolve) => responses.push(resolve)),
  );
  vi.stubGlobal("fetch", fetch);
  const show = vi.fn();
  const search = createRemoteSearch("/search.json", show, vi.fn());
  search("old");
  await vi.advanceTimersByTimeAsync(250);
  search("new");
  await vi.advanceTimersByTimeAsync(250);
  responses[1]?.(
    Response.json({ entries: [{ title: "New", path: "/new/", kind: "post", language: "en" }], total: 1 }),
  );
  await vi.advanceTimersByTimeAsync(0);
  responses[0]?.(
    Response.json({ entries: [{ title: "Old", path: "/old/", kind: "post", language: "en" }], total: 1 }),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(show).toHaveBeenCalledOnce();
  expect(show.mock.calls[0]?.[0].entries[0].title).toBe("New");
  expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});
it("clears empty queries without a request and preserves upstream error identifiers", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () =>
    Response.json({ error: { code: "internal", message: "Unavailable", id: "probe" } }, { status: 500 }),
  );
  vi.stubGlobal("fetch", fetch);
  const show = vi.fn();
  const fail = vi.fn();
  const search = createRemoteSearch("/search.json", show, fail);
  search(" ");
  await vi.advanceTimersByTimeAsync(250);
  expect(fetch).not.toHaveBeenCalled();
  search("model");
  await vi.advanceTimersByTimeAsync(250);
  expect(fail).toHaveBeenCalledWith(expect.objectContaining({ code: "internal", id: "probe" }));
});

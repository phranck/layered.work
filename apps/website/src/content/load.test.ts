import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetLoadedContent, loadContent } from "./load.js";

/**
 * Where the content comes from, and what happens when it does not come.
 *
 * The fallback is the whole subject. A site that shows the file when the
 * backend is down is working; one that shows an error page because the backend
 * is down has made a working answer unavailable for no reason.
 */

const snapshotFile = fileURLToPath(new URL("../../content/site.json", import.meta.url));
const snapshot = JSON.parse(readFileSync(snapshotFile, "utf8"));

/** The same snapshot with one title changed, so it is telling which one arrived. */
const fromDatabase = {
  ...snapshot,
  entries: snapshot.entries.map((entry: { title: string }, index: number) =>
    index === 0 ? { ...entry, title: "Written in the database" } : entry,
  ),
};

describe("loading the site's content", () => {
  beforeEach(() => {
    forgetLoadedContent();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("WEBSITE_CONTENT_FILE", snapshotFile);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    forgetLoadedContent();
  });

  it("reads the backend when it answers", async () => {
    vi.stubEnv("API_URL", "http://backend.test:3000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fromDatabase), { status: 200 })),
    );

    const repository = await loadContent();

    expect(repository.data.entries[0]?.title).toBe("Written in the database");
  });

  it("reads the file when no backend is configured", async () => {
    const repository = await loadContent();

    expect(repository.data.entries[0]?.title).toBe(snapshot.entries[0].title);
  });

  it("reads the file when the backend refuses", async () => {
    vi.stubEnv("API_URL", "http://backend.test:3000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 503 })),
    );

    const repository = await loadContent();

    expect(repository.data.entries[0]?.title).toBe(snapshot.entries[0].title);
  });

  it("reads the file when the backend cannot be reached at all", async () => {
    vi.stubEnv("API_URL", "http://backend.test:3000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );

    const repository = await loadContent();

    expect(repository.data.entries[0]?.title).toBe(snapshot.entries[0].title);
  });

  it("reads the file when the backend answers with nothing", async () => {
    vi.stubEnv("API_URL", "http://backend.test:3000");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ entries: [], topics: [], media: [], redirects: [] }), {
            status: 200,
          }),
      ),
    );

    const repository = await loadContent();

    expect(repository.data.entries).not.toHaveLength(0);
    expect(repository.data.entries[0]?.title).toBe(snapshot.entries[0].title);
  });

  it("refuses when there is no source at all", async () => {
    vi.stubEnv("WEBSITE_CONTENT_FILE", "");

    await expect(loadContent()).rejects.toThrow(/nothing to render/);
  });

  it("asks once for several renders", async () => {
    vi.stubEnv("API_URL", "http://backend.test:3000");
    const fetched = vi.fn(async () => new Response(JSON.stringify(fromDatabase), { status: 200 }));
    vi.stubGlobal("fetch", fetched);

    await loadContent();
    await loadContent();
    await loadContent();

    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("asks once for several renders that arrive together", async () => {
    vi.stubEnv("API_URL", "http://backend.test:3000");
    const fetched = vi.fn(async () => new Response(JSON.stringify(fromDatabase), { status: 200 }));
    vi.stubGlobal("fetch", fetched);

    await Promise.all([loadContent(), loadContent(), loadContent()]);

    expect(fetched).toHaveBeenCalledTimes(1);
  });
});

describe("content that has been held for a while", () => {
  /** The same snapshot with its first title changed again, which a later fetch brings. */
  const edited = {
    ...fromDatabase,
    entries: fromDatabase.entries.map((entry: { title: string }, index: number) =>
      index === 0 ? { ...entry, title: "Edited since" } : entry,
    ),
  };

  beforeEach(() => {
    forgetLoadedContent();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubEnv("WEBSITE_CONTENT_FILE", snapshotFile);
    vi.stubEnv("API_URL", "http://backend.test:3000");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    forgetLoadedContent();
  });

  /** Answers the first fetch with the database's snapshot and every later one with the edited one. */
  function backendThatChanges() {
    const fetched = vi.fn();
    fetched.mockImplementation(
      async () =>
        new Response(JSON.stringify(fetched.mock.calls.length > 1 ? edited : fromDatabase), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetched);
    return fetched;
  }

  it("answers at once from what it holds, and fetches newer content behind the render", async () => {
    const fetched = backendThatChanges();
    await loadContent();

    vi.advanceTimersByTime(31_000);
    const answered = await loadContent();

    expect(answered.data.entries[0]?.title).toBe("Written in the database");
    expect(fetched).toHaveBeenCalledTimes(2);
    await vi.waitFor(async () => expect((await loadContent()).data.entries[0]?.title).toBe("Edited since"));
  });

  it("waits for newer content once what it holds is too old to show", async () => {
    backendThatChanges();
    await loadContent();

    vi.advanceTimersByTime(6 * 60_000);
    const answered = await loadContent();

    expect(answered.data.entries[0]?.title).toBe("Edited since");
  });
});

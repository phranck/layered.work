import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRepository } from "./repository.js";

/**
 * The file the deployment reads, checked as the deployment will read it.
 *
 * It is written by a script on one machine and committed, so nothing between
 * here and production looks at it again. These are the questions that would
 * otherwise be answered by somebody noticing a draft on the live site.
 */
const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../content/site.json", import.meta.url)), "utf8"),
);

describe("the published snapshot", () => {
  it("carries only entries a reader may reach", () => {
    const states = [...new Set(snapshot.entries.map((entry: { visibility: string }) => entry.visibility))];
    expect(states.sort()).toEqual(["hidden", "public"]);
  });

  it("names no password, because nothing in it is behind one", () => {
    expect(JSON.stringify(snapshot)).not.toMatch(/passwordHash/);
  });

  it("is a snapshot the site can actually load", () => {
    const repository = createRepository(snapshot);
    expect(repository.publicEntries("en").length).toBeGreaterThan(0);
    expect(repository.topics("en").length).toBeGreaterThan(0);
  });

  it("keeps every redirect pointing at something it carries", () => {
    const repository = createRepository(snapshot);
    for (const redirect of snapshot.redirects as { source: string; target: string }[]) {
      // A target is either an entry in this file or one of the site's own
      // sections. Anything else is a redirect into a 404.
      const reachable =
        repository.entry(redirect.target) !== undefined ||
        /^\/(de\/)?(posts|projects|topics|archive|search)?\/$/.test(redirect.target);
      expect(reachable, `${redirect.source} points at ${redirect.target}`).toBe(true);
    }
  });
});

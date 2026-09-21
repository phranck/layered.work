import { describe, expect, it } from "vitest";
import { jsonFeed, rssFeed } from "./feeds.js";
import { createRepository } from "./repository.js";

describe("public feeds", () => {
  const repository = createRepository({
    topics: [],
    media: [],
    redirects: [],
    entries: ["public", "hidden", "draft", "protected", "trashed"].map((visibility, id) => ({
      id,
      title: `${visibility} <title>`,
      slug: visibility,
      path: `/${visibility}/`,
      language: "en",
      visibility,
      kind: "post",
      publishedAt: "2026-01-01T00:00:00Z",
      updatedAt: null,
      body: "Text & more",
      topics: [],
    })),
  });
  it("uses only public entries for both formats", () => {
    expect(jsonFeed(repository).items.map((item) => item.id)).toEqual(["https://layered.work/public/"]);
    expect(rssFeed(repository)).not.toMatch(/hidden|draft|protected|trashed/);
  });
  it("escapes XML text and preserves canonical English URLs", () => {
    expect(rssFeed(repository)).toContain("public &lt;title&gt;");
    expect(rssFeed(repository)).toContain("Text &amp; more");
    expect(rssFeed(repository)).toContain("<link>https://layered.work/public/</link>");
  });
});

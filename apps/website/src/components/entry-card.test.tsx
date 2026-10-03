import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Entry } from "../content/repository.js";
import { EntryCard } from "./entry-card.js";

const english: Entry = {
  id: 1,
  title: "On a Raspberry Pi",
  slug: "on-a-raspberry-pi",
  path: "/on-a-raspberry-pi/",
  language: "en",
  visibility: "public",
  kind: "post",
  publishedAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
  summary: "A summary.",
  body: "",
  topics: [],
  featured: false,
  onHomePage: true,
  readingWidth: "normal",
  showInOtherLanguage: true,
  specs: [],
};

describe("an entry card", () => {
  it("marks an entry in another language than the page's with its language", () => {
    const markup = renderToStaticMarkup(<EntryCard entry={english} language="de" />);
    expect(markup).toContain('lang="en"');
    expect(markup).toMatch(/<span class="lang-tag" data-language="en" title="Englisch">en<\/span>/);
  });

  it("marks nothing on a page in the entry's own language", () => {
    const markup = renderToStaticMarkup(<EntryCard entry={english} language="en" />);
    expect(markup).not.toContain("lang-tag");
    expect(markup).not.toContain('lang="en"');
  });
});

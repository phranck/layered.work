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
  it("uses the library crop anchor", () => {
    const markup = renderToStaticMarkup(
      <EntryCard
        entry={english}
        image={{ slug: "focal", src: "/uploads/focal", focalPoint: { x: 0.2, y: 0.8 } }}
      />,
    );
    expect(markup).toContain("object-position:20% 80%");
  });
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

  it("shows a topic's localized name and marks an English fallback", () => {
    const markup = renderToStaticMarkup(
      <EntryCard
        entry={{ ...english, topics: ["1"] }}
        language="de"
        topics={[{ id: "1", name: "Hardware", slug: "hardware", sourceLanguage: "en", untranslated: true }]}
      />,
    );
    expect(markup).toContain("Hardware");
    expect(markup).toContain('class="lang-tag" title="English">EN</span>');
    expect(markup).not.toContain('class="chip">1</span>');
  });
});

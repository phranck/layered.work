import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { referencedFormNames, renderContent } from "@layered/content";
import { describe, expect, it } from "vitest";
import { createRepository } from "./repository.js";

/**
 * The file the deployment falls back to, checked as the deployment will read it.
 *
 * `db:snapshot` writes it from the local database, and nothing between here and
 * production looks at it again. These are the questions that would otherwise be
 * answered by somebody noticing a draft on the live site. Each one is a property
 * every regenerated file has to keep, not a fact of the day it was written.
 */
const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../content/site.json", import.meta.url)), "utf8"),
);

type Topic = {
  id: string;
  translations: Record<"en" | "de", { slug: string; name: string } | null>;
};

describe("the published snapshot", () => {
  it("carries only entries a reader may reach", () => {
    for (const entry of snapshot.entries as { path: string; visibility: string }[]) {
      expect(["public", "hidden"], entry.path).toContain(entry.visibility);
    }
  });

  it("names no password, because nothing in it is behind one", () => {
    expect(JSON.stringify(snapshot)).not.toMatch(/passwordHash/);
  });

  it("is a snapshot the site can actually load", () => {
    const repository = createRepository(snapshot);
    expect(repository.publicEntries("en").length).toBeGreaterThan(0);
    expect(repository.topics("en").length).toBeGreaterThan(0);
  });

  it("carries the declaration of every form an entry embeds", () => {
    const repository = createRepository(snapshot);
    for (const entry of snapshot.entries as { path: string; body: string }[]) {
      for (const name of referencedFormNames(renderContent(entry.body))) {
        expect(repository.form(name), `${entry.path} embeds ${name}`).toBeDefined();
      }
    }
  });

  it("embeds YouTube through its component and never as a link to the player", () => {
    for (const entry of snapshot.entries as { path: string; body: string }[]) {
      expect(entry.body, entry.path).not.toMatch(/\]\(https:\/\/www\.youtube\.com\/embed\//);
    }
  });

  it("names every topic in a language, and gives entries only topics it carries", () => {
    const ids = new Set((snapshot.topics as Topic[]).map((topic) => topic.id));
    for (const topic of snapshot.topics as Topic[]) {
      const named = Object.values(topic.translations).filter((translation) => translation !== null);
      expect(named.length, topic.id).toBeGreaterThan(0);
      for (const translation of named) {
        expect(translation?.slug, topic.id).toBeTruthy();
        expect(translation?.name, topic.id).toBeTruthy();
      }
    }
    for (const entry of snapshot.entries as { path: string; topics: string[] }[]) {
      for (const id of entry.topics) expect(ids.has(id), `${entry.path} names topic ${id}`).toBe(true);
    }
  });

  it("keeps every redirect pointing at something it carries", () => {
    const repository = createRepository(snapshot);
    const topicPages = new Set(
      (snapshot.topics as Topic[]).flatMap((topic) =>
        (["en", "de"] as const).flatMap((language) => {
          const translation = topic.translations[language];
          return translation ? [`${language === "de" ? "/de" : ""}/topics/${translation.slug}/`] : [];
        }),
      ),
    );
    for (const redirect of snapshot.redirects as { source: string; target: string }[]) {
      // A target is an entry in this file, a topic page it names, or one of the
      // site's own sections. Anything else is a redirect into a 404.
      const reachable =
        repository.entry(redirect.target) !== undefined ||
        topicPages.has(redirect.target) ||
        /^\/(de\/)?(posts|projects|topics|search)?\/$/.test(redirect.target);
      expect(reachable, `${redirect.source} points at ${redirect.target}`).toBe(true);
    }
  });

  // A cell with nothing in it is what this catches. It leaves no node behind, so
  // a renderer counting nodes drops the column and everything right of it moves
  // one place left, which reads as a table whose figures belong to the wrong
  // heading rather than as something broken.
  it("gives every row of every table as many cells as its heading has", async () => {
    type Node = { kind: string; tag?: string; children?: Node[] };
    const tablesIn = (nodes: Node[]): Node[] =>
      nodes.flatMap((node) => (node.tag === "table" ? [node] : tablesIn(node.children ?? [])));

    for (const entry of snapshot.entries as { slug: string; body: string }[]) {
      if (!entry.body.includes("|")) continue;
      for (const [index, table] of tablesIn(renderContent(entry.body)).entries()) {
        const rows = (table.children ?? []).flatMap((part) => part.children ?? []);
        const widths = [...new Set(rows.map((row) => (row.children ?? []).length))];
        expect(widths, `${entry.slug}, table ${index + 1}`).toHaveLength(1);
      }
    }
  });
});

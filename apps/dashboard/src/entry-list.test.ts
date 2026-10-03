import type { EntryListItem } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { countEntries, filterEntries } from "./entry-list.js";

function row(overrides: Partial<EntryListItem>): EntryListItem {
  return {
    id: crypto.randomUUID(),
    entryId: crypto.randomUUID(),
    title: "Untitled",
    state: "public",
    language: "en",
    date: "2025-01-01T00:00:00.000Z",
    thumbnailUrl: null,
    translated: false,
    topics: [],
    trashed: false,
    ...overrides,
  };
}

const rows = [
  row({ title: "NeXTSTEP on a Raspberry Pi", translated: true }),
  row({ title: "NeXTSTEP auf einem Raspberry Pi", language: "de", state: "hidden", translated: true }),
  row({ title: "A draft about soldering", state: "draft", topics: ["Electronics"] }),
];

describe("filtering an entry list", () => {
  it("finds a word anywhere in the title, whatever its case", () => {
    expect(filterEntries(rows, { search: "raspberry", state: "all", language: "all" })).toHaveLength(2);
    expect(filterEntries(rows, { search: "  SOLDER ", state: "all", language: "all" })).toHaveLength(1);
  });

  it("finds an entry by the name of one of its topics", () => {
    const found = filterEntries(rows, { search: "electro", state: "all", language: "all" });
    expect(found.map((entry) => entry.title)).toEqual(["A draft about soldering"]);
  });

  it("narrows by state and by language together", () => {
    const found = filterEntries(rows, { search: "", state: "hidden", language: "de" });
    expect(found.map((entry) => entry.title)).toEqual(["NeXTSTEP auf einem Raspberry Pi"]);
    expect(filterEntries(rows, { search: "", state: "hidden", language: "en" })).toEqual([]);
  });
});

describe("the trash in an entry list", () => {
  const inTrash = [...rows, row({ title: "Thrown away", trashed: true })];

  it("is left out of every choice but its own", () => {
    expect(filterEntries(inTrash, { search: "", state: "all", language: "all" })).toHaveLength(3);
    expect(filterEntries(inTrash, { search: "", state: "public", language: "all" })).toHaveLength(1);
  });

  it("is all the trash filter shows", () => {
    const found = filterEntries(inTrash, { search: "", state: "trash", language: "all" });
    expect(found.map((entry) => entry.title)).toEqual(["Thrown away"]);
  });
});

describe("the figures above an entry list", () => {
  it("count the rows they are given and nothing else", () => {
    expect(countEntries(rows)).toEqual({ published: 1, drafts: 1, hidden: 1, translated: 2, total: 3 });
    const shown = filterEntries(rows, { search: "", state: "all", language: "en" });
    expect(countEntries(shown)).toEqual({ published: 1, drafts: 1, hidden: 0, translated: 1, total: 2 });
  });
});

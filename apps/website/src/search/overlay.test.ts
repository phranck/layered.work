import { describe, expect, it } from "vitest";
import { findEntries, type SearchIndexEntry } from "./overlay.js";

const item = (title: string, text: string, path = `/${title.toLowerCase()}/`): SearchIndexEntry => ({
  path,
  title,
  kind: "post",
  text: `${title} ${text}`.toLowerCase(),
});
const index = [
  item("Soundbox", "a small amplifier board"),
  item("Keyboard", "the soundbox sits beside it"),
  item("Dock", "a tiltable stand"),
];

describe("overlay search", () => {
  it("returns nothing until something is typed", () => {
    expect(findEntries(index, "")).toEqual([]);
    expect(findEntries(index, "   ")).toEqual([]);
  });
  it("matches title and body, regardless of case", () => {
    expect(findEntries(index, "SOUNDBOX").map((entry) => entry.title)).toEqual(["Soundbox", "Keyboard"]);
    expect(findEntries(index, "tiltable").map((entry) => entry.title)).toEqual(["Dock"]);
  });
  it("puts a title match ahead of a body match", () => {
    expect(findEntries(index, "soundbox")[0]?.title).toBe("Soundbox");
  });
  it("holds the list to the limit it is given", () => {
    expect(findEntries(index, "a", 2)).toHaveLength(2);
  });
});

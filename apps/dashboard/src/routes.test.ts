import { ENTRY_KINDS, LISTED_KINDS, LISTING_GROUP } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { entryArea, entryPath, settingsGroupArea } from "./routes.js";

describe("the areas derived from the sidebar's registry", () => {
  it("have an area listing every kind of entry, where its translations open", () => {
    for (const kind of ENTRY_KINDS) {
      expect(entryArea(kind).entryKind).toBe(kind);
      expect(entryPath(kind, "translation")).toBe(`/${entryArea(kind).path}/translation`);
    }
  });

  it("set up each overview on the list of the kind it lists, and the site on its own screen", () => {
    for (const kind of LISTED_KINDS) expect(settingsGroupArea(LISTING_GROUP[kind]).entryKind).toBe(kind);
    expect(settingsGroupArea("site").id).toBe("settings");
  });
});

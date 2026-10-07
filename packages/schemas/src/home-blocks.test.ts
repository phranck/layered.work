import { describe, expect, it } from "vitest";
import {
  HOME_BLOCKS,
  homeBlockSettings,
  homeBlockSettingsSchema,
  homeBlockText,
  homeBlockTypes,
} from "./home-blocks.js";

/**
 * What a home page block can be set to, read from its declaration.
 *
 * The API, the dashboard and the site all read the same declaration, so what
 * is tested here is what each of them refuses and what each of them fills in.
 */

describe("the declarations", () => {
  it("give every setting of a type its own key", () => {
    for (const type of homeBlockTypes) {
      const keys = HOME_BLOCKS[type].settings.map((setting) => setting.key);
      expect(new Set(keys).size, type).toBe(keys.length);
    }
  });

  it("keep every default inside what the setting accepts", () => {
    for (const type of homeBlockTypes) {
      expect(homeBlockSettingsSchema(type).safeParse(homeBlockSettings(type, {})).success, type).toBe(true);
    }
  });

  it("lock the hero alone, which opens the page", () => {
    expect(homeBlockTypes.filter((type) => HOME_BLOCKS[type].locked)).toEqual(["hero"]);
  });
});

describe("saving a block's settings", () => {
  const settings = homeBlockSettings("post_grid", {});

  it("accepts every declared value", () => {
    const parsed = homeBlockSettingsSchema("post_grid").safeParse({
      ...settings,
      title: { en: "Latest", de: "Neueste" },
      limit: 9,
      order: "title",
      excludeFeatured: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a value outside the permitted set and names the setting", () => {
    const parsed = homeBlockSettingsSchema("post_grid").safeParse({ ...settings, order: "sideways" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path[0])).toEqual(["order"]);
  });

  it("refuses a number outside the declared range", () => {
    for (const limit of [0, 25, 2.5])
      expect(homeBlockSettingsSchema("post_grid").safeParse({ ...settings, limit }).success, `${limit}`).toBe(
        false,
      );
  });

  it("refuses a setting the type does not declare", () => {
    expect(homeBlockSettingsSchema("post_grid").safeParse({ ...settings, color: "red" }).success).toBe(false);
  });

  it("takes a picture as the id of a file and nothing else", () => {
    const hero = homeBlockSettings("hero", {});
    expect(
      homeBlockSettingsSchema("hero").safeParse({ ...hero, picture: "00000000-0000-4000-8000-000000000001" })
        .success,
    ).toBe(true);
    expect(homeBlockSettingsSchema("hero").safeParse({ ...hero, picture: "a-slug" }).success).toBe(false);
  });
});

describe("reading a block's settings", () => {
  it("fills what is missing, replaces what no longer fits and drops what is not declared", () => {
    expect(homeBlockSettings("post_grid", { limit: 99, order: "title", color: "red" })).toEqual({
      title: { en: "", de: "" },
      limit: 6,
      order: "title",
      excludeFeatured: false,
      sky: false,
    });
  });

  it("reads every kind of block stored before the sky existed with the sky off", () => {
    for (const type of homeBlockTypes) expect(homeBlockSettings(type, {}).sky, type).toBe(false);
  });

  it("reads a picture the snapshot names by its slug", () => {
    expect(homeBlockSettings("hero", { picture: "front-panel" }).picture).toBe("front-panel");
  });

  it("shows the fallback text where nothing was written, in each language", () => {
    const settings = homeBlockSettings("topic_bar", { title: { en: "Topics", de: " " } });
    expect(homeBlockText("topic_bar", settings, "title", "en")).toBe("Topics");
    expect(homeBlockText("topic_bar", settings, "title", "de")).toBe("Themen im Archiv");
  });
});

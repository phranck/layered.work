import { describe, expect, it } from "vitest";
import { addressPrefix, finishedSlug, isSavableSlug, typedSlug } from "./address-field.js";

describe("an address being typed", () => {
  it("becomes a slug as it is typed, keeping a hyphen at the end for the next word", () => {
    expect(typedSlug("Über Lötkolben")).toBe("ueber-loetkolben");
    expect(typedSlug("my-")).toBe("my-");
    expect(typedSlug("my ")).toBe("my-");
    expect(typedSlug("   ")).toBe("");
  });

  it("is finished when the field is left, and an empty one takes the title's slug", () => {
    expect(finishedSlug("my-", "A title")).toBe("my");
    expect(finishedSlug("", "A Title")).toBe("a-title");
  });

  it("can be saved only once it is a whole slug", () => {
    expect(isSavableSlug("my-post")).toBe(true);
    expect(isSavableSlug("my-")).toBe(false);
    expect(isSavableSlug("")).toBe(false);
  });
});

describe("the fixed part of an address", () => {
  it("is everything before the last segment, or the language for an entry without an address", () => {
    expect(addressPrefix("/projects/next-soundbox/", "en")).toBe("/projects/");
    expect(addressPrefix("/some-post/", "en")).toBe("/");
    expect(addressPrefix(null, "de")).toBe("/de/");
  });
});

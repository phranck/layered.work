import { describe, expect, it } from "vitest";
import { mediaReferences } from "./references.js";

describe("finding the files a document names", () => {
  it("finds a name written first and one written under its parameter", () => {
    const text = 'Video("assembly", poster: "assembly-still")';
    const found = mediaReferences(text);

    expect(found.map((reference) => reference.slug)).toEqual(["assembly", "assembly-still"]);
    expect(found.map((reference) => text.slice(reference.from, reference.to))).toEqual([
      '"assembly"',
      '"assembly-still"',
    ]);
  });

  it("finds names nested inside another component's body", () => {
    const found = mediaReferences('Gallery(columns: 2) {\n  Image("front")\n  Image("back")\n}');
    expect(found.map((reference) => reference.slug)).toEqual(["front", "back"]);
  });

  it("does not take a caption for a file, however much it looks like one", () => {
    const found = mediaReferences('Image("workbench", caption: "front-view")');
    expect(found.map((reference) => reference.slug)).toEqual(["workbench"]);
  });

  it("ignores prose, code and components nobody has heard of", () => {
    const text = 'Image("front") is how.\n\n```\nImage("example")\n```\n\nWidget("nothing")';
    expect(mediaReferences(text).map((reference) => reference.slug)).toEqual(["front"]);
  });
});

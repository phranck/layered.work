import { describe, expect, it } from "vitest";
import { placesIn } from "./position.js";

/**
 * Where an offset falls.
 *
 * The cases here are the ones a search gets wrong: the very first character,
 * the character that begins a line, the one that ends the document, and a blank
 * line, which is a line with nothing on it and still a line.
 */

describe("a document of several lines", () => {
  const text = "one\ntwo\n\nfour";
  const place = placesIn(text);

  it("starts at line one, column one", () => {
    expect(place(0)).toEqual({ line: 1, column: 1 });
  });

  it("counts columns within a line", () => {
    expect(place(2)).toEqual({ line: 1, column: 3 });
  });

  it("puts a line break at the end of the line it ends", () => {
    expect(place(3)).toEqual({ line: 1, column: 4 });
  });

  it("starts the next line at its first character", () => {
    expect(place(4)).toEqual({ line: 2, column: 1 });
  });

  it("counts a blank line", () => {
    expect(place(8)).toEqual({ line: 3, column: 1 });
  });

  it("finds the last line", () => {
    expect(place(text.indexOf("four"))).toEqual({ line: 4, column: 1 });
  });

  it("reports the end of the document as the end of its last line", () => {
    expect(place(text.length)).toEqual({ line: 4, column: 5 });
  });

  it("reports anything past the end as the end", () => {
    expect(place(text.length + 100)).toEqual({ line: 4, column: 5 });
  });
});

describe("a document of one line", () => {
  it("is all line one", () => {
    const place = placesIn("just the one");

    expect(place(0)).toEqual({ line: 1, column: 1 });
    expect(place(11)).toEqual({ line: 1, column: 12 });
  });
});

describe("an empty document", () => {
  it("has a first line to point at", () => {
    expect(placesIn("")(0)).toEqual({ line: 1, column: 1 });
  });
});

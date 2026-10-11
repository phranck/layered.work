import { CONTENT_LOCALES, INTERFACE_LANGUAGES } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { DATE_FORMAT, DATE_TIME_FORMAT, fileSize, LIST_FORMAT, TIME_FORMAT } from "./format.js";

describe("the dashboard's formatters", () => {
  it("write each interface language in the locale the site uses for it", () => {
    for (const language of INTERFACE_LANGUAGES) {
      for (const formats of [DATE_FORMAT, DATE_TIME_FORMAT, TIME_FORMAT, LIST_FORMAT]) {
        expect(formats[language].resolvedOptions().locale).toBe(CONTENT_LOCALES[language]);
      }
    }
  });

  it("join a list with the language's own word before the last name", () => {
    expect(LIST_FORMAT.de.format(["JPEG", "PNG", "GIF"])).toBe("JPEG, PNG und GIF");
    expect(LIST_FORMAT.en.format(["JPEG", "PNG", "GIF"])).toBe("JPEG, PNG and GIF");
  });
});

describe("a file's size", () => {
  it("is written in kilobytes below a megabyte and in megabytes from there", () => {
    expect(fileSize("en", 1536)).toBe("1.5 kB");
    expect(fileSize("en", 3 * 1024 * 1024)).toBe("3 MB");
    expect(fileSize("de", 1536)).toBe("1,5 kB");
  });
});

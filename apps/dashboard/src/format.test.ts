import { CONTENT_LOCALES, INTERFACE_LANGUAGES } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { DATE_FORMAT, DATE_TIME_FORMAT, KILOBYTE_FORMAT, LIST_FORMAT, TIME_FORMAT } from "./format.js";

describe("the dashboard's formatters", () => {
  it("write each interface language in the locale the site uses for it", () => {
    for (const language of INTERFACE_LANGUAGES) {
      for (const formats of [DATE_FORMAT, DATE_TIME_FORMAT, TIME_FORMAT, KILOBYTE_FORMAT, LIST_FORMAT]) {
        expect(formats[language].resolvedOptions().locale).toBe(CONTENT_LOCALES[language]);
      }
    }
  });

  it("join a list with the language's own word before the last name", () => {
    expect(LIST_FORMAT.de.format(["JPEG", "PNG", "GIF"])).toBe("JPEG, PNG und GIF");
    expect(LIST_FORMAT.en.format(["JPEG", "PNG", "GIF"])).toBe("JPEG, PNG and GIF");
  });
});

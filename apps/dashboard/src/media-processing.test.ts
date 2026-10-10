import { describe, expect, it } from "vitest";
import { pollWhileProcessing } from "./media-processing.js";

describe("asking again for files being processed", () => {
  it("goes on while any file shown is unfinished, and stops once every one is done", () => {
    expect(pollWhileProcessing(["ready", "queued"])).toBeGreaterThan(0);
    expect(pollWhileProcessing(["processing"])).toBeGreaterThan(0);
    expect(pollWhileProcessing(["ready", "failed"])).toBe(false);
    expect(pollWhileProcessing([])).toBe(false);
  });
});

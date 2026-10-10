import { describe, expect, it } from "vitest";
import { isProcessing, MEDIA_PROCESSING_STATES } from "./media.js";

describe("a file's processing", () => {
  it("is unfinished while queued or processing, and finished once ready or failed", () => {
    expect(MEDIA_PROCESSING_STATES.filter(isProcessing)).toEqual(["queued", "processing"]);
  });
});

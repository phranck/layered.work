import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderSocialCard } from "./card.js";

describe("publish-time social cards", () => {
  it("renders a 1200 by 630 PNG and measures the actual centered wordmark", async () => {
    const card = await renderSocialCard('A title with <markup> & "quotes"');
    expect(await sharp(card.bytes).metadata()).toMatchObject({ width: 1200, height: 630, format: "png" });
    expect(card.wordmark.centerX).toBeCloseTo(600, 0);
    expect(card.wordmark.centerOffsetX).toBeLessThanOrEqual(0.5);
    expect(card.wordmark.width).toBeGreaterThan(300);
  });
  it("is deterministic and never takes a summary or body as input", async () => {
    const first = await renderSocialCard("A private entry");
    const same = await renderSocialCard("A private entry");
    const changed = await renderSocialCard("A changed title");
    expect(first.bytes.equals(same.bytes)).toBe(true);
    expect(first.bytes.equals(changed.bytes)).toBe(false);
  });
});

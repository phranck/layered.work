import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { deriveImageVariants } from "./variants.js";

async function image(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#436890" } })
    .png()
    .toBuffer();
}

describe("derived image sizes", () => {
  it("produces both modern formats at the widths used by cards and page images", async () => {
    const result = await deriveImageVariants(await image(1200, 800));
    expect(result.variants.map(({ format, width, height }) => [format, width, height])).toEqual([
      ["avif", 348, 232],
      ["webp", 348, 232],
      ["avif", 696, 464],
      ["webp", 696, 464],
      ["avif", 1180, 787],
      ["webp", 1180, 787],
    ]);
    for (const variant of result.variants) {
      const metadata = await sharp(variant.bytes).metadata();
      expect(metadata.width).toBe(variant.width);
      expect(metadata.height).toBe(variant.height);
      expect(metadata.exif).toBeUndefined();
    }
  });

  it("applies EXIF orientation before choosing sizes and strips that metadata", async () => {
    const original = await sharp(await image(400, 800))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const result = await deriveImageVariants(original);
    expect(result.variants.map(({ width, height }) => [width, height])).toEqual([
      [348, 174],
      [348, 174],
      [696, 348],
      [696, 348],
    ]);
    expect((await sharp(result.variants[0]?.bytes).metadata()).orientation).toBeUndefined();
  });

  it("never enlarges a small picture, including its inline placeholder", async () => {
    const result = await deriveImageVariants(await image(8, 6));
    expect(result.variants).toEqual([]);
    expect(result.placeholder).toMatch(/^data:image\/webp;base64,/);
    const metadata = await sharp(Buffer.from(result.placeholder.split(",")[1] ?? "", "base64")).metadata();
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(6);
  });

  it("keeps animation in WebP while using the first frame for AVIF and the placeholder", async () => {
    const second = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#f06543" } })
      .png()
      .toBuffer();
    const frames = [await image(400, 200), second];
    const original = await sharp(frames, { join: { animated: true } })
      .gif({ delay: [100, 200], loop: 0 })
      .toBuffer();
    const result = await deriveImageVariants(original);
    const webp = result.variants.find(({ format }) => format === "webp");
    expect(webp?.height).toBe(174);
    const metadata = await sharp(webp?.bytes, { animated: true }).metadata();
    expect(metadata.pages).toBe(2);
    expect(metadata.pageHeight).toBe(174);
    expect(metadata.delay).toEqual([100, 200]);
    expect(metadata.loop).toBe(0);
  });
});

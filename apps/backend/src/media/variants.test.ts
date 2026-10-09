import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { WORDMARK } from "../assets.js";
import { deriveImageVariants, prepareMark, variantChecksum, variantStorageKey } from "./variants.js";

async function image(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#436890" } })
    .png()
    .toBuffer();
}

/** A solid red 200 by 100 mark inside a transparent border, which `prepareMark` trims away. */
async function redMark() {
  const red = await sharp({ create: { width: 200, height: 100, channels: 4, background: "#ff0000" } })
    .png()
    .toBuffer();
  const framed = await sharp({
    create: { width: 300, height: 150, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: red, left: 50, top: 25 }])
    .png()
    .toBuffer();
  return prepareMark(framed);
}

/** The red channel of one pixel of a derived size. */
async function redAt(bytes: Buffer, x: number, y: number) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels] ?? -1;
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

describe("watermarked sizes", () => {
  it("adds a size at the picture's own width, so the largest version a reader reaches is marked", async () => {
    const result = await deriveImageVariants(await image(1000, 600), {
      mark: await redMark(),
      anchor: "bottom-right",
    });
    expect(result.variants.map(({ format, width }) => [format, width])).toEqual([
      ["avif", 348],
      ["webp", 348],
      ["avif", 696],
      ["webp", 696],
      ["avif", 1000],
      ["webp", 1000],
    ]);
  });

  it("lays the mark at its anchor, a fifth of the width wide and inset from the edges", async () => {
    const original = await image(1000, 600);
    const mark = await redMark();
    const corner = await deriveImageVariants(original, { mark, anchor: "bottom-right" });
    const full = corner.variants.find(({ format, width }) => format === "webp" && width === 1000);
    // 200 by 100 pixels, 18 pixels (3 % of 600) from the right and bottom edges.
    expect(await redAt(full?.bytes as Buffer, 890, 530)).toBeGreaterThan(180);
    expect(await redAt(full?.bytes as Buffer, 990, 590)).toBeLessThan(100);
    expect(await redAt(full?.bytes as Buffer, 100, 100)).toBeLessThan(100);

    const opposite = await deriveImageVariants(original, { mark, anchor: "top-left" });
    const top = opposite.variants.find(({ format, width }) => format === "webp" && width === 1000);
    expect(await redAt(top?.bytes as Buffer, 100, 60)).toBeGreaterThan(180);
    expect(await redAt(top?.bytes as Buffer, 890, 530)).toBeLessThan(100);
  });

  it("lays one mark over a still picture where the original is animated", async () => {
    const frames = [await image(400, 200), await image(400, 200)];
    const original = await sharp(frames, { join: { animated: true } })
      .gif()
      .toBuffer();
    const result = await deriveImageVariants(original, { mark: await redMark(), anchor: "center" });
    const webp = result.variants.find(({ format, width }) => format === "webp" && width === 400);
    expect((await sharp(webp?.bytes, { animated: true }).metadata()).pages ?? 1).toBe(1);
    expect(await redAt(webp?.bytes as Buffer, 200, 100)).toBeGreaterThan(180);
  });

  it("trims the wordmark's empty margin, so the mark is measured by what is drawn", async () => {
    const mark = await sharp(await prepareMark(await readFile(WORDMARK))).metadata();
    // The viewBox is 900 by 450 units, rasterised at three times its size.
    expect(mark.width).toBeLessThan(2700);
    expect(mark.height).toBeLessThan(1350);
    expect(mark.hasAlpha).toBe(true);
  });
});

describe("where a size is stored", () => {
  it("names the file by the SHA-256 of its bytes, which reads back from the key", async () => {
    const key = variantStorageKey("media-id", "run-token", { bytes: Buffer.from("size"), format: "webp" });
    expect(key).toMatch(/^variants\/media-id\/run-token\/[0-9a-f]{64}\.webp$/);
    expect(variantChecksum(key)).toBe(key.split("/").at(-1)?.split(".")[0]);
    expect(variantChecksum("migration/old-size-1180.webp")).toBeUndefined();
  });
});

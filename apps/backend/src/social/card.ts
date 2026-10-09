import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { WORDMARK } from "../assets.js";

export const CARD_SIZE = { width: 1200, height: 630 } as const;
const BACKGROUND = { r: 17, g: 21, b: 26, alpha: 1 };
const WORDMARK_TOP = 80;
const WORDMARK_HEIGHT = 230;
const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] ?? character,
  );

function titleLines(title: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of title.replace(/\s+/g, " ").trim().split(" ")) {
    if (line.length + word.length > 42 && line) {
      lines.push(line);
      line = "";
    }
    line = `${line}${line ? " " : ""}${word}`;
  }
  if (line) lines.push(line);
  return lines
    .slice(0, 3)
    .map((line, index) => (index === 2 && lines.length > 3 ? `${line.slice(0, 39)}…` : line.slice(0, 42)));
}

/** Title only: summaries and bodies never enter the image, including for private content. */
export async function renderSocialCard(title: string) {
  const mark = await sharp(await readFile(WORDMARK))
    .resize(900, 450)
    .trim()
    .resize({ width: 480, height: WORDMARK_HEIGHT, fit: "inside" })
    .png()
    .toBuffer();
  const dimensions = await sharp(mark).metadata();
  const left = Math.round((CARD_SIZE.width - (dimensions.width ?? 0)) / 2);
  const text = Buffer.from(
    `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><g fill="#eef3fa" font-family="sans-serif" font-size="38" text-anchor="middle">${titleLines(
      title,
    )
      .map((line, index) => `<text x="600" y="${390 + index * 52}">${escapeXml(line)}</text>`)
      .join("")}</g></svg>`,
  );
  const bytes = await sharp({ create: { ...CARD_SIZE, channels: 4, background: BACKGROUND } })
    .composite([{ input: mark, top: WORDMARK_TOP, left }, { input: text }])
    .png()
    .toBuffer();
  // Measure the final image's actual ink, rather than the SVG's padded viewBox.
  const { data, info } = await sharp(bytes)
    .extract({ left: 0, top: WORDMARK_TOP, width: CARD_SIZE.width, height: WORDMARK_HEIGHT })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let min = info.width,
    max = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (
        Math.abs((data[offset] ?? 0) - BACKGROUND.r) +
          Math.abs((data[offset + 1] ?? 0) - BACKGROUND.g) +
          Math.abs((data[offset + 2] ?? 0) - BACKGROUND.b) >
        50
      ) {
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
  if (max < min) throw new Error("The social card wordmark has no visible pixels.");
  const centerX = (min + max + 1) / 2;
  const centerOffsetX = Math.abs(centerX - CARD_SIZE.width / 2);
  if (centerOffsetX > 1) throw new Error("The social card wordmark is not centered.");
  return { bytes, wordmark: { left: min, width: max - min + 1, centerX, centerOffsetX } };
}

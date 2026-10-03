/** Add responsive WebP variants and placeholders, leaving staged originals intact. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Astro already depends on Sharp. Resolve through that declared dependency,
// rather than relying on pnpm's store layout or adding a second image stack.
const websiteRequire = createRequire(new URL("../../apps/website/package.json", import.meta.url));
const astroRequire = createRequire(websiteRequire.resolve("astro/package.json"));
export const sharp = astroRequire("sharp");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function prepareMedia(directory, mediaDirectory) {
  const sitePath = resolve(directory, "site.json");
  const site = JSON.parse(await readFile(sitePath, "utf8"));
  const variants = [];
  for (const item of site.media) {
    const originalPath = resolve(mediaDirectory, basename(item.src));
    const original = await readFile(originalPath);
    if (sha256(original) !== item.sha256) throw new Error(`Original checksum mismatch: ${item.source}`);
    if (!item.mime.startsWith("image/") || item.mime === "image/svg+xml") continue;
    const metadata = await sharp(original).metadata();
    const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation);
    item.width = swapsAxes ? metadata.height : metadata.width;
    item.height = swapsAxes ? metadata.width : metadata.height;
    if (item.source.includes("/responsive/") || item.filename.includes("-thumbnail.")) continue;
    const widths = [...new Set([480, 960, 1600].map((width) => Math.min(width, item.width)))];
    const sources = [];
    for (const width of widths) {
      const filename = `${item.slug}-variant-${width}.webp`;
      const bytes = await sharp(original)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      await writeFile(resolve(mediaDirectory, filename), bytes);
      const staged = await readFile(resolve(mediaDirectory, filename));
      if (sha256(staged) !== sha256(bytes)) throw new Error(`Variant checksum mismatch: ${filename}`);
      sources.push(`/media/${filename} ${width}w`);
      variants.push({
        source: item.source,
        src: `/media/${filename}`,
        width,
        bytes: bytes.length,
        sha256: sha256(bytes),
      });
    }
    item.srcSet = sources.join(", ");
    const placeholder = await sharp(original)
      .rotate()
      .resize({ width: 24, withoutEnlargement: true })
      .webp({ quality: 35 })
      .toBuffer();
    item.placeholder = `data:image/webp;base64,${placeholder.toString("base64")}`;
  }
  await writeFile(sitePath, `${JSON.stringify(site, null, 2)}\n`);
  const reportPath = resolve(directory, "media-report.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  report.variants = variants;
  report.variantBytes = variants.reduce((total, item) => total + item.bytes, 0);
  report.placeholders = site.media.filter((item) => item.placeholder).length;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { originals: site.media.length, variants: variants.length, placeholders: report.placeholders };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(
        await prepareMedia(
          process.argv[2] || "migration-out",
          process.argv[3] || "apps/website/public/media",
        ),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

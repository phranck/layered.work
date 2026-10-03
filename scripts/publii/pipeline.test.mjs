import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareMedia, sharp } from "./media.mjs";
import { validateExport } from "./validate.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "layered-media-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#8d7465" } })
    .png()
    .toBuffer();
  await writeFile(join(directory, "fixture.png"), original);
  const media = {
    slug: "fixture",
    source: "posts/1/fixture.png",
    filename: "fixture.png",
    src: "/media/fixture.png",
    mime: "image/png",
    sha256: createHash("sha256").update(original).digest("hex"),
  };
  await writeFile(
    join(directory, "site.json"),
    JSON.stringify({ entries: [{ id: 1, slug: "entry", body: 'Image("fixture")' }], media: [media] }),
  );
  await writeFile(join(directory, "media-report.json"), JSON.stringify({}));
  await writeFile(join(directory, "conversion-report.json"), JSON.stringify({ needsReview: false }));
  return { directory, original };
}

test("responsive files and placeholder preserve original dimensions and bytes deterministically", async (t) => {
  const { directory, original } = await fixture(t);
  assert.deepEqual(await prepareMedia(directory, directory), { originals: 1, variants: 3, placeholders: 1 });
  assert.deepEqual(await readFile(join(directory, "fixture.png")), original);
  const first = await readFile(join(directory, "site.json"), "utf8");
  const item = JSON.parse(first).media[0];
  assert.equal(item.width, 1200);
  assert.equal(item.height, 800);
  assert.match(item.srcSet, /fixture-variant-480.webp 480w/);
  assert.match(item.srcSet, /fixture-variant-1200.webp 1200w/);
  assert.match(item.placeholder, /^data:image\/webp;base64,/);
  const info = await sharp(await readFile(join(directory, "fixture-variant-480.webp"))).metadata();
  assert.equal(info.width, 480);
  assert.equal(info.height, 320);
  await prepareMedia(directory, directory);
  assert.equal(await readFile(join(directory, "site.json"), "utf8"), first);
});

test("media processing refuses a corrupted staged original", async (t) => {
  const { directory } = await fixture(t);
  await writeFile(join(directory, "fixture.png"), "corrupted isolated test image");
  await assert.rejects(prepareMedia(directory, directory), /Original checksum mismatch/);
});

test("actual content validator rejects unknown media and strict unresolved decisions", async (t) => {
  const { directory } = await fixture(t);
  assert.equal((await validateExport(directory)).valid, true);
  const site = JSON.parse(await readFile(join(directory, "site.json"), "utf8"));
  site.entries[0].body = 'Model("missing")';
  await writeFile(join(directory, "site.json"), JSON.stringify(site));
  await assert.rejects(validateExport(directory), /unknown-media/);
  site.entries[0].body = 'Image("fixture")';
  await writeFile(join(directory, "site.json"), JSON.stringify(site));
  await writeFile(join(directory, "conversion-report.json"), JSON.stringify({ needsReview: true }));
  await assert.rejects(validateExport(directory, { strict: true }), /decisions remain unresolved/);
});

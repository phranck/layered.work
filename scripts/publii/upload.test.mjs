import assert from "node:assert/strict";
import test from "node:test";
import { selectObjects } from "./upload.mjs";

/**
 * A media row shaped like the export's, with only the fields the choice reads.
 *
 * `source` is the file's path inside Publii's media folder, including its name,
 * which is what tells a responsive copy apart from an original.
 */
const medium = (slug, directory, overrides = {}) => ({
  slug,
  src: `/media/${slug}.webp`,
  filename: `${slug}.webp`,
  source: `${directory}/${slug}.webp`,
  mime: "image/webp",
  bytes: 1000,
  sha256: "a".repeat(64),
  ...overrides,
});

const site = {
  entries: [
    {
      path: "/an-entry/",
      featuredImage: "cover",
      body: 'Image("in-body")\n\nGallery(columns: 2) {\n  Image("in-gallery", caption: "A caption")\n}\n\n[The plans](/media/linked-file.pdf)',
    },
  ],
  media: [
    medium("cover", "posts/1"),
    medium("in-body", "posts/1"),
    medium("in-gallery", "posts/1/gallery"),
    medium("linked-file", "files", {
      src: "/media/linked-file.pdf",
      filename: "linked-file.pdf",
      source: "files/linked-file.pdf",
      mime: "application/pdf",
    }),
    medium("in-body-xl", "posts/1/responsive"),
    medium("in-gallery-thumbnail", "posts/1/gallery", { filename: "in-gallery-thumbnail.webp" }),
    medium("never-used", "files"),
  ],
};

const report = {
  variants: [
    { src: "/media/in-body-variant-480.webp", bytes: 200, sha256: "b".repeat(64) },
    { src: "/media/never-used-variant-480.webp", bytes: 200, sha256: "c".repeat(64) },
  ],
};

test("uploads what an entry names, by every way the content language names it", () => {
  const { objects } = selectObjects(site, report);
  const keys = objects.map((object) => object.key).sort();
  assert.deepEqual(keys, [
    "migration/cover.webp",
    "migration/in-body-variant-480.webp",
    "migration/in-body.webp",
    "migration/in-gallery.webp",
    "migration/linked-file.pdf",
  ]);
});

test("leaves out what no page reaches, and says why for each", () => {
  const { skipped } = selectObjects(site, report);
  assert.deepEqual(Object.fromEntries(skipped.map((item) => [item.slug, item.reason])), {
    "in-body-xl": "Publii's own responsive copy, superseded by the generated variants",
    "in-gallery-thumbnail": "Publii's own gallery thumbnail, superseded by the generated variants",
    "never-used": "in the file manager but named by no entry and no generated page",
  });
});

test("writes every object below the one prefix, so the set can be removed again", () => {
  const { objects } = selectObjects(site, report);
  for (const object of objects) assert.ok(object.key.startsWith("migration/"), object.key);
});

test("carries the recorded size and hash, which the upload verifies against", () => {
  const { objects } = selectObjects(site, report);
  const cover = objects.find((object) => object.key === "migration/cover.webp");
  assert.equal(cover.bytes, 1000);
  assert.equal(cover.sha256, "a".repeat(64));
  const variant = objects.find((object) => object.key === "migration/in-body-variant-480.webp");
  assert.equal(variant.bytes, 200);
  assert.equal(variant.mime, "image/webp");
});

test("refuses a selection where two files would be written to one key", () => {
  const collision = { ...site, media: [...site.media, medium("cover", "posts/2")] };
  assert.throws(() => selectObjects(collision, report), /one key/);
});

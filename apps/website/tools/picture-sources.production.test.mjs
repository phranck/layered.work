import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attributeOf,
  fixtureEntry,
  fixturePicture,
  headAndBody,
  IMAGE_PRELOAD,
  OPENING_PICTURE,
  renderPages,
} from "./render-production.mjs";

/**
 * A picture the library holds in more than one format is offered in all of
 * them, best first, and the head asks for the one the page will draw.
 *
 * The case where the library holds one format is `lead-image.production.test.mjs`,
 * which renders a snapshot of its own and expects the plain `img` this site
 * published before any of this existed.
 */

const AVIF_CANDIDATES =
  "/media/post-cover-480.avif 480w, /media/post-cover-960.avif 960w, /media/post-cover-1600.avif 1600w";
const snapshot = {
  topics: [],
  redirects: [],
  media: [
    {
      ...fixturePicture("post-cover"),
      sources: [{ type: "image/avif", srcSet: AVIF_CANDIDATES }],
    },
  ],
  entries: [fixtureEntry({ id: "post", path: "/with-cover/", featuredImage: "post-cover" })],
  homeBlocks: [],
};
const [page] = await renderPages(snapshot, ["/with-cover/"]);
const { head, body } = headAndBody(page);

test("offers the better format before the one the img carries", () => {
  const picture = /<picture>[\s\S]*?<\/picture>/.exec(body)?.[0];
  assert(picture, "the page draws no picture element");
  const source = /<source[^>]*>/.exec(picture)?.[0] ?? "";
  assert.equal(attributeOf(picture, /<source[^>]*>/, "type"), "image/avif");
  assert.equal(attributeOf(picture, /<source[^>]*>/, "srcset"), AVIF_CANDIDATES);
  // The widths are what decides which candidate is fetched, so the source
  // states them as the img does.
  assert.equal(
    attributeOf(picture, /<source[^>]*>/, "sizes"),
    attributeOf(picture, OPENING_PICTURE, "sizes"),
  );
  assert(picture.indexOf(source) < picture.indexOf("<img"), "the source must stand before the img");
  // Whatever reads none of the sources still reads this one.
  assert.equal(
    attributeOf(picture, OPENING_PICTURE, "srcset"),
    "/media/post-cover-480.webp 480w, /media/post-cover-960.webp 960w, /media/post-cover-1600.webp 1600w",
  );
});

test("asks for the format the page will draw, and for that one alone", () => {
  assert.equal([...head.matchAll(new RegExp(IMAGE_PRELOAD, "g"))].length, 1);
  assert.equal(attributeOf(head, IMAGE_PRELOAD, "type"), "image/avif");
  assert.equal(attributeOf(head, IMAGE_PRELOAD, "imagesrcset"), AVIF_CANDIDATES);
  assert.equal(attributeOf(head, IMAGE_PRELOAD, "imagesizes"), attributeOf(body, OPENING_PICTURE, "sizes"));
  // A candidate list written with width descriptors leaves `href` out of the
  // set, and naming the other format there would fetch the picture twice.
  assert.equal(attributeOf(head, IMAGE_PRELOAD, "href"), undefined);
});

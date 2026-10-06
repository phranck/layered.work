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
 * The picture a page opens with is asked for in the head, with exactly the
 * candidates and widths its `img` names. Anything else and the browser fetches
 * it twice, or finds it only once the document has been read.
 */

const block = (type, sortOrder) => ({ type, sortOrder, enabled: true, settings: {} });
const snapshot = {
  topics: [],
  redirects: [],
  media: [fixturePicture("post-cover"), fixturePicture("project-hero")],
  entries: [
    fixtureEntry({ id: "post", path: "/with-cover/", featuredImage: "post-cover" }),
    fixtureEntry({
      id: "project",
      path: "/projects/with-hero/",
      kind: "project",
      featuredImage: "project-hero",
    }),
    fixtureEntry({ id: "plain", path: "/without-cover/" }),
  ],
  homeBlocks: [block("hero", 0), block("topic_bar", 1)],
};
const paths = ["/with-cover/", "/projects/with-hero/", "/without-cover/", "/"];
const pages = Object.fromEntries(
  (await renderPages(snapshot, paths)).map((html, index) => [paths[index], html]),
);

/** Asserts that the head asks for the opening picture as the page draws it, and returns its widths. */
function preloadMatchesPicture(path) {
  const { head, body } = headAndBody(pages[path]);
  assert.equal([...head.matchAll(new RegExp(IMAGE_PRELOAD, "g"))].length, 1, path);
  for (const [preload, picture] of [
    ["imagesrcset", "srcset"],
    ["imagesizes", "sizes"],
    ["href", "src"],
  ])
    assert.equal(
      attributeOf(head, IMAGE_PRELOAD, preload),
      attributeOf(body, OPENING_PICTURE, picture),
      path,
    );
  return attributeOf(body, OPENING_PICTURE, "sizes");
}

test("asks for an entry's opening picture in the head, as its page draws it", () => {
  for (const path of ["/with-cover/", "/projects/with-hero/"])
    assert.equal(
      preloadMatchesPicture(path),
      "(max-width: 719px) 100vw, (max-width: 1179px) 92vw, 1092px",
      path,
    );
  assert(!headAndBody(pages["/without-cover/"]).head.includes('as="image"'));
});

test("asks for the home page's hero in the head, as the hero draws it", () => {
  assert.equal(
    preloadMatchesPicture("/"),
    "(max-width: 1039px) 92vw, (max-width: 1179px) calc(48vw - 73px), 492px",
  );
});

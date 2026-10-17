import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureEntry, fixturePicture, renderPages } from "./render-production.mjs";

/**
 * Everything the site writes into a page runs under the site's policy, which
 * allows an inline script or style by nonce alone.
 *
 * A bundle Astro decides to write into the document instead of emitting as a
 * file carries no nonce, so the browser refuses it and the page is quietly
 * short of whatever that script did. Nothing else can catch it: the markup is
 * correct, the page renders, and only the policy says no.
 */

const block = (type, sortOrder, settings = {}) => ({ type, sortOrder, enabled: true, settings });
const snapshot = {
  topics: [],
  redirects: [],
  media: [fixturePicture("cover")],
  entries: [
    fixtureEntry({ id: "post", path: "/post/", featuredImage: "cover" }),
    fixtureEntry({ id: "project", path: "/projects/one/", kind: "project", featuredImage: "cover" }),
  ],
  homeBlocks: [
    block("hero", 0, { sky: true }),
    block("featured_entry", 1),
    block("post_grid", 2, { sky: true }),
  ],
};
const paths = ["/", "/posts/", "/projects/", "/topics/", "/post/", "/de/"];
const pages = Object.fromEntries(
  (await renderPages(snapshot, paths)).map((html, index) => [paths[index], html]),
);

/** Every `script` and `style` the page carries itself, which is the ones with no address. */
function inlineTags(html) {
  return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g), ...html.matchAll(/<style[^>]*>/g)].map(
    (match) => match[0],
  );
}

test("gives every inline script and style this response's nonce", () => {
  for (const [path, html] of Object.entries(pages)) {
    for (const tag of inlineTags(html))
      assert.match(tag, /\snonce="[^"]+"/, `${path} carries an inline tag without a nonce: ${tag}`);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureEntry, fixturePicture, headAndBody, renderPages } from "./render-production.mjs";

/**
 * A hero that does not open the home page is not the first thing a reader
 * sees, so the head does not ask for its picture ahead of everything else.
 * A file of its own, because it renders a different snapshot from
 * `lead-image.production.test.mjs`.
 */

test("asks for no picture in the head when the hero is not the home page's first block", async () => {
  const block = (type, sortOrder) => ({ type, sortOrder, enabled: true, settings: {} });
  const [home] = await renderPages(
    {
      topics: [],
      redirects: [],
      media: [fixturePicture("project-hero")],
      entries: [
        fixtureEntry({
          id: "project",
          path: "/projects/with-hero/",
          kind: "project",
          featuredImage: "project-hero",
        }),
      ],
      homeBlocks: [block("topic_bar", 0), block("hero", 1)],
    },
    ["/"],
  );
  assert(!headAndBody(home).head.includes('as="image"'));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { migratedOverviewPages } from "./migration-overviews.mjs";

test("renders a former page now held as a listing introduction", () => {
  const paths = { post: { en: "/posts/" }, project: { en: "/projects/" } };
  const legacy = new Map([["projects", "/old/projects/index.html"]]);
  const pages = migratedOverviewPages([{ path: "/ordinary/" }], legacy, paths);

  assert.deepEqual(pages, [{ slug: "projects", path: "/projects/", visibility: "public" }]);
  assert.deepEqual(migratedOverviewPages([{ path: "/projects/" }], legacy, paths), []);
});

import assert from "node:assert/strict";
import test from "node:test";
import { rewritePreloadHelper } from "./preview-assets.mjs";

test("mounts Vite preload requests below the preview prefix", () => {
  const source = "var resolveAsset=function(file){return`/`+file};";

  assert.equal(
    rewritePreloadHelper(source, "/website-preview/"),
    "var resolveAsset=function(file){return`/website-preview/`+file};",
  );
});

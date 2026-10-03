import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { localMediaFile } from "./local-media.mjs";

const root = resolve("/tmp/layered-media");

test("a key below the directory is the file at that key", () => {
  assert.equal(localMediaFile(root, "/migration/cover.webp"), resolve(root, "migration/cover.webp"));
  assert.equal(
    localMediaFile(root, "/uploads/tl_WnGQ4duhWJVeRjRqMmQ"),
    resolve(root, "uploads/tl_WnGQ4duhWJVeRjRqMmQ"),
  );
});

test("a path that is not one key inside the directory is nothing", () => {
  for (const path of [
    "/migration/../../package.json",
    "/migration/..%2F..%2Fpackage.json",
    "/cover.webp",
    "/",
    "/Migration/cover.webp",
  ]) {
    assert.equal(localMediaFile(root, path), undefined, path);
  }
});

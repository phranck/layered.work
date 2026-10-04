import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { missingResponsiveImages } from "./responsive-images.mjs";

test("reports rendered raster images without responsive sources", () => {
  const document = new Window().document;
  document.body.innerHTML = '<img src="https://media.example/migration/cover.jpg">';
  const assets = [{ src: "/migration/cover.jpg", mime: "image/jpeg" }];
  expectMissing(document, assets, ["image /migration/cover.jpg has no srcset"]);

  document
    .querySelector("img")
    ?.setAttribute("srcset", "https://media.example/migration/cover-480.webp 480w");
  expectMissing(document, assets, []);
});

test("does not require variants for vector images", () => {
  const document = new Window().document;
  document.body.innerHTML = '<img src="/migration/logo.svg">';
  expectMissing(document, [{ src: "/migration/logo.svg", mime: "image/svg+xml" }], []);
});

function expectMissing(document, assets, expected) {
  assert.deepEqual(missingResponsiveImages(document, assets, "https://layered.work/"), expected);
}

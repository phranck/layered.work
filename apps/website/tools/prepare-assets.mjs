import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { copyUiAssets } from "@layered/ui/copy-assets";

await copyUiAssets(new URL("../public/", import.meta.url));
const require = createRequire(import.meta.url);
await copyFile(
  resolve(dirname(require.resolve("@google/model-viewer/package.json")), "LICENSE"),
  new URL("../public/model-viewer-license.txt", import.meta.url),
);
await copyFile(
  resolve(dirname(require.resolve("mermaid/package.json")), "LICENSE"),
  new URL("../public/mermaid-license.txt", import.meta.url),
);

// The Draco decoder, so that the site serves it itself.
//
// A Draco-compressed model needs a decoder, and model-viewer fetches one from
// gstatic.com unless it is told otherwise. That means a third-party origin in
// `connect-src` and a request to Google on every visit that opens a model.
// `three` ships the same files, so they are copied beside the site and
// `ModelViewer.astro` points the viewer at them.
//
// They are resolved through model-viewer, because that is what declares `three`
// as a dependency. The site does not, so asking from here looks in the wrong
// place.
const modelViewerRequire = createRequire(require.resolve("@google/model-viewer/package.json"));
const draco = dirname(modelViewerRequire.resolve("three/examples/jsm/libs/draco/draco_decoder.js"));
await mkdir(new URL("../public/draco/", import.meta.url), { recursive: true });
for (const file of ["draco_wasm_wrapper.js", "draco_decoder.wasm", "README.md"]) {
  await copyFile(resolve(draco, file), new URL(`../public/draco/${file}`, import.meta.url));
}

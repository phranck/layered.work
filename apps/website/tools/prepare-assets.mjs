import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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

/**
 * Asked through model-viewer, because that is what declares `three` as a
 * dependency. The site does not, so asking from here looks in the wrong place.
 */
const modelViewerRequire = createRequire(require.resolve("@google/model-viewer/package.json"));

/**
 * Puts one of the decoders that ship with `three` beside the site.
 *
 * A compressed model needs a decoder, and model-viewer fetches one from
 * gstatic.com unless it is told otherwise. That means a third-party origin in
 * the policy and a request to Google on every visit that opens a model.
 * `ModelViewer.astro` points the viewer at the copies instead.
 *
 * @param directory - Both the folder under `three/examples/jsm/libs/` and the
 *   folder under `public/`, so that the two cannot be named differently.
 * @param files - What the loader asks for, the first of which is also what the
 *   directory is resolved through. `README.md` carries the licence and is
 *   copied with every one of them.
 */
async function copyThreeDecoder(directory, files) {
  const from = dirname(modelViewerRequire.resolve(`three/examples/jsm/libs/${directory}/${files[0]}`));
  const into = new URL(`../public/${directory}/`, import.meta.url);
  await mkdir(into, { recursive: true });
  for (const file of [...files, "README.md"]) {
    await copyFile(resolve(from, file), new URL(file, into));
  }
}

await copyThreeDecoder("draco", ["draco_wasm_wrapper.js", "draco_decoder.wasm"]);
await copyThreeDecoder("basis", ["basis_transcoder.js", "basis_transcoder.wasm"]);

/**
 * The viewer's own stylesheet, which sits as a `<style>` block in its template.
 *
 * It is the whole of what the element looks like, starting with the rule that
 * gives it a box at all, so a policy that refuses it leaves an empty page
 * rather than an unstyled one. This server never touches that block, so it
 * cannot put a nonce on it, and the only exact way to permit it is its hash.
 *
 * Computed here so that it is taken from the package that is installed. Written
 * by hand it would be right until the next release of model-viewer and wrong
 * afterwards, with nothing to say so.
 */
const STYLE_BLOCK = /<style>([\s\S]*?)<\/style>/;
const modelViewerSource = await readFile(require.resolve("@google/model-viewer"), "utf8");
const style = modelViewerSource.match(STYLE_BLOCK);
if (style === null) {
  throw new Error("No <style> block in @google/model-viewer, so its hash cannot be computed");
}
const hash = createHash("sha256").update(style[1], "utf8").digest("base64");
await mkdir(new URL("../src/generated/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../src/generated/model-viewer.ts", import.meta.url),
  `// Written by tools/prepare-assets.mjs before every dev run, type check and build.
// Not edited by hand, and not in the repository.

/** The hash of model-viewer's shadow stylesheet, as a policy source expression. */
export const MODEL_VIEWER_STYLE_HASH = "'sha256-${hash}'";
`,
);

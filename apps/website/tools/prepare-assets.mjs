import { copyFile } from "node:fs/promises";
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

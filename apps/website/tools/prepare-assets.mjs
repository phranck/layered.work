import { copyUiAssets } from "@layered/ui/copy-assets";

await copyUiAssets(new URL("../public/", import.meta.url));

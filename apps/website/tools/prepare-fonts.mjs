import { copyFontAssets } from "@layered/ui/copy-fonts";

await copyFontAssets(new URL("../public/", import.meta.url));

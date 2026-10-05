import { cp, mkdir } from "node:fs/promises";

const directory = new URL("../dist/assets/", import.meta.url);
await mkdir(directory, { recursive: true });
await cp(new URL("../../../packages/ui/assets/logo.svg", import.meta.url), new URL("logo.svg", directory));

import { fileURLToPath } from "node:url";
import { build } from "vite";
import { dashboardApiOrigin } from "./config.mjs";
import { prepareDeployment } from "./deploy.mjs";

await build({ configFile: fileURLToPath(new URL("./vite.config.mjs", import.meta.url)) });
await prepareDeployment(new URL("./dist/", import.meta.url), dashboardApiOrigin());

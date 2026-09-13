// The dashboard is built to static files and served by nginx, so its build is a
// build rather than a bundle for now. Vite replaces this with its own output
// when the shell epic lands; what matters here is that `dist/` exists and holds
// an index.
import { mkdir, writeFile } from "node:fs/promises";

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./dist/index.html", import.meta.url),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>layered.work dashboard</title>
  </head>
  <body>
    <h1>Dashboard</h1>
    <p>Not built yet. This page proves the static path: built here, served by nginx.</p>
  </body>
</html>
`,
);
console.log("dashboard: dist/index.html written");

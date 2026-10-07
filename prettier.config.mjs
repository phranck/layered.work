// Prettier formats `*.astro` and nothing else, which is why `lint:astro` calls
// it with that glob rather than over the repository. Biome owns every other
// file type and excludes Astro files on purpose: it reads an Astro file's
// frontmatter without seeing the template below it, so every component the
// template uses is reported as an unused import.
import biome from "./biome.json" with { type: "json" };

/** @type {import("prettier").Config} */
export default {
  plugins: ["prettier-plugin-astro"],
  // Read from Biome's own setting, so a template and the module beside it break
  // at the same column and there is one answer to how wide a line here is.
  printWidth: biome.formatter.lineWidth,
};

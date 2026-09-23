/**
 * Refuses a build whose header script has grown past what its own code needs.
 *
 * The header's client script runs on every page, so whatever it carries is paid
 * for on every page. It opens with one named import from `@layered/ui`, and a
 * barrel import is only cheap whilst the bundler is allowed to drop the rest of
 * the barrel. That permission is the `sideEffects` field in the package, which
 * is one line and produced 872,938 bytes here when it was missing.
 *
 * Nothing else notices: the site works, the tests pass, the build succeeds, and
 * the only sign is a figure nobody reads. So it is read here.
 *
 * Run after `astro build`, against the built client assets.
 */

import { readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * What the header's script may weigh, uncompressed.
 *
 * Its own code is a few kilobytes. The limit leaves room for that to grow several
 * times over whilst still catching a barrel arriving whole, which is two orders
 * of magnitude away.
 */
const HEADER_SCRIPT_LIMIT_BYTES = 20_000;

const assets = fileURLToPath(new URL("../dist/client/_assets/", import.meta.url));
const names = await readdir(assets);
const header = names.filter((name) => name.startsWith("SiteHeader.") && name.endsWith(".js"));

if (header.length !== 1) {
  console.error(`Expected one built header script, found ${header.length}. Did the build run?`);
  process.exit(1);
}

const { size } = await stat(assets + header[0]);
if (size > HEADER_SCRIPT_LIMIT_BYTES) {
  console.error(
    `${header[0]} is ${size} bytes, over the ${HEADER_SCRIPT_LIMIT_BYTES} byte limit. ` +
      "Something it imports is no longer being dropped. Check that @layered/ui still declares sideEffects, " +
      "and that the script imports what it needs rather than a barrel that now has a side effect in it.",
  );
  process.exit(1);
}

console.log(JSON.stringify({ script: header[0], bytes: size, limit: HEADER_SCRIPT_LIMIT_BYTES }));

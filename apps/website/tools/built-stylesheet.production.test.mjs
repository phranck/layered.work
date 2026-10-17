import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * What the site actually serves, read off the built stylesheet.
 *
 * The source of a rule and the rule that ships are two different things once a
 * minifier has been over it, and a declaration it mangles is still correct in
 * every file a person reads. This is the one place that looks at the output.
 */

const ASSETS = new URL("../dist/client/_assets/", import.meta.url);

/** Every stylesheet the build emitted, as text. */
async function stylesheets() {
  const names = (await readdir(ASSETS)).filter((name) => name.endsWith(".css"));
  assert(names.length > 0, "the build emitted no stylesheet");
  return Promise.all(names.map(async (name) => [name, await readFile(new URL(name, ASSETS), "utf8")]));
}

test("writes no declaration without a value", async () => {
  for (const [name, css] of await stylesheets()) {
    const empty = [...css.matchAll(/([-a-z]+):\s*[;}]/g)].map((match) => match[1]);
    assert.deepEqual(empty, [], `${name} carries a declaration with no value: ${empty.join(", ")}`);
  }
});

test("gives up a band's fill where the band shows the sky", async () => {
  for (const [name, css] of await stylesheets()) {
    const rule = /\.section--band\.section--sky\{([^}]*)\}/.exec(css);
    if (!rule) continue;
    assert.match(rule[1], /border-image-source:\s*none/, `${name}: ${rule[0]}`);
  }
});

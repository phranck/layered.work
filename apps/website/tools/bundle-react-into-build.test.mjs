import assert from "node:assert/strict";
import { test } from "node:test";
import { bundleReactIntoBuild } from "../astro.config.mjs";

/**
 * React goes into the built server and nowhere else. Bundled into the
 * development server as well, Vite's module runner loads React's CommonJS entry
 * and the server stops with "module is not defined", which is #223.
 */

/** What the integration asks Astro to change for one command. */
function changesFor(command) {
  const changes = [];
  bundleReactIntoBuild().hooks["astro:config:setup"]({
    command,
    updateConfig: (config) => changes.push(config),
  });
  return changes;
}

test("bundles React into the server a build produces", () => {
  assert.deepEqual(changesFor("build"), [
    { vite: { ssr: { noExternal: ["react", "react-dom", "@phosphor-icons/react"] } } },
  ]);
});

test("leaves React to Node in the development server", () => {
  assert.deepEqual(changesFor("dev"), []);
  assert.deepEqual(changesFor("preview"), []);
});

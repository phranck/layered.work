import assert from "node:assert/strict";
import { test } from "node:test";
import { HOME_BLOCKS, homeBlockTypes } from "@layered/schemas";
import { fixtureEntry, renderPages } from "./render-production.mjs";

/**
 * The home page as the dashboard arranges it, rendered by the production build.
 *
 * Every type `homeBlockTypes` declares is on the page, so a type added there
 * without a renderer on the site fails here rather than leaving the page
 * quietly shorter. The database stores only those types, so this is also what
 * keeps the dashboard from holding a block the site cannot show.
 */

/** What a block's first line of text is set to, so the page shows where it landed. */
const marker = (type) => `Marker of ${type}`;

/**
 * One block on its defaults, with its first line of text set to its marker.
 *
 * @param {string} type - The block's type.
 * @param {number} sortOrder - Its place on the page.
 */
function block(type, sortOrder) {
  const line = HOME_BLOCKS[type].settings.find((setting) => setting.kind === "line");
  assert(line, `The ${type} block declares no line of text, so this test cannot find it on the page.`);
  return { type, sortOrder, enabled: true, settings: { [line.key]: { en: marker(type), de: "" } } };
}

// The locked block opens the page, and the others follow in the reverse of
// their declared order, so the page's order can only come from the arrangement.
const locked = homeBlockTypes.filter((type) => HOME_BLOCKS[type].locked);
const order = [...locked, ...homeBlockTypes.filter((type) => !HOME_BLOCKS[type].locked).reverse()];
const switchedOff = {
  type: "post_grid",
  sortOrder: order.length,
  enabled: false,
  settings: { title: { en: "Switched off in the dashboard", de: "" } },
};

const snapshot = {
  topics: [],
  redirects: [],
  media: [],
  entries: [
    fixtureEntry({ id: "post", path: "/a-post/" }),
    fixtureEntry({ id: "project", path: "/projects/a-project/", kind: "project" }),
  ],
  homeBlocks: [...order.map((type, sortOrder) => block(type, sortOrder)), switchedOff],
};
const [home] = await renderPages(snapshot, ["/"]);
const body = home.slice(home.indexOf("<body"));

test("renders every declared block type, in the order the dashboard arranged", () => {
  const positions = order.map((type) => [type, body.indexOf(marker(type))]);
  for (const [type, position] of positions) assert.notEqual(position, -1, `${type} is not on the page`);
  assert.deepEqual(
    [...positions].sort((left, right) => left[1] - right[1]).map(([type]) => type),
    order,
  );
});

test("leaves a switched off block off the page", () => {
  assert(!body.includes("Switched off in the dashboard"));
});

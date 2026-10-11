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
/** The blocks the dashboard put the countdown's sky behind, with a block between them that has none. */
const SKY_TYPES = ["topic_bar", "project_grid"];
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
  homeBlocks: [...order.map((type, sortOrder) => block(type, sortOrder)), switchedOff].map((each) =>
    SKY_TYPES.includes(each.type) && each.enabled
      ? { ...each, settings: { ...each.settings, sky: true } }
      : each,
  ),
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

/**
 * The opening tag of the section a block's marker stands in, and what lies
 * between that tag and the marker.
 *
 * @param {string} type - The block's type.
 */
function sectionOf(type) {
  const at = body.indexOf(marker(type));
  const start = body.lastIndexOf("<section", at);
  return { tag: body.slice(start, body.indexOf(">", start) + 1), opening: body.slice(start, at) };
}

test("puts one sky behind the blocks the dashboard chose, and behind no other", () => {
  for (const type of order) {
    const { tag, opening } = sectionOf(type);
    const chosen = SKY_TYPES.includes(type);
    assert.equal(tag.includes("section--sky"), chosen, `${type}: ${tag}`);
    // The clouds are on by default, and the stylesheet shows them over the first band alone.
    assert.equal(tag.includes("section--clouds"), chosen, `${type}: ${tag}`);
    assert(!opening.includes("data-sky="), `${type} carries a sky layer of its own`);
  }
  assert.equal(body.split("data-sky=").length - 1, 1, "one sky layer on the page");
  assert.match(
    body,
    /<div class="sky-host">\s*<div class="sky sky--bands"/,
    "the layer opens the blocks' host",
  );
  assert(body.includes(".sky--bands canvas"), "the script that starts the web is on the page");
});

/**
 * Writes the part of the export the site may publish.
 *
 * The full export holds every entry the old site ever had, drafts and trash
 * included, and it stays on this machine. What the deployed site reads is this
 * file: the entries that are public or reachable by their own address, and
 * nothing else. `apps/website/content/site.json` is committed, so the
 * deployment carries it without the pipeline that produced it.
 *
 * A test in the website refuses any entry in that file which is not one of the
 * two states, so a careless rerun cannot publish a draft.
 *
 * ```sh
 * node scripts/publii/publish-snapshot.mjs
 * ```
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

/** The two states a reader may reach, which is what decides what is written. */
const PUBLISHABLE = new Set(["public", "hidden"]);

const { values } = parseArgs({
  options: {
    export: { type: "string", default: "migration-out/site.json" },
    out: { type: "string", default: "apps/website/content/site.json" },
  },
});

const site = JSON.parse(await readFile(resolve(values.export), "utf8"));
const topicIds = new Map(site.topics.map((topic) => [topic.slug, String(topic.id)]));
const entries = site.entries
  .filter((entry) => PUBLISHABLE.has(entry.visibility))
  .map((entry) => ({
    ...entry,
    topics: entry.topics.map((slug) => {
      const id = topicIds.get(slug);
      if (!id) throw new Error(`Entry ${entry.id} names unknown topic ${slug}`);
      return id;
    }),
  }));
const withheld = site.entries.filter((entry) => !PUBLISHABLE.has(entry.visibility));

const published = {
  entries,
  topics: site.topics.map((topic) => ({
    id: String(topic.id),
    translations: { en: { slug: topic.slug, name: topic.name }, de: null },
  })),
  media: site.media,
  redirects: site.redirects,
  ...(site.homeBlocks ? { homeBlocks: site.homeBlocks } : {}),
};
await writeFile(resolve(values.out), `${JSON.stringify(published, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify(
    {
      out: values.out,
      published: entries.length,
      withheld: withheld.map((entry) => `${entry.visibility} ${entry.path}`),
    },
    null,
    2,
  )}\n`,
);

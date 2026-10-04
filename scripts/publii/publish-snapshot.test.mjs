import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("the published fallback uses topic ids and localized topic fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "layered-topic-snapshot-"));
  try {
    const input = join(directory, "export.json");
    const output = join(directory, "public.json");
    await writeFile(
      input,
      JSON.stringify({
        entries: [
          { visibility: "public", topics: ["hardware"] },
          { visibility: "draft", topics: ["hardware"] },
        ],
        topics: [{ id: 7, slug: "hardware", name: "Hardware" }],
        media: [],
        redirects: [],
      }),
    );
    execFileSync(process.execPath, [
      fileURLToPath(new URL("./publish-snapshot.mjs", import.meta.url)),
      "--export",
      input,
      "--out",
      output,
    ]);

    const published = JSON.parse(await readFile(output, "utf8"));
    assert.deepEqual(
      published.entries.map((entry) => entry.topics),
      [["7"]],
    );
    assert.deepEqual(published.topics, [
      { id: "7", translations: { en: { slug: "hardware", name: "Hardware" }, de: null } },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

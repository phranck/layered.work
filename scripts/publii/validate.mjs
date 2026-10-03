/** Validate every converted body against the content package's actual register. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContent } from "../../packages/content/dist/index.js";

export async function validateExport(directory, { strict = false } = {}) {
  const site = JSON.parse(await readFile(resolve(directory, "site.json"), "utf8"));
  const reportPath = resolve(directory, "conversion-report.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const media = new Set(site.media.map((item) => item.slug));
  const results = site.entries.map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    ...validateContent(entry.body, { media }),
  }));
  const valid = results.every((entry) => entry.publishable);
  report.validation = { valid, entries: results };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!valid)
    throw new Error(
      `Content validation failed: ${JSON.stringify(results.filter((entry) => !entry.publishable))}`,
    );
  if (strict && report.needsReview)
    throw new Error("Editorial migration decisions remain unresolved. See conversion-report.json.");
  return { entries: results.length, valid, needsReview: report.needsReview };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(
        await validateExport(process.argv[2] || "migration-out", {
          strict: process.argv.includes("--strict"),
        }),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

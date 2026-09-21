import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type ContentRepository, createRepository } from "./repository.js";

/**
 * A local migration preview uses the full, private export, never a public JSON
 * endpoint. Explicit configuration avoids accidentally publishing draft files.
 * A missing source is an operational error and never an empty successful page.
 */
export async function loadContent(): Promise<ContentRepository> {
  const filename = process.env.WEBSITE_CONTENT_FILE;
  if (!filename) throw new Error("WEBSITE_CONTENT_FILE is required for the migration preview");
  return createRepository(JSON.parse(await readFile(resolve(filename), "utf8")));
}

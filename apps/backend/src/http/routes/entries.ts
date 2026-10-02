import { entryIdParam, entryListQuery, saveEntryBody } from "@layered/schemas";
import { Hono } from "hono";
import { database } from "../../db/connect.js";
import { createTranslation, listEntries, readEntry, saveEntry } from "../../entries/repository.js";
import { principalOf, requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

/**
 * The dashboard's view of what has been written, and where it is written.
 *
 * Every route needs a session. The writing belongs to the site rather than to
 * the account that wrote it, so any signed-in author may read and save all of
 * it and there is no owner to check beyond that. Every save is written to the
 * audit log under the account that made it.
 */
export const entriesRoutes = new Hono();

entriesRoutes.use("*", requireSession);

entriesRoutes.get("/", validate("query", entryListQuery), async (c) =>
  ok(c, await listEntries(database(), c.req.valid("query").kind)),
);

entriesRoutes.get("/:id", validate("param", entryIdParam), async (c) =>
  ok(c, await readEntry(database(), c.req.valid("param").id)),
);

// The other language of the entry, created as a draft or opened where it exists.
entriesRoutes.post("/:id/translation", validate("param", entryIdParam), async (c) =>
  ok(c, await createTranslation(database(), c.req.valid("param").id, principalOf(c).userId)),
);

entriesRoutes.put("/:id", validate("param", entryIdParam), validate("json", saveEntryBody), async (c) =>
  ok(c, await saveEntry(database(), c.req.valid("param").id, c.req.valid("json"), principalOf(c).userId)),
);

import { entryIdParam, entryListQuery, previewEntryBody, saveEntryBody } from "@layered/schemas";
import { Hono } from "hono";
import { database } from "../../db/connect.js";
import { createPreview } from "../../entries/preview.js";
import {
  createTranslation,
  emptyBin,
  listEntries,
  readEntry,
  saveEntry,
  setTrashed,
  trashImpact,
} from "../../entries/repository.js";
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

// What the editor holds, kept as a preview, answered with the address that shows it.
entriesRoutes.post(
  "/:id/previews",
  validate("param", entryIdParam),
  validate("json", previewEntryBody),
  async (c) =>
    ok(
      c,
      await createPreview(database(), c.req.valid("param").id, c.req.valid("json"), principalOf(c).userId),
    ),
);

// The other language of the entry, created as a draft or opened where it exists.
entriesRoutes.post("/:id/translation", validate("param", entryIdParam), async (c) =>
  ok(c, await createTranslation(database(), c.req.valid("param").id, principalOf(c).userId)),
);

entriesRoutes.put("/:id", validate("param", entryIdParam), validate("json", saveEntryBody), async (c) =>
  ok(c, await saveEntry(database(), c.req.valid("param").id, c.req.valid("json"), principalOf(c).userId)),
);

// What moving it to the bin affects, for the question asked first.
entriesRoutes.get("/:id/trash-impact", validate("param", entryIdParam), async (c) =>
  ok(c, await trashImpact(database(), c.req.valid("param").id)),
);

entriesRoutes.post("/:id/trash", validate("param", entryIdParam), async (c) =>
  ok(c, await setTrashed(database(), c.req.valid("param").id, true, principalOf(c).userId)),
);

entriesRoutes.post("/:id/restore", validate("param", entryIdParam), async (c) =>
  ok(c, await setTrashed(database(), c.req.valid("param").id, false, principalOf(c).userId)),
);

// Empties the bin of one list, for good.
entriesRoutes.delete("/bin", validate("query", entryListQuery), async (c) =>
  ok(c, await emptyBin(database(), c.req.valid("query").kind, principalOf(c).userId)),
);

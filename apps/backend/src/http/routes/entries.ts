import {
  createEntryBody,
  emptiedTrash,
  entryDetail,
  entryList,
  entryListQuery,
  entryPreview,
  entryTrashImpact,
  idParam,
  previewEntryBody,
  saveEntryBody,
} from "@layered/schemas";
import { Hono } from "hono";
import { database } from "../../db/connect.js";
import { createPreview } from "../../entries/preview.js";
import {
  createEntry,
  createTranslation,
  emptyTrash,
  listEntries,
  readEntry,
  saveEntry,
  setTrashed,
  trashImpact,
} from "../../entries/repository.js";
import { responds } from "../api-metadata.js";
import { requirePublishForPublicSave, requirePublishScope, requireScope } from "../require-scope.js";
import { principalOf } from "../require-session.js";
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

entriesRoutes.get(
  "/",
  requireScope("content:read"),
  validate("query", entryListQuery),
  responds(entryList),
  async (c) => ok(c, await listEntries(database(), c.req.valid("query").kind)),
);

entriesRoutes.post(
  "/",
  requireScope("content:write"),
  validate("json", createEntryBody),
  responds(entryDetail),
  async (c) =>
    ok(c, await createEntry(database(), c.req.valid("json"), principalOf(c).userId, principalOf(c).tokenId)),
);

entriesRoutes.get(
  "/:id",
  requireScope("content:read"),
  validate("param", idParam),
  responds(entryDetail),
  async (c) => ok(c, await readEntry(database(), c.req.valid("param").id)),
);

// What the editor holds, kept as a preview, answered with the address that shows it.
entriesRoutes.post(
  "/:id/previews",
  requireScope("content:write"),
  validate("param", idParam),
  validate("json", previewEntryBody),
  responds(entryPreview),
  async (c) =>
    ok(
      c,
      await createPreview(
        database(),
        c.req.valid("param").id,
        c.req.valid("json"),
        principalOf(c).userId,
        Date.now(),
        principalOf(c).tokenId,
      ),
    ),
);

// The other language of the entry, created as a draft or opened where it exists.
entriesRoutes.post(
  "/:id/translation",
  requireScope("content:write"),
  validate("param", idParam),
  responds(entryDetail),
  async (c) =>
    ok(
      c,
      await createTranslation(
        database(),
        c.req.valid("param").id,
        principalOf(c).userId,
        principalOf(c).tokenId,
      ),
    ),
);

entriesRoutes.put(
  "/:id",
  requireScope("content:write"),
  validate("param", idParam),
  validate("json", saveEntryBody),
  requirePublishForPublicSave,
  responds(entryDetail),
  async (c) =>
    ok(
      c,
      await saveEntry(
        database(),
        c.req.valid("param").id,
        c.req.valid("json"),
        principalOf(c).userId,
        principalOf(c).tokenId,
      ),
    ),
);

// What moving it to the trash affects, for the question asked first.
entriesRoutes.get(
  "/:id/trash-impact",
  requireScope("content:read"),
  validate("param", idParam),
  responds(entryTrashImpact),
  async (c) => ok(c, await trashImpact(database(), c.req.valid("param").id)),
);

entriesRoutes.post(
  "/:id/trash",
  requireScope("content:write"),
  validate("param", idParam),
  responds(entryDetail),
  async (c) =>
    ok(
      c,
      await setTrashed(
        database(),
        c.req.valid("param").id,
        true,
        principalOf(c).userId,
        principalOf(c).tokenId,
      ),
    ),
);

entriesRoutes.post(
  "/:id/restore",
  requireScope("content:write"),
  requirePublishScope,
  validate("param", idParam),
  responds(entryDetail),
  async (c) =>
    ok(
      c,
      await setTrashed(
        database(),
        c.req.valid("param").id,
        false,
        principalOf(c).userId,
        principalOf(c).tokenId,
      ),
    ),
);

// Empties the trash of one list, for good.
entriesRoutes.delete(
  "/trash",
  requireScope("content:write"),
  validate("query", entryListQuery),
  responds(emptiedTrash),
  async (c) =>
    ok(
      c,
      await emptyTrash(database(), c.req.valid("query").kind, principalOf(c).userId, principalOf(c).tokenId),
    ),
);

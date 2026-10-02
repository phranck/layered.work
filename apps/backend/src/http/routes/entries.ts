import { entryListQuery } from "@layered/schemas";
import { Hono } from "hono";
import { database } from "../../db/connect.js";
import { listEntries } from "../../entries/repository.js";
import { requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

/**
 * The dashboard's view of what has been written.
 *
 * Every route needs a session. The writing belongs to the site rather than to
 * the account that wrote it, so any signed-in author may read all of it and
 * there is no owner to check beyond that.
 */
export const entriesRoutes = new Hono();

entriesRoutes.use("*", requireSession);

entriesRoutes.get("/", validate("query", entryListQuery), async (c) =>
  ok(c, await listEntries(database(), c.req.valid("query").kind)),
);

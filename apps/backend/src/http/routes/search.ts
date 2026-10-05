import { searchQuery, searchResults } from "@layered/schemas";
import { Hono } from "hono";
import { database } from "../../db/connect.js";
import { searchEverything } from "../../search/repository.js";
import { responds } from "../api-metadata.js";
import { requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

/**
 * The dashboard's search across entries and media.
 *
 * Behind a session, like everything the dashboard reads. What was searched for
 * is never logged: the request line records the route, not the query.
 */
export const searchRoutes = new Hono();

searchRoutes.use("*", requireSession);

searchRoutes.get("/", validate("query", searchQuery), responds(searchResults), async (c) =>
  ok(c, await searchEverything(database(), c.req.valid("query").q)),
);

import {
  createNamedValueBody,
  namedValue,
  namedValueIdParam,
  namedValueList,
  updateNamedValueBody,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import {
  createNamedValue,
  deleteNamedValue,
  listNamedValues,
  updateNamedValue,
} from "../../values/repository.js";
import { responds } from "../api-metadata.js";
import { principalOf, requireOwner, requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

/**
 * The named values, for the dashboard.
 *
 * Any signed-in session may read them, because the editor completes their
 * names while an author writes. Only the owner may add, change or delete one,
 * as only the owner changes the site's settings: a value changes text on every
 * page that refers to it.
 */
export const valueRoutes = new Hono();
valueRoutes.use("*", requireSession);

valueRoutes.get("/", responds(namedValueList), async (c) => ok(c, await listNamedValues(database())));

valueRoutes.post("/", requireOwner, validate("json", createNamedValueBody), responds(namedValue), async (c) =>
  ok(c, await createNamedValue(database(), c.req.valid("json"), principalOf(c).userId)),
);

valueRoutes.put(
  "/:id",
  requireOwner,
  validate("param", namedValueIdParam),
  validate("json", updateNamedValueBody),
  responds(namedValue),
  async (c) =>
    ok(
      c,
      await updateNamedValue(database(), c.req.valid("param").id, c.req.valid("json"), principalOf(c).userId),
    ),
);

valueRoutes.delete(
  "/:id",
  requireOwner,
  validate("param", namedValueIdParam),
  responds(z.null()),
  async (c) => {
    await deleteNamedValue(database(), c.req.valid("param").id, principalOf(c).userId);
    return ok(c, null);
  },
);

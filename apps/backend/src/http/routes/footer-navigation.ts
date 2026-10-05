import {
  footerNavigation,
  footerNavigationList,
  navigationIdParam,
  reorderFooterNavigationBody,
  saveFooterNavigationBody,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import {
  deleteFooterNavigation,
  listFooterNavigations,
  reorderFooterNavigations,
  saveFooterNavigation,
} from "../../navigation/repository.js";
import { responds } from "../api-metadata.js";
import { principalOf, requireOwner, requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

export const footerNavigationRoutes = new Hono();
footerNavigationRoutes.use("*", requireSession);
footerNavigationRoutes.get("/", responds(footerNavigationList), async (c) =>
  ok(c, await listFooterNavigations(database())),
);
footerNavigationRoutes.patch(
  "/order",
  requireOwner,
  validate("json", reorderFooterNavigationBody),
  responds(footerNavigationList),
  async (c) =>
    ok(c, await reorderFooterNavigations(database(), c.req.valid("json").positions, principalOf(c).userId)),
);
footerNavigationRoutes.post(
  "/",
  requireOwner,
  validate("json", saveFooterNavigationBody),
  responds(footerNavigation),
  async (c) =>
    ok(c, await saveFooterNavigation(database(), null, c.req.valid("json"), principalOf(c).userId)),
);
footerNavigationRoutes.put(
  "/:id",
  requireOwner,
  validate("param", navigationIdParam),
  validate("json", saveFooterNavigationBody),
  responds(footerNavigation),
  async (c) =>
    ok(
      c,
      await saveFooterNavigation(
        database(),
        c.req.valid("param").id,
        c.req.valid("json"),
        principalOf(c).userId,
      ),
    ),
);
footerNavigationRoutes.delete(
  "/:id",
  requireOwner,
  validate("param", navigationIdParam),
  responds(z.null()),
  async (c) => {
    await deleteFooterNavigation(database(), c.req.valid("param").id, principalOf(c).userId);
    return ok(c, null);
  },
);

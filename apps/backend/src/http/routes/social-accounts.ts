import {
  idParam,
  reorderBody,
  saveSocialAccountBody,
  socialAccount,
  socialAccountList,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import {
  deleteSocialAccount,
  listSocialAccounts,
  reorderSocialAccounts,
  saveSocialAccount,
} from "../../social/accounts.js";
import { responds } from "../api-metadata.js";
import { principalOf, requireOwner, requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";
export const socialAccountRoutes = new Hono();
socialAccountRoutes.use("*", requireSession);
socialAccountRoutes.get("/", responds(socialAccountList), async (c) =>
  ok(c, await listSocialAccounts(database())),
);
socialAccountRoutes.patch(
  "/order",
  requireOwner,
  validate("json", reorderBody),
  responds(socialAccountList),
  async (c) =>
    ok(c, await reorderSocialAccounts(database(), c.req.valid("json").positions, principalOf(c).userId)),
);
socialAccountRoutes.post(
  "/",
  requireOwner,
  validate("json", saveSocialAccountBody),
  responds(socialAccount),
  async (c) => ok(c, await saveSocialAccount(database(), null, c.req.valid("json"), principalOf(c).userId)),
);
socialAccountRoutes.put(
  "/:id",
  requireOwner,
  validate("param", idParam),
  validate("json", saveSocialAccountBody),
  responds(socialAccount),
  async (c) =>
    ok(
      c,
      await saveSocialAccount(
        database(),
        c.req.valid("param").id,
        c.req.valid("json"),
        principalOf(c).userId,
      ),
    ),
);
socialAccountRoutes.delete(
  "/:id",
  requireOwner,
  validate("param", idParam),
  responds(z.null()),
  async (c) => {
    await deleteSocialAccount(database(), c.req.valid("param").id, principalOf(c).userId);
    return ok(c, null);
  },
);

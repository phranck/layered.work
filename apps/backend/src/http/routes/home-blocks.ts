import {
  addHomeBlockBody,
  homeBlock,
  homeBlockList,
  navigationIdParam,
  reorderHomeBlocksBody,
  saveHomeBlockBody,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import {
  addHomeBlock,
  deleteHomeBlock,
  listHomeBlocks,
  reorderHomeBlocks,
  saveHomeBlock,
} from "../../home/blocks.js";
import { responds } from "../api-metadata.js";
import { principalOf, requireOwner, requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

/**
 * The blocks of the home page. Every signed-in account reads them; only the
 * owner adds, saves, orders or removes one, as with the site's other settings.
 */
export const homeBlockRoutes = new Hono();
homeBlockRoutes.use("*", requireSession);
homeBlockRoutes.get("/", responds(homeBlockList), async (c) => ok(c, await listHomeBlocks(database())));
homeBlockRoutes.patch(
  "/order",
  requireOwner,
  validate("json", reorderHomeBlocksBody),
  responds(homeBlockList),
  async (c) =>
    ok(c, await reorderHomeBlocks(database(), c.req.valid("json").positions, principalOf(c).userId)),
);
homeBlockRoutes.post("/", requireOwner, validate("json", addHomeBlockBody), responds(homeBlock), async (c) =>
  ok(c, await addHomeBlock(database(), c.req.valid("json"), principalOf(c).userId)),
);
homeBlockRoutes.put(
  "/:id",
  requireOwner,
  validate("param", navigationIdParam),
  validate("json", saveHomeBlockBody),
  responds(homeBlock),
  async (c) =>
    ok(
      c,
      await saveHomeBlock(database(), c.req.valid("param").id, c.req.valid("json"), principalOf(c).userId),
    ),
);
homeBlockRoutes.delete(
  "/:id",
  requireOwner,
  validate("param", navigationIdParam),
  responds(z.null()),
  async (c) => {
    await deleteHomeBlock(database(), c.req.valid("param").id, principalOf(c).userId);
    return ok(c, null);
  },
);

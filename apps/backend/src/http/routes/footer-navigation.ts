import {
  footerNavigation,
  footerNavigationList,
  idParam,
  reorderFooterNavigationBody,
  saveFooterNavigationBody,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import {
  deleteFooterNavigation,
  listFooterNavigations,
  type NavigationPlacement,
  reorderFooterNavigations,
  saveFooterNavigation,
} from "../../navigation/repository.js";
import { responds } from "../api-metadata.js";
import { principalOf, requireOwner, requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

export function navigationRoutes(placement: NavigationPlacement) {
  const footerNavigationRoutes = new Hono();
  footerNavigationRoutes.use("*", requireSession);
  footerNavigationRoutes.get("/", responds(footerNavigationList), async (c) =>
    ok(c, await listFooterNavigations(database(), placement)),
  );
  footerNavigationRoutes.patch(
    "/order",
    requireOwner,
    validate("json", reorderFooterNavigationBody),
    responds(footerNavigationList),
    async (c) =>
      ok(
        c,
        await reorderFooterNavigations(
          database(),
          c.req.valid("json").positions,
          principalOf(c).userId,
          placement,
        ),
      ),
  );
  footerNavigationRoutes.post(
    "/",
    requireOwner,
    validate("json", saveFooterNavigationBody),
    responds(footerNavigation),
    async (c) =>
      ok(
        c,
        await saveFooterNavigation(database(), null, c.req.valid("json"), principalOf(c).userId, placement),
      ),
  );
  footerNavigationRoutes.put(
    "/:id",
    requireOwner,
    validate("param", idParam),
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
          placement,
        ),
      ),
  );
  footerNavigationRoutes.delete(
    "/:id",
    requireOwner,
    validate("param", idParam),
    responds(z.null()),
    async (c) => {
      await deleteFooterNavigation(database(), c.req.valid("param").id, principalOf(c).userId, placement);
      return ok(c, null);
    },
  );

  return footerNavigationRoutes;
}
export const footerNavigationRoutes = navigationRoutes("footer");
export const mainNavigationRoutes = navigationRoutes("main");

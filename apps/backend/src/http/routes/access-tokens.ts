import { issuedToken, issueTokenBody, tokenList, tokenSummary } from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { issueAccessToken, listAccessTokens, revokeAccessToken } from "../../auth/access-token.js";
import { database } from "../../db/connect.js";
import { responds } from "../api-metadata.js";
import { principalOf, requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

const tokenIdParam = z.object({ id: z.uuid() });
export const accessTokenRoutes = new Hono();
accessTokenRoutes.use("*", requireSession);

accessTokenRoutes.get("/", responds(tokenList), async (c) =>
  ok(c, await listAccessTokens(database(), principalOf(c).userId)),
);
accessTokenRoutes.post(
  "/",
  validate("json", issueTokenBody),
  responds(issuedToken, { status: 201 }),
  async (c) => {
    c.header("Cache-Control", "no-store");
    return ok(c, await issueAccessToken(database(), principalOf(c).userId, c.req.valid("json")), 201);
  },
);
accessTokenRoutes.delete("/:id", validate("param", tokenIdParam), responds(tokenSummary), async (c) =>
  ok(
    c,
    tokenSummary.parse(await revokeAccessToken(database(), principalOf(c).userId, c.req.valid("param").id)),
  ),
);

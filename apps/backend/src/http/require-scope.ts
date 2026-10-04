import { ErrorCode, type TokenScope } from "@layered/schemas";
import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../auth/access-token.js";
import { getSessionCookie } from "../auth/cookie.js";
import { readSession } from "../auth/session.js";
import { database } from "../db/connect.js";
import { byAddress, enforceRateLimit } from "./rate-limit.js";
import { principalOf } from "./require-session.js";
import { HttpError } from "./response.js";

/** Browser sessions and bearer PATs are verified by separate code paths. */
export function requireScope(scope: TokenScope) {
  return createMiddleware(async (c, next) => {
    const header = c.req.header("authorization");
    if (header !== undefined) {
      enforceRateLimit(c, {
        name: "bearer-source",
        limit: 60,
        windowSeconds: 60,
        keys: (context) => [byAddress(context)],
      });
      const match = /^Bearer (lwpat_[A-Za-z0-9_-]{43})$/.exec(header);
      const token = match ? await verifyAccessToken(database(), match[1] ?? "") : null;
      if (!token) throw new HttpError(ErrorCode.Unauthenticated, "This access token is not valid.");
      enforceRateLimit(c, {
        name: "bearer-token",
        limit: 120,
        windowSeconds: 60,
        keys: (context) => [`token:${token.tokenId}`, byAddress(context)],
      });
      if (!token.scopes.includes(scope))
        throw new HttpError(ErrorCode.Forbidden, `Missing token scope: ${scope}.`);
      c.set("principal", token);
    } else {
      const session = await readSession(database(), getSessionCookie(c));
      if (!session) throw new HttpError(ErrorCode.Unauthenticated, "You are not signed in.");
      c.set("principal", session);
    }
    await next();
  });
}

/** Saving publicly visible content needs the separate publish scope. */
export const requirePublishScope = createMiddleware(async (c, next) => {
  const principal = principalOf(c);
  if (principal.tokenId && !principal.scopes.includes("content:publish"))
    throw new HttpError(ErrorCode.Forbidden, "Missing token scope: content:publish.");
  await next();
});

/** A save that would be public requires publishing authority before the handler. */
export const requirePublishForPublicSave = createMiddleware(async (c, next) => {
  const value = c.req.valid("json" as never) as { state?: string } | undefined;
  const principal = principalOf(c);
  if (value?.state === "public" && principal.tokenId && !principal.scopes.includes("content:publish"))
    throw new HttpError(ErrorCode.Forbidden, "Missing token scope: content:publish.");
  await next();
});

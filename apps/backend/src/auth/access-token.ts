import { createHash, randomBytes } from "node:crypto";
import {
  ErrorCode,
  type IssuedToken,
  type IssueTokenBody,
  type TokenScope,
  type TokenSummary,
} from "@layered/schemas";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import { accessTokens, auditLog, users } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

type TokenRow = typeof accessTokens.$inferSelect;

/** The prefix is the credential's purpose claim; browser cookies have a different format and verifier. */
const PREFIX = "lwpat_";
const TOKEN_PATTERN = /^lwpat_[A-Za-z0-9_-]{43}$/;

function digest(value: string): string {
  return createHash("sha256").update("personal-access-token:").update(value).digest("hex");
}

function summary(row: TokenRow): TokenSummary {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

export async function issueAccessToken(
  db: Database,
  userId: string,
  value: IssueTokenBody,
): Promise<IssuedToken> {
  const expiresAt = value.expiresAt ? new Date(value.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date())
    throw new HttpError(ErrorCode.InvalidRequest, "Choose an expiry in the future.");
  const raw = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await db.transaction(async (tx) => {
    const [issued] = await tx
      .insert(accessTokens)
      .values({
        userId,
        name: value.name,
        scopes: value.scopes,
        expiresAt,
        tokenHash: digest(raw),
      })
      .onConflictDoNothing({ target: [accessTokens.userId, accessTokens.name] })
      .returning();
    if (!issued) throw new HttpError(ErrorCode.Conflict, "A token already uses this name.");
    await tx.insert(auditLog).values({
      actorUserId: userId,
      action: "token.issued",
      subjectType: "access_tokens",
      subjectId: issued.id,
      detail: { scopes: value.scopes, expiresAt: value.expiresAt },
    });
    return issued;
  });
  return { ...summary(row), value: raw };
}

export async function listAccessTokens(db: Database, userId: string): Promise<TokenSummary[]> {
  return (
    await db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.userId, userId))
      .orderBy(desc(accessTokens.createdAt))
  ).map(summary);
}

export async function revokeAccessToken(db: Database, userId: string, id: string): Promise<TokenSummary> {
  const row = await db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(accessTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(accessTokens.id, id), eq(accessTokens.userId, userId), isNull(accessTokens.revokedAt)))
      .returning();
    if (!revoked) throw new HttpError(ErrorCode.NotFound, "There is no active token with this id.");
    await tx
      .insert(auditLog)
      .values({ actorUserId: userId, action: "token.revoked", subjectType: "access_tokens", subjectId: id });
    return revoked;
  });
  return summary(row);
}

export type TokenPrincipal = {
  userId: string;
  tokenId: string;
  email: string;
  displayName: string;
  role: "owner" | "editor";
  scopes: TokenScope[];
};

/** Checks only PATs, and looks up revocation and expiry on every request. */
export async function verifyAccessToken(db: Database, value: string): Promise<TokenPrincipal | null> {
  if (!TOKEN_PATTERN.test(value)) return null;
  const now = new Date();
  const [found] = await db
    .select({
      tokenId: accessTokens.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      scopes: accessTokens.scopes,
    })
    .from(accessTokens)
    .innerJoin(users, eq(users.id, accessTokens.userId))
    .where(
      and(
        eq(accessTokens.tokenHash, digest(value)),
        isNull(accessTokens.revokedAt),
        or(isNull(accessTokens.expiresAt), gt(accessTokens.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!found) return null;
  const [used] = await db
    .update(accessTokens)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(accessTokens.id, found.tokenId),
        isNull(accessTokens.revokedAt),
        or(isNull(accessTokens.expiresAt), gt(accessTokens.expiresAt, now)),
      ),
    )
    .returning({ id: accessTokens.id });
  return used ? found : null;
}

import { z } from "zod";
import { body, MaxLength, text } from "./request.js";

export const TOKEN_SCOPES = ["content:read", "content:write", "content:publish", "media:write"] as const;
export const tokenScope = z.enum(TOKEN_SCOPES);
export type TokenScope = z.infer<typeof tokenScope>;

export const issueTokenBody = body({
  name: text(MaxLength.Line),
  scopes: z
    .array(tokenScope)
    .max(TOKEN_SCOPES.length)
    .refine((scopes) => new Set(scopes).size === scopes.length),
  expiresAt: z.iso.datetime().nullable(),
});
export type IssueTokenBody = z.infer<typeof issueTokenBody>;

export const tokenSummary = body({
  id: z.uuid(),
  name: z.string(),
  scopes: z.array(tokenScope),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export type TokenSummary = z.infer<typeof tokenSummary>;
export const tokenList = z.array(tokenSummary);
/** The secret is returned by issuance only, never by list or read. */
export const issuedToken = tokenSummary.extend({ value: z.string() });
export type IssuedToken = z.infer<typeof issuedToken>;

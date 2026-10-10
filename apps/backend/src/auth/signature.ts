import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { sessionSecret } from "../config.js";

/**
 * Signing for every value this API hands out and later reads back: the session
 * cookie, a form's challenge, a preview link and an upload token.
 *
 * **Each kind is signed with its own key**, derived from the session secret for
 * that purpose alone. Two kinds of value can have the same shape, a random part
 * and a signature joined by a dot, and with one shared key a value issued as one
 * kind would pass the check of another. With a key per purpose it cannot.
 *
 * In one place so that no caller computes an HMAC of its own, compares with
 * `===`, or forgets the length check a constant-time comparison needs.
 */

/** What a signed value is for. Every purpose has its own key. */
export type SigningPurpose = "session" | "form-challenge" | "entry-preview" | "media-upload";

/** The keys, derived once per purpose on first use. */
const keys = new Map<SigningPurpose, Buffer>();

/**
 * The key for one purpose, derived from the session secret with HKDF and the
 * info string `layered:<purpose>`.
 *
 * Changing the session secret therefore changes every key at once, which ends
 * every session and invalidates every outstanding link and token together.
 */
function keyFor(purpose: SigningPurpose): Buffer {
  let key = keys.get(purpose);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", sessionSecret, "", `layered:${purpose}`, 32));
    keys.set(purpose, key);
  }
  return key;
}

/**
 * Signs a value for one purpose.
 *
 * @param purpose - What the value is for.
 * @param value - The exact text the signature covers.
 * @returns The HMAC-SHA256 signature, base64url.
 */
export function sign(purpose: SigningPurpose, value: string): string {
  return createHmac("sha256", keyFor(purpose)).update(value).digest("base64url");
}

/**
 * Whether a signature presented with a value is the one this server made for
 * that purpose.
 *
 * @param purpose - What the value is supposed to be for.
 * @param value - The exact text the signature is supposed to cover.
 * @param claimed - The signature as it arrived, base64url.
 */
export function signedFor(purpose: SigningPurpose, value: string, claimed: string): boolean {
  const presented = Buffer.from(claimed, "base64url");
  const computed = Buffer.from(sign(purpose, value), "base64url");
  // Only the one way of writing those bytes. The last character of a 32-byte
  // value carries two bits that decoding ignores, so without this four
  // different strings would pass as the same signature.
  if (presented.toString("base64url") !== claimed) return false;
  return presented.length === computed.length && timingSafeEqual(presented, computed);
}

/**
 * A signed token that carries claims: a base64url JSON payload naming its
 * purpose and its expiry, a dot, and the payload's signature for that purpose.
 *
 * Everything the server decided travels in the token, so the requests between
 * issuing and reading it need no table, and nothing in it can be changed on the
 * way.
 *
 * @param purpose - What the tokens are for.
 * @param claims - What a token says, checked again when it is read.
 * @returns How to issue one, and how to read one back.
 */
export function claimsToken<Claims>(purpose: SigningPurpose, claims: z.ZodType<Claims>) {
  return {
    /**
     * Issues a token.
     *
     * @param value - The claims.
     * @param expiresAt - When it stops being accepted, in milliseconds since the epoch.
     */
    issue(value: Claims, expiresAt: number): string {
      const payload = Buffer.from(JSON.stringify({ purpose, expiresAt, claims: value })).toString(
        "base64url",
      );
      return `${payload}.${sign(purpose, payload)}`;
    },

    /**
     * Reads a token back, or refuses it.
     *
     * @param token - As it arrived.
     * @param now - The current time, which a test can fix.
     * @returns The claims, or null when the signature is not this server's for
     *   this purpose, the token is malformed, or it has expired. One answer for
     *   all of them, so a caller learns nothing about which.
     */
    read(token: string, now = Date.now()): Claims | null {
      const [payload, signature, extra] = token.split(".");
      if (!payload || !signature || extra !== undefined) return null;
      if (!signedFor(purpose, payload, signature)) return null;
      let decoded: { purpose?: unknown; expiresAt?: unknown; claims?: unknown };
      try {
        decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (decoded.purpose !== purpose || typeof decoded.expiresAt !== "number" || decoded.expiresAt <= now)
        return null;
      const parsed = claims.safeParse(decoded.claims);
      return parsed.success ? parsed.data : null;
    },
  };
}

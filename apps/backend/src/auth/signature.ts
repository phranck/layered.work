import { timingSafeEqual } from "node:crypto";

/**
 * Whether a signature presented with a value is the one this server made.
 *
 * In one place so that no caller can compare with `===`, whose running time
 * says how many leading characters were right, and so that the length check a
 * constant-time comparison needs first is never forgotten at a second site.
 *
 * @param claimed - The signature as it arrived, base64url.
 * @param expected - The signature this server computes for the same value, base64url.
 */
export function sameSignature(claimed: string, expected: string): boolean {
  const presented = Buffer.from(claimed, "base64url");
  const computed = Buffer.from(expected, "base64url");
  return presented.length === computed.length && timingSafeEqual(presented, computed);
}

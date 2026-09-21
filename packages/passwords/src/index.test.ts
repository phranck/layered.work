import { describe, expect, it } from "vitest";
import { hashPassword, unmatchableHash, verifyPassword } from "./index.js";

describe("password hashes", () => {
  it("writes the parameters into the stored value, so an old hash stays verifiable", async () => {
    const stored = await hashPassword("a password");
    const [scheme, n, r, p, salt, hash] = stored.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBe(2 ** 15);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(Buffer.from(String(salt), "base64url")).toHaveLength(16);
    expect(Buffer.from(String(hash), "base64url")).toHaveLength(64);
  });

  it("gives two hashes of one password different salts", async () => {
    expect(await hashPassword("a password")).not.toBe(await hashPassword("a password"));
  });

  it("accepts the password it was given and refuses every other", async () => {
    const stored = await hashPassword("a password");
    expect(await verifyPassword("a password", stored)).toBe(true);
    expect(await verifyPassword("A password", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("verifies a hash written at a lower cost than the current one", async () => {
    // Hand-built at N of 2^14 rather than 2^15, which is what a stored value
    // from before a cost increase looks like. Raising SCRYPT must not lock
    // anybody out, and this is the line that says so.
    const { scrypt } = await import("node:crypto");
    const salt = Buffer.alloc(16, 7);
    const derived = await new Promise<Buffer>((resolve, reject) => {
      scrypt("a password", salt, 64, { N: 2 ** 14, r: 8, p: 1, maxmem: 256 * 2 ** 14 * 8 }, (error, key) =>
        error ? reject(error) : resolve(key),
      );
    });
    const stored = ["scrypt", 2 ** 14, 8, 1, salt.toString("base64url"), derived.toString("base64url")].join(
      "$",
    );
    expect(await verifyPassword("a password", stored)).toBe(true);
  });

  it("refuses a stored value that is not a scrypt hash, rather than throwing", async () => {
    for (const stored of ["", "plaintext", "bcrypt$1$2$3$4$5", "scrypt$$$$$"]) {
      expect(await verifyPassword("a password", stored)).toBe(false);
    }
  });

  it("makes an unmatchable hash that no password verifies against", async () => {
    const stored = await unmatchableHash();
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("", stored)).toBe(false);
    expect(await verifyPassword("a password", stored)).toBe(false);
    expect(await unmatchableHash()).not.toBe(stored);
  });
});

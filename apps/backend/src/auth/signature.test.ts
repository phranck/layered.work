import { describe, expect, it } from "vitest";
import { z } from "zod";
import { issueFormChallenge, verifyFormChallenge } from "../forms/challenge.js";
import { escapeMarkup } from "../markup.js";
import { readCookieValue } from "./session.js";
import { claimsToken, sign, signedFor } from "./signature.js";

describe("signing per purpose", () => {
  it("refuses a value signed for one purpose wherever another is expected", () => {
    const signature = sign("form-challenge", "contact.1760000000000.abc");
    expect(signedFor("form-challenge", "contact.1760000000000.abc", signature)).toBe(true);
    expect(signedFor("session", "contact.1760000000000.abc", signature)).toBe(false);
    expect(signedFor("entry-preview", "contact.1760000000000.abc", signature)).toBe(false);
  });

  it("does not let a form challenge pass as a session cookie", () => {
    // A challenge is `<time>.<random>.<signature over "<slug>.<time>.<random>">`,
    // so prefixing the slug gives a value that a shared key would accept as a cookie.
    const issuedAt = Date.now() - 10_000;
    const challenge = issueFormChallenge("contact", issuedAt);
    expect(verifyFormChallenge("contact", challenge, Date.now())).toBe(true);
    expect(readCookieValue(`contact.${challenge}`)).toBeNull();
  });

  it("refuses a signature written another way for the same bytes", () => {
    const signature = sign("session", "token");
    const altered = `${signature.slice(0, -1)}${signature.at(-1) === "A" ? "B" : "A"}`;
    expect(signedFor("session", "token", altered)).toBe(false);
  });
});

describe("claims tokens", () => {
  const claims = z.strictObject({ id: z.string() });
  const previews = claimsToken("entry-preview", claims);
  const uploads = claimsToken("media-upload", claims);

  it("reads back what it issued until it expires", () => {
    const token = previews.issue({ id: "a" }, 2_000);
    expect(previews.read(token, 1_000)).toEqual({ id: "a" });
    expect(previews.read(token, 2_000)).toBeNull();
  });

  it("refuses a token of another purpose with the same claims, and a changed one", () => {
    const token = previews.issue({ id: "a" }, 2_000);
    expect(uploads.read(token, 1_000)).toBeNull();
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ purpose: "entry-preview", expiresAt: 9_999, claims: { id: "b" } }),
    );
    expect(previews.read(`${forged.toString("base64url")}.${signature}`, 1_000)).toBeNull();
    expect(previews.read(`${payload}.${signature}.extra`, 1_000)).toBeNull();
  });
});

describe("escaping markup", () => {
  it("writes all five characters that mean something in HTML and XML", () => {
    expect(escapeMarkup(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

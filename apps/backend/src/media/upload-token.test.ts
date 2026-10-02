import { describe, expect, it } from "vitest";
import { issueUploadToken, readUploadToken, type UploadClaims } from "./upload-token.js";

const claims: UploadClaims = {
  storageKey: "uploads/AAAAAAAAAAAAAAAAAAAAAA",
  slug: "a-portrait",
  type: "image/png",
  size: 1_234,
  userId: "00000000-0000-4000-8000-000000000001",
};

describe("an upload token", () => {
  it("reads back what it was issued with", () => {
    expect(readUploadToken(issueUploadToken(claims))).toEqual(claims);
  });

  it("is refused once it has expired", () => {
    const issued = issueUploadToken(claims, 0);
    expect(readUploadToken(issued, 11 * 60 * 1000)).toBeNull();
  });

  it("is refused when anything in it was changed", () => {
    const [payload, signature] = issueUploadToken(claims).split(".");
    const changed = Buffer.from(
      Buffer.from(payload ?? "", "base64url")
        .toString("utf8")
        .replace("1234", "9999"),
    ).toString("base64url");
    expect(readUploadToken(`${changed}.${signature}`)).toBeNull();
  });

  it("is refused when it is not a token at all", () => {
    expect(readUploadToken("nonsense")).toBeNull();
    expect(readUploadToken("a.b.c")).toBeNull();
  });
});

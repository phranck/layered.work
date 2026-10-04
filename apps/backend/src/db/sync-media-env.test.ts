import { describe, expect, it } from "vitest";
import { activateMediaSyncBucket, requireLocalMediaDatabase } from "./sync-media-env.js";

describe("media sync bucket configuration", () => {
  it("refuses a hosted database for bucket maintenance", () => {
    expect(() => requireLocalMediaDatabase("postgres://app@127.0.0.1:5434/layered")).not.toThrow();
    expect(() => requireLocalMediaDatabase("postgres://app@db.zerops:5432/layered")).toThrow(
      "local development database",
    );
  });

  it("uses the dedicated Zerops credentials for the sync command", () => {
    const environment: NodeJS.ProcessEnv = {
      ZEROPS_S3_ENDPOINT: "https://storage.example.test",
      ZEROPS_S3_BUCKET: "media",
      ZEROPS_S3_ACCESS_KEY_ID: "test-key",
      ZEROPS_S3_SECRET_ACCESS_KEY: "test-secret",
    };

    activateMediaSyncBucket(environment);

    expect(environment.S3_ENDPOINT).toBe(environment.ZEROPS_S3_ENDPOINT);
    expect(environment.S3_BUCKET).toBe(environment.ZEROPS_S3_BUCKET);
    expect(environment.S3_ACCESS_KEY_ID).toBe(environment.ZEROPS_S3_ACCESS_KEY_ID);
    expect(environment.S3_SECRET_ACCESS_KEY).toBe(environment.ZEROPS_S3_SECRET_ACCESS_KEY);
  });

  it("rejects conflicting bucket settings before opening a connection", () => {
    const environment: NodeJS.ProcessEnv = {
      S3_BUCKET: "another-bucket",
      ZEROPS_S3_BUCKET: "media",
    };

    expect(() => activateMediaSyncBucket(environment)).toThrow("Conflicting S3_BUCKET");
  });
});

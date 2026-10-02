import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localMediaPath, readLocalMediaObject } from "./storage.js";

/**
 * Media read from a directory on this machine, which is how the dashboard shows
 * pictures locally without reaching the production bucket.
 */

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "layered-media-"));
  await mkdir(join(root, "media"));
  await writeFile(join(root, "media", "portrait.webp"), "picture");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("media kept on this machine", () => {
  it("reads the file a storage key names, below the configured directory", async () => {
    const stream = await readLocalMediaObject(root, "media/portrait.webp");
    expect(await new Response(stream).text()).toBe("picture");
  });

  it("refuses a key that would leave the directory", () => {
    expect(() => localMediaPath(root, "../secret")).toThrow();
    expect(() => localMediaPath(root, "/etc/passwd")).toThrow();
    expect(() => localMediaPath(root, "media/../../secret")).toThrow();
  });
});

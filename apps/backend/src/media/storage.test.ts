import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localMediaPath, readLocalMediaObject, writeLocalMediaObject } from "./storage.js";

/**
 * Media kept in a directory on this machine, which is how the dashboard shows
 * and stores pictures locally without reaching the production bucket.
 */

let root: string;

/** A request body holding these bytes. */
function bodyOf(text: string): ReadableStream<Uint8Array> {
  return new Response(text).body as ReadableStream<Uint8Array>;
}

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

  it("writes an upload where its key says", async () => {
    const written = await writeLocalMediaObject(root, "uploads/one", bodyOf("bytes"), 5);
    expect(written).toBe(5);
    expect(await readFile(join(root, "uploads", "one"), "utf8")).toBe("bytes");
  });

  it("refuses more bytes than were declared, and keeps nothing of them", async () => {
    await expect(writeLocalMediaObject(root, "uploads/two", bodyOf("too many"), 3)).rejects.toThrow();
    await expect(readFile(join(root, "uploads", "two"))).rejects.toThrow();
  });

  it("never replaces what a key already holds", async () => {
    await expect(writeLocalMediaObject(root, "media/portrait.webp", bodyOf("other"), 10)).rejects.toThrow();
    expect(await readFile(join(root, "media", "portrait.webp"), "utf8")).toBe("picture");
  });
});

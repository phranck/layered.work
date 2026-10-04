import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { migrationMedia } from "./migration-media.mjs";

test("checks rendered storage-key media against the local source and snapshot checksum", async () => {
  const root = await mkdtemp(join(tmpdir(), "layered-migration-media-"));
  try {
    const localRoot = join(root, "local");
    const clientRoot = join(root, "client");
    await mkdir(join(localRoot, "migration"), { recursive: true });
    await mkdir(join(clientRoot, "media"), { recursive: true });
    const picture = Buffer.from("picture bytes");
    await writeFile(join(localRoot, "migration", "picture.jpg"), picture);
    await writeFile(join(localRoot, "migration", "manual.pdf"), picture);
    await writeFile(join(clientRoot, "media", "legacy.jpg"), picture);
    const checksum = createHash("sha256").update(picture).digest("hex");
    const media = migrationMedia(
      [{ src: "/migration/picture.jpg", source: "migration/picture.jpg", sha256: checksum }],
      { localRoot, clientRoot },
    );

    assert.equal(media.isMediaPath("/migration/picture.jpg"), true);
    assert.equal(media.isMediaPath("/migration/missing.jpg"), true);
    assert.equal(media.isMediaPath("/media/legacy.jpg"), true);
    assert.equal(await media.inspect("/migration/picture.jpg"), null);
    assert.equal(await media.inspect("/migration/manual.pdf"), null);
    assert.equal(await media.inspect("/media/legacy.jpg"), null);
    assert.equal(await media.inspect("/migration/missing.jpg"), "missing file /migration/missing.jpg");

    await writeFile(join(localRoot, "migration", "picture.jpg"), Buffer.from("changed"));
    assert.equal(await media.inspect("/migration/picture.jpg"), "changed file /migration/picture.jpg");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

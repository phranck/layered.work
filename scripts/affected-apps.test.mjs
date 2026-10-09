import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { affectedApps, changedFiles, readWorkspaces } from "./affected-apps.mjs";

/**
 * A graph shaped like this repository's: a backend reaching a leaf package
 * through a middle one, and a site that depends on a package of its own.
 */
const workspaces = [
  { name: "@test/api", dir: "apps/api", dependsOn: ["@test/middle"] },
  { name: "@test/site", dir: "apps/site", dependsOn: ["@test/look"] },
  { name: "@test/middle", dir: "packages/middle", dependsOn: ["@test/leaf"] },
  { name: "@test/leaf", dir: "packages/leaf", dependsOn: [] },
  { name: "@test/look", dir: "packages/look", dependsOn: [] },
];

const scratch = mkdtempSync(join(tmpdir(), "affected-apps-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Writes files into a fresh directory under the scratch space and returns it. */
function tree(name, files) {
  const root = join(scratch, name);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe("affectedApps", () => {
  test("a change inside an app reaches that app alone", () => {
    assert.deepEqual(affectedApps(["apps/site/src/page.ts"], workspaces), { api: false, site: true });
  });

  test("a change to a package reaches every app depending on it, through other packages too", () => {
    assert.deepEqual(affectedApps(["packages/leaf/src/index.ts"], workspaces), { api: true, site: false });
  });

  test("a directory that only shares a prefix with a workspace is not that workspace", () => {
    assert.deepEqual(affectedApps(["apps/sitemap.txt"], workspaces), { api: true, site: true });
  });

  test("prose outside every workspace reaches nothing", () => {
    assert.deepEqual(affectedApps(["README.md", "docs/hosting.md"], workspaces), { api: false, site: false });
  });

  test("any other file outside every workspace reaches every app", () => {
    assert.deepEqual(affectedApps(["apps/site/a.ts", "tsconfig.base.json"], workspaces), {
      api: true,
      site: true,
    });
  });

  test("an unknown change reaches every app", () => {
    assert.deepEqual(affectedApps(undefined, workspaces), { api: true, site: true });
  });
});

describe("readWorkspaces", () => {
  test("reads each workspace with the workspaces it depends on, from every dependency field", () => {
    const root = tree("graph", {
      "pnpm-workspace.yaml":
        'packages:\n  - "apps/*"\n  - packages/*\n\n# not a pattern\nallowBuilds:\n  esbuild: true\n',
      "apps/api/package.json": JSON.stringify({
        name: "@test/api",
        dependencies: { "@test/leaf": "workspace:*", react: "^19.0.0" },
        devDependencies: { "@test/tools": "workspace:^" },
      }),
      "packages/leaf/package.json": JSON.stringify({ name: "@test/leaf" }),
      "packages/tools/package.json": JSON.stringify({ name: "@test/tools" }),
      "packages/notes/README.md": "No manifest, so not a workspace.",
    });
    const byName = Object.fromEntries(readWorkspaces(root).map((workspace) => [workspace.name, workspace]));
    assert.deepEqual(Object.keys(byName).sort(), ["@test/api", "@test/leaf", "@test/tools"]);
    assert.equal(byName["@test/api"].dir, "apps/api");
    assert.deepEqual(byName["@test/api"].dependsOn, ["@test/leaf", "@test/tools"]);
  });

  test("refuses a pattern it cannot read rather than leaving workspaces out", () => {
    const root = tree("deep", { "pnpm-workspace.yaml": "packages:\n  - packages/**\n" });
    assert.throws(() => readWorkspaces(root), /packages\/\*\*/);
  });
});

describe("changedFiles", () => {
  const root = tree("repository", { "a.txt": "one\n" });
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  // Whatever the machine's own configuration signs or hooks, these commits are throwaway.
  const throwaway = [
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
  ];
  const commit = (message) => git(...throwaway, "commit", "--quiet", "--no-verify", "-m", message);
  git("init", "--quiet");
  git("add", "a.txt");
  commit("base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(root, "b.txt"), "two\n");
  git("add", "b.txt");
  commit("add");
  const added = git("rev-parse", "HEAD");
  git("mv", "b.txt", "c.txt");
  commit("move");

  test("lists the files changed since the base", () => {
    assert.deepEqual(changedFiles(base, root), ["c.txt"]);
  });

  test("lists a moved file at the path it left as well as the one it reached", () => {
    assert.deepEqual(changedFiles(added, root), ["b.txt", "c.txt"]);
  });

  test("has no answer without a base, for a new branch, or for a base that cannot be found", () => {
    assert.equal(changedFiles("", root), undefined);
    assert.equal(changedFiles(undefined, root), undefined);
    assert.equal(changedFiles("0".repeat(40), root), undefined);
    assert.equal(changedFiles("f".repeat(40), root), undefined);
    assert.equal(changedFiles("HEAD~1", root), undefined);
  });
});

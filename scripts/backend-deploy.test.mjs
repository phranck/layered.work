import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { backendDeployFiles, root } from "./backend-deploy-files.mjs";

const read = (path) => readFileSync(new URL(path, root), "utf8");
const manifest = (path) => JSON.parse(read(`${path}/package.json`));
const deployFiles = new Set(backendDeployFiles());

test("backend deploy includes the runtime workspace dependency closure", () => {
  const visited = new Set();
  const visit = (path) => {
    if (visited.has(path)) return;
    visited.add(path);

    const dependencies = manifest(path).dependencies ?? {};
    for (const [name, version] of Object.entries(dependencies)) {
      if (version !== "workspace:*") continue;
      const dependencyPath = `packages/${name.replace("@layered/", "")}`;
      const dependency = manifest(dependencyPath);
      assert.ok(deployFiles.has(`${dependencyPath}/dist`), `${name}: missing built output`);
      assert.ok(deployFiles.has(`${dependencyPath}/package.json`), `${name}: missing manifest`);
      if (Object.values(dependency.dependencies ?? {}).some((value) => !value.startsWith("workspace:"))) {
        assert.ok(deployFiles.has(`${dependencyPath}/node_modules`), `${name}: missing runtime dependencies`);
      }
      visit(dependencyPath);
    }
  };

  visit("apps/backend");
});

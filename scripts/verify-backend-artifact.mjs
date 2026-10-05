import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backendDeployFiles, root } from "./backend-deploy-files.mjs";

const source = fileURLToPath(root);
const staging = mkdtempSync(join(tmpdir(), "layered-backend-artifact-"));

try {
  for (const path of backendDeployFiles()) {
    const target = join(staging, path);
    mkdirSync(dirname(target), { recursive: true });
    if (path === "node_modules") {
      // The dependency store is large; the artifact includes this directory.
      // Linking it keeps this check fast while every workspace link still
      // resolves against the staged package paths.
      symlinkSync(join(source, path), target, "dir");
    } else {
      cpSync(join(source, path), target, { recursive: true });
    }
  }

  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import('./apps/backend/dist/http/app.js'); const {renderSocialCard}=await import('./apps/backend/dist/social/card.js'); const card=await renderSocialCard('Artifact check'); if(card.wordmark.centerOffsetX>1)throw new Error('Uncentered social card')",
    ],
    {
      cwd: staging,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "postgres://test@127.0.0.1:1/test",
        SITE_ORIGIN: "https://layered.work",
        DASHBOARD_ORIGIN: "https://dashboard.layered.work",
        SESSION_SECRET: "artifact-check-only-xxxxxxxxxxxxxxxx",
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  console.log("Backend runtime imports resolve from the Zerops deploy artifact.");
} finally {
  rmSync(staging, { recursive: true, force: true });
}

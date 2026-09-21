/**
 * Throws the local database away and builds it again from the schema.
 *
 * Whilst nothing uses this site, a schema change is not a migration: the
 * generated file in `apps/backend/drizzle/` describes the schema as it stands,
 * and the database is rebuilt rather than altered. This is the command that
 * rebuilds it.
 *
 * It refuses to touch anything but the local container. The address it works
 * against is fixed here rather than read from `DATABASE_URL`, because a reset
 * pointed at the wrong database is not a mistake anybody gets to undo.
 *
 * ```sh
 * pnpm db:reset
 * ```
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The compose project in `compose.yml`, and the one container this may remove. */
const PROJECT = "layered-work";
const CONTAINER = "layered-postgres";

/**
 * The loopback port `compose.yml` binds.
 *
 * Stated so the check below can prove that what answers is this project's own
 * container rather than a sibling's, which `data-safety.md` asks for: a
 * connection that succeeds says something is listening, not that it is the
 * right thing.
 */
const PORT = "5434";

/**
 * How long the container may take to report healthy.
 *
 * `compose.yml` allows the health check 30 attempts two seconds apart after a
 * five-second grace period, so it gives up at 65 seconds. This waits a little
 * longer, because the one that should report the failure is the check that
 * knows what it was waiting for.
 */
const HEALTH_TIMEOUT_MS = 90_000;

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

/** Runs a command in the repository root and stops the reset when it fails. */
function run(command, args, { quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed`);
  return result.stdout?.trim() ?? "";
}

const inspected = spawnSync("docker", ["inspect", "--format", "{{.Name}}", CONTAINER], {
  encoding: "utf8",
});
assert.equal(
  inspected.status === 0 ? inspected.stdout.trim() : "",
  `/${CONTAINER}`,
  `This resets ${CONTAINER} and nothing else. It is not running, so there is nothing to reset: start it with docker compose up -d.`,
);
const bound = run("docker", ["port", CONTAINER, "5432/tcp"], { quiet: true });
assert.ok(
  bound.includes(`:${PORT}`),
  `${CONTAINER} is not on ${PORT}, so this is not the container compose.yml declares`,
);

/**
 * Waits until the container reports healthy, asking Docker rather than compose.
 *
 * `docker compose up --wait` answers the same question and has been seen to
 * return a failure immediately after the container started, before it had
 * waited for anything. Reading the health status in a loop says exactly what is
 * true at each moment and what was true when it gave up.
 */
function waitUntilHealthy() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let status = "";
  while (Date.now() < deadline) {
    status = spawnSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", CONTAINER], {
      encoding: "utf8",
    }).stdout?.trim();
    if (status === "healthy") return;
    spawnSync("sleep", ["1"]);
  }
  assert.fail(`${CONTAINER} never became healthy. Its last reported status was "${status}".`);
}

process.stdout.write("Removing the container and its volume.\n");
run("docker", ["compose", "-p", PROJECT, "down", "--volumes"]);
process.stdout.write("Starting it again and waiting for the roles to exist.\n");
run("docker", ["compose", "-p", PROJECT, "up", "--detach"]);
waitUntilHealthy();
process.stdout.write("Applying the schema.\n");
run("pnpm", ["--filter", "@layered/backend", "db:migrate"]);
process.stdout.write("Seeding the owner account.\n");
run("pnpm", ["--filter", "@layered/backend", "db:seed"]);
process.stdout.write("The database is the schema, and nothing else.\n");

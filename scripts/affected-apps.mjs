import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Which apps a change reaches.
 *
 * The gate asks so that it starts a database only where the backend's suite
 * will use one, and the deploy asks so that it rolls out only what changed.
 * Both read the one answer the gate publishes, so a change the gate tested
 * without a database is never one the deploy then ships to the backend.
 *
 * Run as `node scripts/affected-apps.mjs <base commit>`. It prints one
 * `<app>=true|false` line per directory under `apps/`, which is the format
 * `$GITHUB_OUTPUT` reads.
 */

/**
 * Paths outside every workspace that no service is built from.
 *
 * Kept short on purpose. A path missing here reaches every app, which costs a
 * redundant deployment. A path wrongly listed here ships a change nowhere and
 * lets the gate test it without a database.
 */
export const REACHES_NOTHING = [
  /^README\.md$/,
  /^docs\//,
  /^\.github\/workflows\/ci\.yml$/,
  /^compose\.yml$/,
  /^\.env\.example$/,
  /^grat\.config$/,
  /^\.grat\//,
  /^\.editorconfig$/,
];

/** The commit GitHub names as `before` when a push creates the branch. */
const NULL_COMMIT = /^0{40}$/;

/** A full commit hash, which is the only form a base arrives in from GitHub. */
const COMMIT = /^[0-9a-f]{40}$/;

/**
 * A workspace and the workspaces it depends on.
 *
 * @typedef {object} Workspace
 * @property {string} name - The package name, such as `@layered/content`.
 * @property {string} dir - Its directory relative to the repository root, without a trailing slash.
 * @property {string[]} dependsOn - The names of the workspaces it depends on through the `workspace:` protocol, in any dependency field.
 */

/**
 * Reads the workspaces pnpm knows, with the workspaces each one depends on.
 *
 * Read from `pnpm-workspace.yaml` and the manifests rather than asked of pnpm,
 * so it works before anything is installed. Only patterns of the form `dir/*`
 * are understood, and any other pattern stops the run: read wrongly, it would
 * leave a workspace out of the graph, and every change to that workspace would
 * reach nothing.
 *
 * @param {string} root - The repository root.
 * @returns {Workspace[]} Every directory a pattern matches that has a `package.json`.
 */
export function readWorkspaces(root) {
  const config = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  const block = config.split(/^packages:[ \t]*$/m)[1]?.split(/^\S/m)[0] ?? "";
  const patterns = [...block.matchAll(/^\s+-\s+["']?([^"'\s]+)["']?\s*$/gm)].map((match) => match[1]);

  return patterns.flatMap((pattern) => {
    if (!/^[^*]+\/\*$/.test(pattern)) {
      throw new Error(`pnpm-workspace.yaml: the pattern ${pattern} is not of the form dir/*.`);
    }
    const parent = pattern.slice(0, -2);
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, parent, entry.name, "package.json")))
      .map((entry) => {
        const dir = `${parent}/${entry.name}`;
        const manifest = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
        const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
        const dependsOn = fields.flatMap((field) =>
          Object.entries(manifest[field] ?? {})
            .filter(([, version]) => String(version).startsWith("workspace:"))
            .map(([name]) => name),
        );
        return { name: manifest.name, dir, dependsOn };
      });
  });
}

/**
 * Decides which apps a set of changed files reaches.
 *
 * A file belongs to the workspace whose directory holds it, and every workspace
 * depending on that one, directly or through another, is reached as well. A
 * file outside every workspace reaches every app unless `REACHES_NOTHING` lists
 * it, because a root file nobody anticipated is usually configuration that
 * every build reads.
 *
 * @param {string[] | undefined} files - Changed paths relative to the repository root, or `undefined` where the change is unknown, which reaches every app.
 * @param {Workspace[]} workspaces - The workspace graph, as `readWorkspaces` returns it.
 * @returns {Record<string, boolean>} One entry per workspace under `apps/`, keyed by its directory name.
 */
export function affectedApps(files, workspaces) {
  const apps = workspaces.filter((workspace) => workspace.dir.startsWith("apps/"));
  const answer = (isReached) => Object.fromEntries(apps.map((app) => [basename(app.dir), isReached(app)]));
  if (files === undefined) return answer(() => true);

  const reached = new Set();
  for (const file of files) {
    const owner = workspaces.find((workspace) => file.startsWith(`${workspace.dir}/`));
    if (owner) reached.add(owner.name);
    else if (!REACHES_NOTHING.some((pattern) => pattern.test(file))) return answer(() => true);
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const workspace of workspaces) {
      if (!reached.has(workspace.name) && workspace.dependsOn.some((name) => reached.has(name))) {
        reached.add(workspace.name);
        grew = true;
      }
    }
  }
  return answer((app) => reached.has(app.name));
}

/**
 * Lists the files that differ between a base commit and the checked-out one.
 *
 * A clone in CI holds one commit, so a base it lacks is fetched on its own,
 * which is all a comparison of two trees needs. A moved file is listed at both
 * paths, because moving it out of a workspace changes that workspace as much as
 * moving it in changes the other. The list is separated by NUL bytes, so a path
 * git would otherwise quote still matches its workspace.
 *
 * @param {string | undefined} base - The commit to compare against.
 * @param {string} root - The repository root.
 * @returns {string[] | undefined} The paths, or `undefined` where no comparison can be made: no base, as on a manual run; the null commit of a new branch; a value that is not a commit hash; or a base that cannot be fetched.
 */
export function changedFiles(base, root) {
  if (!base || NULL_COMMIT.test(base)) return undefined;
  if (!COMMIT.test(base)) {
    console.error(`${base} is not a commit hash, so every app counts as reached.`);
    return undefined;
  }

  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    try {
      git("cat-file", "-e", `${base}^{commit}`);
    } catch {
      git("fetch", "--quiet", "--no-tags", "--depth=1", "origin", base);
    }
    return git("diff", "--name-only", "--no-renames", "-z", base, "HEAD").split("\0").filter(Boolean);
  } catch {
    console.error(`Cannot compare against ${base}, so every app counts as reached.`);
    return undefined;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const reached = affectedApps(changedFiles(process.argv[2], root), readWorkspaces(root));
  for (const [app, isReached] of Object.entries(reached)) console.log(`${app}=${isReached}`);
}

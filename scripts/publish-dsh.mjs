import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// Use an isolated index to publish the package as a branch root without
// switching the source checkout or changing its staged files.
export async function createPluginCommit(repository, packageDirectory, parent) {
  const temporary = await mkdtemp(join(tmpdir(), "yua-dsh-publish-"));
  const env = { ...process.env, GIT_INDEX_FILE: join(temporary, "index") };
  const git = (args, input) =>
    execFileSync("git", args, {
      cwd: repository,
      env,
      input,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  try {
    const [pack] = JSON.parse(
      execFileSync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["pack", "--dry-run", "--json", "--ignore-scripts"],
        { cwd: packageDirectory, encoding: "utf8" },
      ),
    );
    const paths = pack.files.map((file) => file.path);
    if (parent) {
      let previous;
      try {
        previous = JSON.parse(git(["show", `${parent}:package.json`]));
      } catch {
        throw new Error("Refusing to replace an existing non-DSH branch");
      }
      if (previous.name !== pack.name || !previous.dsh?.bundle)
        throw new Error("Refusing to replace an existing non-DSH branch");
    }
    for (const required of [
      "package.json",
      "index.mjs",
      "client.js",
      "cordis.patch.yml",
      "app/index.html",
    ])
      if (!paths.includes(required))
        throw new Error(
          `Missing plugin file: ${required}. Run npm run build:dsh first.`,
        );
    if (paths.some((path) => /[\r\n\0]/.test(path)))
      throw new Error("Unsupported package filename");
    const hashes = git(
      ["hash-object", "-w", "--stdin-paths"],
      paths.map((path) => resolve(packageDirectory, path)).join("\n") + "\n",
    ).split("\n");
    git(["read-tree", "--empty"]);
    git(
      ["update-index", "-z", "--index-info"],
      paths.map((path, index) => `100644 ${hashes[index]}\t${path}\0`).join(""),
    );
    const tree = git(["write-tree"]);
    if (parent && tree === git(["rev-parse", `${parent}^{tree}`]))
      return parent;
    const source = git(["rev-parse", "HEAD"]);
    return git([
      "commit-tree",
      tree,
      ...(parent ? ["-p", parent] : []),
      "-m",
      `Publish DSH plugin from ${source}`,
    ]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function publish() {
  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const ref = "refs/heads/dsh";
  let parent;
  if (git(["ls-remote", "--heads", "origin", ref])) {
    git(["fetch", "--no-tags", "origin", ref]);
    parent = git(["rev-parse", "FETCH_HEAD"]);
  }
  const commit = await createPluginCommit(root, join(root, "dsh"), parent);
  if (process.argv.includes("--dry-run")) {
    console.log(`Prepared DSH plugin commit ${commit}; no branch was pushed.`);
    return;
  }
  git(["push", "origin", `${commit}:${ref}`]);
  console.log(
    `Published ${commit} to dsh. Install: https://github.com/atlanmatrix/yua-canvas.git#dsh`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await publish();

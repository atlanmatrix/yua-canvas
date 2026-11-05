import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPluginCommit } from "../scripts/publish-dsh.mjs";

test("Git distribution has a standalone package root, preserves the source index, and advances without rewriting history", async () => {
  const root = await mkdtemp(join(tmpdir(), "yua-dsh-git-test-"));
  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git(["init", "-q"]);
    git(["config", "user.name", "DSH test"]);
    git(["config", "user.email", "dsh-test@example.invalid"]);
    await writeFile(join(root, "source.txt"), "source history");
    git(["add", "source.txt"]);
    git(["commit", "-qm", "Source"]);
    const source = git(["rev-parse", "HEAD"]);
    await writeFile(join(root, "source.txt"), "a user's staged edit");
    git(["add", "source.txt"]);
    const index = git(["write-tree"]);

    const directory = join(root, "dsh");
    await mkdir(join(directory, "app"), { recursive: true });
    const manifest = JSON.parse(
      await readFile(new URL("../dsh/package.json", import.meta.url)),
    );
    await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
    for (const file of [
      "index.mjs",
      "client.js",
      "cordis.patch.yml",
      "README.md",
    ])
      await writeFile(
        join(directory, file),
        await readFile(new URL(`../dsh/${file}`, import.meta.url)),
      );
    await writeFile(join(directory, "app/index.html"), "<html>Canvas</html>");
    const first = await createPluginCommit(root, directory);
    const published = git(["ls-tree", "-r", "--name-only", first]).split("\n");
    assert.ok(published.includes("app/index.html"));
    assert.ok(published.includes("client.js"));
    assert.ok(!published.includes("source.txt"));
    assert.ok(!published.some((path) => path.startsWith("dsh/")));
    const installed = JSON.parse(git(["show", `${first}:package.json`]));
    assert.equal(installed.name, "dsh-yua-canvas");
    assert.equal(installed.dsh.bundle.patch, "./cordis.patch.yml");
    assert.ok(!installed.scripts, "Git installation requires no build scripts");
    assert.equal(git(["rev-parse", "HEAD"]), source);
    assert.equal(git(["write-tree"]), index);
    await assert.rejects(
      createPluginCommit(root, directory, source),
      /non-DSH branch/,
    );
    assert.equal(await createPluginCommit(root, directory, first), first);

    await writeFile(
      join(directory, "app/index.html"),
      "<html>Updated Canvas</html>",
    );
    const next = await createPluginCommit(root, directory, first);
    assert.equal(git(["rev-parse", `${next}^`]), first);
    assert.equal(
      git(["show", `${next}:app/index.html`]),
      "<html>Updated Canvas</html>",
    );
    assert.equal(git(["rev-parse", "HEAD"]), source);
    assert.equal(git(["write-tree"]), index);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

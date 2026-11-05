import { execFileSync } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  {
    cwd: root,
    stdio: "inherit",
  },
);
execFileSync(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--mode",
    "dsh",
    "--base",
    "./",
    "--outDir",
    "dsh/app",
  ],
  {
    cwd: root,
    stdio: "inherit",
  },
);
const index = new URL("../dsh/app/index.html", import.meta.url);
await writeFile(
  index,
  (await readFile(index, "utf8")).replace(
    /\s*<link\b[^>]*rel="manifest"[^>]*>/g,
    "",
  ),
);
await rm(new URL("../dsh/app/manifest.webmanifest", import.meta.url), {
  force: true,
});
console.log(
  "DSH bundle ready: dsh/ (npm pack ./dsh to create an installable tarball)",
);

import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["pack", "./dsh", "--pack-destination", "dist"],
  { cwd: root, stdio: "inherit" },
);

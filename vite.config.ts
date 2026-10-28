import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { canvasPwa } from "./scripts/pwa";
import { pdfAssets } from "./scripts/pdfAssets";
const dateParts = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Shanghai",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());
const buildDate = ["year", "month", "day"]
  .map((type) => dateParts.find((part) => part.type === type)!.value)
  .join("");
const commit = (
  process.env.GITHUB_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  }).trim()
).slice(0, 7);
export default defineConfig({
  plugins: [react(), pdfAssets(), canvasPwa()],
  define: { __BUILD_VERSION__: JSON.stringify(`${buildDate}.${commit}`) },
});

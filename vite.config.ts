import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { canvasPwa } from "./scripts/pwa";
import { pdfAssets } from "./scripts/pdfAssets";
const dateParts = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
}).formatToParts(new Date());
const partValue = (type: Intl.DateTimeFormatPartTypes) =>
  dateParts.find((part) => part.type === type)!.value;
const buildDate = [partValue("year"), partValue("month"), partValue("day")].join("-");
const buildTime = [partValue("hour"), partValue("minute"), partValue("second")].join(":");
const commit = (
  process.env.GITHUB_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  }).trim()
).slice(0, 7);
export default defineConfig(({ mode }) => ({
  cacheDir: mode === "e2e" ? "node_modules/.vite-e2e" : undefined,
  plugins: [react(), pdfAssets(), ...(mode === "dsh" ? [] : [canvasPwa()])],
  define: {
    __BUILD_VERSION__: JSON.stringify(`${buildDate.slice(2).replaceAll("-", "")}.${commit}`),
    __BUILD_TIME__: JSON.stringify(`${buildDate}T${buildTime}+08:00`),
  },
}));

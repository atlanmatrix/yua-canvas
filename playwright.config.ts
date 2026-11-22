import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const port = 4175;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  // Tests use the system clipboard, shared by all browser contexts.
  workers: 1,
  use: {
    baseURL,
    headless: true,
    launchOptions: existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {},
  },
  webServer: {
    command: `vite --mode e2e --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});

// Runs against the released DSH CLI in an isolated profile. No API key or
// model request is needed. DSH_BIN may name a non-global dsh executable.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chromium, expect } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture.mjs";

const bin = process.env.DSH_BIN || "dsh";
const temporary = await mkdtemp(join(tmpdir(), "yua-dsh-host-"));
const env = {
  ...process.env,
  DSH_HOME: join(temporary, "home"),
  DSH_AGENTS_HOME: join(temporary, "agents"),
  XDG_DATA_HOME: join(temporary, "data"),
  XDG_CACHE_HOME: join(temporary, "cache"),
};
const manifest = JSON.parse(
  await readFile(new URL("../dsh/package.json", import.meta.url)),
);
const archive = resolve(`dist/${manifest.name}-${manifest.version}.tgz`);
const spec = process.env.DSH_TEST_SPEC || archive;
if (!process.env.DSH_TEST_SPEC)
  assert.ok(existsSync(archive), "Run npm run pack:dsh first");
let host, browser;
const exited = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
try {
  const installing = spawn(bin, ["plugin", "--profile", "web", "add", spec], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let installLog = "";
  installing.stdout.on("data", (data) => {
    installLog += data;
  });
  installing.stderr.on("data", (data) => {
    installLog += data;
  });
  const install = await exited(installing);
  assert.equal(install.code, 0, installLog);
  const profile = JSON.parse(
    await readFile(join(env.DSH_HOME, "profiles/web/package.json")),
  );
  assert.ok(profile.dsh.profile.bundles.includes(manifest.name));

  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  host = spawn(bin, ["web", "--no-open", "--port", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "",
    startupError;
  host.once("error", (error) => {
    startupError = error;
  });
  host.stdout.on("data", (data) => {
    log += data;
  });
  host.stderr.on("data", (data) => {
    log += data;
  });
  const deadline = Date.now() + 60000;
  let address;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (host.exitCode !== null) throw new Error(log);
    address = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0];
    if (address) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(address, "DSH did not start within 60 seconds");
  const origin = new URL(address).origin;
  // Assets ride Connection admission, including worker scripts and PDF fonts.
  assert.equal(
    (await fetch(`${origin}/api/yua-canvas/index.html`)).status,
    401,
  );
  browser = await chromium.launch({
    headless: true,
    ...(existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(address);
  // Fresh DSH profiles show the release's preview notice before navigation.
  await page
    .getByRole("button", { name: /^(Continue|继续)$/ })
    .click({ timeout: 30000 });
  // The account prompt is optional for a local canvas; dismiss it without
  // configuring credentials or making a provider request.
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Canvas", exact: true })
    .click({ timeout: 30000 });
  const canvas = page.frameLocator('iframe[title="Canvas of Yua"]');
  await expect(
    canvas.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await canvas.locator(".canvas").dblclick({ position: { x: 550, y: 350 } });
  await canvas
    .getByRole("textbox", { name: "文本内容" })
    .fill("DSH 安装包验证");
  await page.keyboard.press("ControlOrMeta+Enter");
  await canvas.getByTestId("files").setInputFiles({
    name: "test.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(),
  });
  await expect(canvas.locator(".pdf-preview canvas")).toBeVisible();
  await expect(
    canvas.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  const close = page.getByRole("button", { name: "Close", exact: true });
  await close.waitFor({ state: "visible", timeout: 3000 }).then(
    () => close.click(),
    () => {},
  );
  await page
    .getByRole("button", { name: "Canvas", exact: true })
    .click({ timeout: 30000 });
  await expect(canvas.getByTestId("card")).toHaveCount(2);
  await expect(
    canvas.getByTestId("card").filter({ hasText: "DSH 安装包验证" }),
  ).toBeVisible();
  await expect(canvas.locator(".pdf-preview canvas")).toBeVisible();
  assert.equal(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "DSH package installation, real sidebar, authenticated assets, PDF worker and persisted canvas passed.",
  );
} finally {
  await browser?.close();
  if (host && host.exitCode === null) {
    const stopped = exited(host);
    host.kill("SIGTERM");
    const force = setTimeout(() => host.kill("SIGKILL"), 5000);
    await stopped;
    clearTimeout(force);
  }
  await rm(temporary, { recursive: true, force: true });
}

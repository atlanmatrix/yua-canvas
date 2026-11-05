import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { runInNewContext } from "node:vm";
import { existsSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { apply, ROUTE } from "../dsh/index.mjs";
import { pdfFixture } from "./pdf-fixture.mjs";

const routes = new Map();
const source = await readFile(
  new URL("../dsh/client.js", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(
  await readFile(new URL("../dsh/package.json", import.meta.url)),
);
let server, browser, base;

before(async () => {
  assert.ok(
    existsSync(new URL("../dsh/app/index.html", import.meta.url)),
    "Run npm run build:dsh first",
  );
  apply({
    connection: {
      fetch: {
        register(route) {
          assert.ok(!routes.has(route.path), `duplicate route: ${route.path}`);
          routes.set(route.path, route);
        },
      },
    },
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("bundle manifest, client factory and navigation match DSH contracts", () => {
  assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(manifest.dsh.client.platform, "web");
  assert.equal(manifest.exports["./client"], "./client.js");
  const registrations = [];
  let client;
  runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(row) {
          assert.equal(row.id, manifest.name);
          client = row.factory((request) => {
            assert.equal(request, "react");
            return {};
          });
        },
      },
    },
  });
  client.apply({
    slots: {
      inject: (_slot, callback) => callback(),
      register: (options, component) =>
        registrations.push({ options, component }),
    },
  });
  assert.equal(registrations[0].options.name, "main");
  assert.equal(registrations[1].options.name, "sidebar.panellist");
  assert.equal(registrations[0].options.key, registrations[1].options.id);
  assert.equal(registrations[1].options.label, "Canvas");
});

test("all static resources use exact authenticated Connection routes and correct MIME types", async () => {
  assert.ok(routes.size > 200, "PDF resources and lazy chunks are included");
  for (const route of routes.values()) {
    assert.ok(route.path.startsWith(ROUTE));
    assert.ok(!route.path.includes(".."));
    assert.deepEqual(route.methods, ["GET", "HEAD"]);
    const response = await route.fetch(
      new Request(`http://localhost${route.path}`, { method: "HEAD" }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await response.text(), "");
  }
  for (const [suffix, mime] of [
    [".js", "text/javascript"],
    [".mjs", "text/javascript"],
    [".css", "text/css"],
    [".wasm", "application/wasm"],
  ]) {
    const [path, route] = [...routes].find(([path]) => path.endsWith(suffix));
    const response = await route.fetch(new Request(`http://localhost${path}`));
    assert.ok(response.headers.get("content-type").startsWith(mime));
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  assert.ok(!routes.has(`${ROUTE}sw.js`));
  assert.ok(!routes.has(`${ROUTE}manifest.webmanifest`));
  const html = await routes
    .get(`${ROUTE}index.html`)
    .fetch(new Request(`http://localhost${ROUTE}index.html`));
  assert.doesNotMatch(await html.text(), /rel="manifest"/);
});

test("production canvas works in an offset iframe: text, PDF worker, backup, reload and no Service Worker", async () => {
  const html = `<!doctype html><html><head><base href="/harness/"></head><body style="margin:0">
    <nav style="position:fixed;width:240px;height:100%;background:#eee">DSH shell</nav>
    <main id="panel" style="position:fixed;left:240px;top:36px;right:0;bottom:0"></main>
    <script>
    const R = { createElement(tag, props, ...children) {
      if (typeof tag === 'function') return tag(props || {});
      const element = document.createElement(tag);
      for (const [key, value] of Object.entries(props || {})) {
        if (key === 'style') Object.assign(element.style, value);
        else element.setAttribute(key, value);
      }
      element.append(...children);
      return element;
    }};
    window.__ModuleLoader__ = { load(row) { row.factory(() => R).apply({ slots: {
      inject(_name, callback) { callback(); },
      register(options, Component) { if (options.name === 'main') document.querySelector('#panel').append(Component()); }
    } }); }};
    ${source}
    </script></body></html>`;
  server = createServer(async (request, response) => {
    try {
      if (request.url === "/harness/") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(html);
        return;
      }
      const route = routes.get(
        new URL(request.url, "http://localhost").pathname.replace(
          /^\/harness/,
          "",
        ),
      );
      if (!route || !route.methods.includes(request.method)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const result = await route.fetch(
        new Request(`http://localhost${request.url}`, {
          method: request.method,
        }),
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/yua-canvas/") && response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${base}/harness/`);
  const frame = page.frameLocator('iframe[title="Canvas of Yua"]');
  await expect(
    frame.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  assert.equal(
    await page.locator("iframe").getAttribute("src"),
    `${base}/harness${ROUTE}index.html`,
  );
  await frame.locator(".canvas").dblclick({ position: { x: 500, y: 350 } });
  await frame
    .getByRole("textbox", { name: "文本内容" })
    .fill("迁移到 DeepSeek Harness");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(frame.getByTestId("card")).toHaveCount(1);
  await frame.getByTestId("files").setInputFiles({
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(),
  });
  await expect(frame.locator(".pdf-preview canvas")).toBeVisible();
  await expect(
    frame.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(frame.getByTestId("card")).toHaveCount(2);
  await expect(
    frame.getByTestId("card").filter({ hasText: "迁移到 DeepSeek Harness" }),
  ).toBeVisible();
  await frame.getByRole("button", { name: "设置", exact: true }).click();
  await frame.getByRole("button", { name: "导出", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await frame.getByRole("menuitem", { name: "画布", exact: true }).click();
  const download = await downloading;
  const chunks = [];
  for await (const chunk of await download.createReadStream())
    chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(backup.format, "yua-canvas-workspace");
  assert.equal(backup.cards.length, 2);
  await frame.locator(".canvas").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await expect(frame.getByTestId("card")).toHaveCount(0);
  await frame.getByTestId("import").setInputFiles({
    name: "workspace.json",
    mimeType: "application/json",
    buffer: Buffer.concat(chunks),
  });
  await frame.getByRole("button", { name: "确认替换", exact: true }).click();
  await expect(frame.getByTestId("card")).toHaveCount(2);
  await expect(frame.locator(".pdf-preview canvas")).toBeVisible();
  assert.equal(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
    0,
  );
  assert.deepEqual(errors, []);
  await page.close();
});

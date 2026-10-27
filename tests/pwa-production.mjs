import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { chromium, expect } from "@playwright/test";
const prefix = process.env.PWA_TEST_BASE || "/yua-canvas/";
let server,
  browser,
  origin,
  revision = 0;
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
before(async () => {
  execFileSync("npm", ["run", "build", "--", "--base", prefix], {
    stdio: "pipe",
  });
  server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify(
          url.pathname === "/api/session"
            ? { user: null }
            : { value: "private-response-never-cache" },
        ),
      );
      return;
    }
    if (!url.pathname.startsWith(prefix)) {
      res.writeHead(404);
      res.end();
      return;
    }
    let path = url.pathname.slice(prefix.length) || "index.html";
    try {
      let bytes = await readFile(resolve("dist", path));
      if (path === "sw.js" && revision)
        bytes = Buffer.from(
          bytes
            .toString()
            .replace(
              /const VERSION = "([^"]+)";/,
              (_, value) => `const VERSION = "${value}-test-${revision}";`,
            ),
        );
      res.writeHead(200, {
        "Content-Type": mime[extname(path)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({
    headless: true,
    ...(existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {}),
  });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});
async function app(context) {
  const page = await context.newPage();
  await page.goto(origin + prefix);
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  return page;
}
test("title, manifest and installation icons are valid at the Pages subpath", async () => {
  const context = await browser.newContext();
  try {
    const page = await app(context);
    await expect(page).toHaveTitle("Canvas of Yua");
    const manifestUrl = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    assert.equal(manifestUrl, prefix + "manifest.webmanifest");
    const manifest = await (await fetch(origin + manifestUrl)).json();
    assert.equal(manifest.name, "Canvas of Yua");
    assert.equal(manifest.start_url, "./");
    assert.equal(manifest.scope, "./");
    assert.equal(manifest.display, "standalone");
    assert.equal(
      new URL(manifest.start_url, origin + manifestUrl).pathname,
      prefix,
    );
    for (const icon of manifest.icons.filter((i) => i.type === "image/png")) {
      const r = await fetch(new URL(icon.src, origin + manifestUrl));
      assert.equal(r.status, 200);
      const bytes = Buffer.from(await r.arrayBuffer());
      const size = Number(icon.sizes.split("x")[0]);
      assert.equal(bytes.readUInt32BE(16), size);
      assert.equal(bytes.readUInt32BE(20), size);
    }
    assert.ok(
      (await (await fetch(origin + prefix + "icon.svg")).text()).includes(
        "<svg",
      ),
    );
    const cdp = await context.newCDPSession(page);
    const result = await cdp.send("Page.getAppManifest");
    assert.deepEqual(result.errors, []);
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          window.__installPromptCalled = true;
        },
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });
    await expect(
      page.getByRole("button", { name: "安装 Canvas of Yua", exact: true }),
    ).toHaveCount(0);
    assert.equal(
      await page.evaluate(() => window.__installPromptCalled),
      undefined,
    );
  } finally {
    await context.close();
  }
});
test("offline reload restores IndexedDB and lazy diagrams while APIs never enter cache", async () => {
  const context = await browser.newContext();
  try {
    const page = await app(context);
    await page.keyboard.press("n");
    await page.getByRole("textbox", { name: "文本内容" }).fill("离线画布");
    await page.keyboard.press("ControlOrMeta+Enter");
    await page.getByTestId("files").setInputFiles({
      name: "offline.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Offline\n```mermaid\ngraph LR; A-->B;\n```"),
    });
    await expect(page.getByTestId("card")).toHaveCount(2);
    await expect(
      page.locator('.save-indicator[data-state="已保存至本地"]'),
    ).toBeVisible();
    assert.equal(
      (await page.evaluate(() => fetch("/api/private").then((r) => r.json())))
        .value,
      "private-response-never-cache",
    );
    const cached = await page.evaluate(async () => {
      const entries = [];
      for (const name of await caches.keys())
        for (const r of await (await caches.open(name)).keys())
          entries.push(r.url);
      return entries;
    });
    assert.ok(cached.length > 20);
    assert.ok(
      cached.every((url) => !new URL(url).pathname.startsWith("/api/")),
    );
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("离线画布", { exact: true })).toBeVisible();
    await expect(page.getByTestId("card")).toHaveCount(2);
    await expect(page.getByText("离线", { exact: true })).toBeVisible();
    assert.equal(
      await page.evaluate(() =>
        fetch("/api/private")
          .then(() => "unexpected cache")
          .catch(() => "offline"),
      ),
      "offline",
    );
    await page.locator(".card-file").dblclick();
    await expect(page.locator(".detail-content svg")).toBeVisible({
      timeout: 20000,
    });
  } finally {
    await context.close();
  }
});
test("3D hierarchy and component opening work offline at the Pages subpath", async () => {
  const context = await browser.newContext();
  try {
    const page = await app(context);
    await page.getByTestId("import").setInputFiles({
      name: "hierarchy.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          id: "root",
          groups: [],
          cards: [
            {
              id: "child",
              kind: "canvas",
              title: "离线子画布",
              text: "",
              x: 80,
              y: 100,
              color: "#ffffff",
              canvas: {
                version: 1,
                id: "child-board",
                groups: [],
                cards: [
                  {
                    id: "note",
                    kind: "text",
                    title: "",
                    text: "离线 3D 组件",
                    x: 1800,
                    y: 1400,
                    width: 220,
                    height: 140,
                    color: "#ffffff",
                  },
                ],
              },
            },
          ],
        }),
      ),
    });
    await page.getByRole("button", { name: "确认替换" }).click();
    await expect(page.locator(".save-indicator")).toHaveAttribute(
      "data-state",
      "已保存至本地",
    );
    await page.getByTestId("minimap").click({ button: "right" });
    await page.getByRole("menuitem", { name: "分层视图" }).click();
    await expect(page.locator(".canvas3d-layer")).toHaveCount(2);
    await expect(page.getByTestId("canvas3d-scene")).toHaveCSS(
      "transform-style",
      "preserve-3d",
    );
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".canvas3d-layer")).toHaveCount(2);

    await page.locator('[data-3d-card="note"]').dblclick();
    await expect(page.getByRole("textbox", { name: "文本内容" })).toHaveValue(
      "离线 3D 组件",
    );
    assert.equal(new URL(page.url()).pathname, prefix);
    assert.equal(new URL(page.url()).hash, "");
  } finally {
    await context.close();
  }
});
test("complete workspace backup restores all canvases and views offline at the Pages subpath", async () => {
  const context = await browser.newContext();
  try {
    const page = await app(context);
    const card = (id, text) => ({
      id,
      kind: "text",
      title: "",
      text,
      x: 80,
      y: 100,
      width: 200,
      height: 100,
      color: "#ffffff",
    });
    await page.getByTestId("import").setInputFiles({
      name: "root.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          groups: [],
          cards: [
            card("root-note", "根内容"),
            {
              ...card("child", ""),
              kind: "canvas",
              title: "子画布",
              x: 400,
              canvas: {
                version: 1,
                id: "child-board",
                groups: [],
                cards: [card("child-note", "子级内容")],
              },
            },
          ],
        }),
      ),
    });
    await page.getByRole("button", { name: "确认替换" }).click();
    await page
      .getByRole("button", { name: "进入子画布 子画布", exact: true })
      .click();
    await page.getByRole("button", { name: "放大", exact: true }).click();
    const download = async () => {
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: "导出画布", exact: true }).click();
      const chunks = [];
      for await (const chunk of await (await pending).createReadStream())
        chunks.push(chunk);
      return Buffer.concat(chunks);
    };
    const bytes = await download(),
      original = JSON.parse(bytes.toString());
    assert.equal(original.cards.length, 2);
    assert.equal(original.format, "yua-canvas-workspace");
    assert.equal(original.workspace.view.z, 1.2);
    await page.getByRole("button", { name: "返回父画布", exact: true }).click();
    await context.setOffline(true);
    await page.getByTestId("import").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: bytes,
    });
    await page.getByRole("button", { name: "确认替换" }).click();
    await expect(page.locator(".canvas-navigation")).toHaveText("子画布");
    assert.deepEqual(JSON.parse((await download()).toString()), original);
    await page.reload();
    await expect(page.locator(".canvas-navigation")).toHaveText("子画布");
    assert.deepEqual(JSON.parse((await download()).toString()), original);
  } finally {
    await context.close();
  }
});
test("miniature static covers survive an offline reload without starting a scene", async () => {
  const context = await browser.newContext();
  try {
    const page = await app(context),
      scene = "https://atlanmatrix.github.io/codex-playground/city/";
    let loads = 0;
    await page.route(
      (url) =>
        url.origin === new URL(scene).origin &&
        url.pathname === new URL(scene).pathname,
      (route) => {
        loads++;
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<script>
      const parentOrigin=new URL(location.href).searchParams.get('parentOrigin');
      window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==parentOrigin||e.data?.type!=='little-worlds:capture')return;
        const canvas=document.createElement('canvas');canvas.width=96;canvas.height=72;canvas.getContext('2d').fillRect(0,0,96,72);
        parent.postMessage({type:'little-worlds:response',requestId:e.data.requestId,ok:true,result:{url:'${scene}?view=saved',dataUrl:canvas.toDataURL('image/webp')}},parentOrigin);
      });parent.postMessage({type:'little-worlds:ready'},parentOrigin);
      </script>`,
        });
      },
    );
    await page
      .getByRole("button", { name: "添加 miniature", exact: true })
      .click();
    await page.getByRole("button", { name: "使用示例场景" }).click();
    await page.getByRole("button", { name: "保存场景" }).click();
    await expect(page.locator(".miniature-cover")).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator(".save-indicator")).toHaveAttribute(
      "data-state",
      "已保存至本地",
    );
    const before = loads;
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".miniature-cover")).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    assert.equal(loads, before);
  } finally {
    await context.close();
  }
});
test("update saves pending canvas edits and does not reload other open tabs", async () => {
  const context = await browser.newContext();
  try {
    const page = await app(context);
    await page.keyboard.press("n");
    await page.getByRole("textbox", { name: "文本内容" }).fill("更新之前");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(
      page.locator('.save-indicator[data-state="已保存至本地"]'),
    ).toBeVisible();
    const second = await app(context);
    let navigations = 0;
    second.on("framenavigated", (frame) => {
      if (frame === second.mainFrame()) navigations++;
    });
    revision++;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration()).update();
    });
    await expect(
      page.getByRole("button", { name: "更新应用", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await page.locator(".card-text").dblclick();
    await page
      .getByRole("textbox", { name: "文本内容" })
      .fill("升级前未等待自动保存的修改");
    const navigation = page.waitForEvent(
      "framenavigated",
      (frame) => frame === page.mainFrame(),
    );
    await page.getByRole("button", { name: "更新应用", exact: true }).click();
    await navigation;
    await expect(
      page.getByText("升级前未等待自动保存的修改", { exact: true }),
    ).toBeVisible();
    assert.equal(navigations, 0);
    const cachesCount = await page.evaluate(
      async () =>
        (await caches.keys()).filter((key) => key.startsWith("canvas-of-yua:"))
          .length,
    );
    assert.ok(cachesCount >= 2);
  } finally {
    await context.close();
  }
});

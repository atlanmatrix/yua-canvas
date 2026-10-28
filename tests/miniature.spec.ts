import { test, expect, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { downloadSelectionMenu } from "./helpers";
import { mockMiniature } from "./miniature-fixture";

const src = "https://atlanmatrix.github.io/codex-playground/city/";
const title = "被自然收回的城市街角";
const embed = `<iframe src="${src}" title="${title}" width="100%" height="480" style="border:0" loading="lazy" allow="fullscreen" allowfullscreen></iframe>`;

test.beforeEach(async ({ page }) => {
  await mockMiniature(page);
});
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加 miniature", exact: true }),
  ).toBeEnabled();
}
async function create(page: Page) {
  await page
    .getByRole("button", { name: "添加 miniature", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "场景 URL 或 iframe 代码" })
    .fill(embed);
  await page.getByRole("button", { name: "保存场景" }).click();
  await expect(page.locator(".card-miniature")).toHaveCount(1);
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  if (name === "批量下载") await downloadSelectionMenu(page);
  else await page.getByRole("button", { name, exact: true }).click();
  const file = await pending;
  const chunks: Buffer[] = [];
  for await (const chunk of (await file.createReadStream())!)
    chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("double-click activates a full-size model, outside clicks deactivate and persist its view", async ({
  page,
}) => {
  await ready(page);
  await create(page);
  const card = page.locator(".card-miniature"),
    frame = card.locator("iframe");
  await expect(card.locator(".miniature-cover")).toBeVisible();
  await expect(frame).toHaveCount(0);
  const before = (await card.boundingBox())!;
  await page.mouse.move(before.x + 80, before.y + 100);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 125, { steps: 5 });
  await page.mouse.up();
  const moved = (await card.boundingBox())!;
  expect(moved.x).toBeCloseTo(before.x + 40, 0);
  expect(moved.y).toBeCloseTo(before.y + 25, 0);
  await mockMiniature(page, { delay: 300 });
  await card
    .locator(".miniature-model")
    .dblclick({ position: { x: 100, y: 100 } });
  await expect(frame).toHaveAttribute("src", /city\/\?.*parentOrigin=/);
  await expect(frame).toHaveAttribute("allow", "fullscreen");
  await expect(frame).toHaveAttribute("title", title);
  expect(
    await frame.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeCloseTo(moved.height - 2, 0);
  await page
    .frameLocator(".miniature-frame")
    .getByRole("button", { name: "旋转场景" })
    .click();
  await expect(
    page.frameLocator(".miniature-frame").getByRole("button"),
  ).toHaveText("场景已旋转");
  await expect(page.locator("[data-minimap-card] image")).toHaveCount(0);
  await page.locator(".canvas").click({ position: { x: 10, y: 100 } });
  await expect(frame).toHaveCount(0);
  await expect(card.locator(".miniature-cover")).toBeVisible();
  await expect(page.locator("[data-minimap-card] image")).toHaveCount(1);
  await card.click({ position: { x: 100, y: 100 } });
  const handle = card.getByTestId("card-resize-se"),
    box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 45,
    box.y + box.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  expect((await card.boundingBox())!.width).toBeCloseTo(moved.width + 45, 0);
  const exported = JSON.parse((await download(page, "导出画布")).toString());
  expect(exported.cards[0]).toMatchObject({
    kind: "miniature",
    title,
    text: src,
    width: 640,
    height: 520,
    displayMode: "medium",
    previewWidth: 365,
    previewHeight: 260,
  });
  expect(
    new URL(exported.cards[0].miniatureView).searchParams.get("view"),
  ).toBe("rotated");
  expect(exported.cards[0].blob).toMatch(/^data:image\/webp;base64,/);
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
  await page.reload();
  await expect(page.locator(".miniature-cover")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("editing validates URLs, ignores executable iframe attributes, supports example and cancel/undo", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "添加 miniature", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "场景 URL 或 iframe 代码" });
  for (const invalid of [
    "javascript:alert(1)",
    '<iframe src="data:text/html,unsafe"></iframe>',
    "/relative-scene",
  ]) {
    await input.fill(invalid);
    await page.getByRole("button", { name: "保存场景" }).click();
    await expect(page.getByRole("alert")).toContainText("有效的 HTTP / HTTPS");
  }
  await input.fill(
    `<iframe src="${src}" title="${title}" onload="window.__unsafe=true" srcdoc="unsafe"></iframe><script>window.__unsafe=true</script>`,
  );
  await page.getByRole("button", { name: "保存场景" }).click();
  await expect(page.locator(".miniature-cover")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator("iframe[onload],iframe[srcdoc]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__unsafe)).toBeUndefined();
  await page.locator(".miniature-name").dblclick();
  await page.getByRole("textbox", { name: "场景名称" }).fill("更名");
  await page.keyboard.press("Escape");
  await expect(page.locator(".miniature-cover")).toHaveAttribute("alt", title);
  await page.locator(".miniature-name").dblclick();
  await page.getByRole("textbox", { name: "场景名称" }).fill("更名");
  await page.getByRole("textbox", { name: "场景名称" }).press("Enter");
  await expect(page.locator(".miniature-cover")).toHaveAttribute("alt", "更名");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".miniature-cover")).toHaveAttribute("alt", title);
});

test("copy, JSON and ZIP retain miniature type, source, title and dimensions; invalid imports are atomic", async ({
  page,
  context,
}) => {
  let sceneLoads = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(src)) sceneLoads++;
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await ready(page);
  await create(page);
  await expect(page.locator(".miniature-cover")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator(".card-miniature")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+a");
  const zip = await download(page, "批量下载"),
    entries = unzipSync(zip);
  const metadata = JSON.parse(strFromU8(entries["yua-canvas.metadata.json"]));
  for (const card of metadata.cards) {
    expect(card.kind).toBe("miniature");
    expect(strFromU8(entries[card.file])).toBe(src);
    expect(entries[card.coverFile]).toBeDefined();
    expect(new URL(card.miniatureView).searchParams.get("view")).toBe(
      "initial",
    );
  }
  await page.getByTestId("files").setInputFiles({
    name: "scenes.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(page.locator(".card-miniature")).toHaveCount(4);
  const json = await download(page, "导出画布");
  await page.getByTestId("import").setInputFiles({
    name: "scenes.json",
    mimeType: "application/json",
    buffer: json,
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".card-miniature")).toHaveCount(4);
  const restored = JSON.parse((await download(page, "导出画布")).toString());
  expect(restored.cards).toEqual(JSON.parse(json.toString()).cards);
  for (const card of restored.cards)
    expect(card).toMatchObject({
      kind: "miniature",
      title,
      text: src,
      width: 640,
      height: 520,
      blob: restored.cards[0].blob,
      miniatureView: restored.cards[0].miniatureView,
    });
  expect(restored.cards[0].blob).toMatch(/^data:image\/webp;base64,/);
  expect(sceneLoads).toBe(1);
  const invalid = {
    ...restored,
    cards: [{ ...restored.cards[0], text: "javascript:alert(1)" }],
  };
  await page.getByTestId("import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.getByRole("status")).toContainText("3D 场景地址无效");
  await expect(page.locator(".card-miniature")).toHaveCount(4);
});

test("background submenu and toolbar drag create miniature at chosen positions", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 100, y: 100 } });
  await page.getByRole("menuitem", { name: "新建", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Miniature", exact: true }).click();
  await page.getByRole("button", { name: "使用示例场景" }).click();
  await page.getByRole("button", { name: "保存场景" }).click();
  const box = (await page
    .getByRole("button", { name: "添加 miniature", exact: true })
    .boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(400, 250, { steps: 7 });
  await page.mouse.up();
  await expect(
    page.getByRole("dialog", { name: "添加 miniature" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "使用示例场景" }).click();
  await page.getByRole("button", { name: "保存场景" }).click();
  await expect(page.locator(".card-miniature")).toHaveCount(2);
  await page.keyboard.press("n");
  await page.getByRole("textbox", { name: "文本内容" }).fill("普通文本");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("card")).toHaveCount(3);
});

test("read-only shares embed miniature scenes without exposing editor controls", async ({
  page,
}) => {
  await page.route("**/api/shares/resolve", (r) =>
    r.fulfill({
      json: {
        snapshot: {
          version: 1,
          groups: [],
          cards: [
            {
              id: "scene",
              kind: "miniature",
              title,
              text: src,
              x: 0,
              y: 0,
              width: 640,
              height: 520,
              color: "#ffffff",
            },
          ],
        },
      },
    }),
  );
  await page.goto("/#/s/" + "a".repeat(64));
  await expect(page.locator(".share-miniature .miniature-cover")).toBeVisible();
  await expect(page.locator(".share-miniature iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "编辑 miniature" }),
  ).toHaveCount(0);
  await page
    .locator(".miniature-model")
    .dblclick({ position: { x: 100, y: 100 } });
  await page
    .frameLocator(".miniature-frame")
    .getByRole("button", { name: "旋转场景" })
    .click();
  await expect(
    page.frameLocator(".miniature-frame").getByRole("button"),
  ).toHaveText("场景已旋转");
});

test("cover generation is serial, persists and reopens without any scene iframes", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    (window as any).maxCaptureFrames = 0;
    const observer = new MutationObserver(() => {
      (window as any).maxCaptureFrames = Math.max(
        (window as any).maxCaptureFrames,
        document.querySelectorAll(".miniature-capture-frame").length,
      );
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  const data = {
    version: 1,
    groups: [],
    cards: [0, 1].map((i) => ({
      id: `scene-${i}`,
      kind: "miniature",
      title: `场景 ${i}`,
      text: src,
      x: 80 + i * 380,
      y: 100,
      width: 340,
      height: 300,
      color: "#ffffff",
    })),
  };
  await page.getByTestId("import").setInputFiles({
    name: "scenes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".miniature-cover")).toHaveCount(2);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).maxCaptureFrames)).toBe(1);
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
  let loads = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(src)) loads++;
  });
  await page.reload();
  await expect(page.locator(".miniature-cover")).toHaveCount(2);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(loads).toBe(0);
});

test("automatic screenshots do not add undo steps", async ({ page }) => {
  await ready(page);
  await create(page);
  await expect(page.locator(".miniature-cover")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".card-miniature")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator(".miniature-cover")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("messages from a different origin, window or request cannot alter the saved view or cover", async ({
  page,
}) => {
  await ready(page);
  await create(page);
  await expect(page.locator(".miniature-cover")).toBeVisible();
  const original = JSON.parse((await download(page, "导出画布")).toString())
    .cards[0];
  await mockMiniature(page, { delay: 1000 });
  await page
    .locator(".miniature-model")
    .dblclick({ position: { x: 100, y: 100 } });
  await expect(page.locator("iframe")).toBeVisible();
  await page.evaluate(
    ({ src, cover }) => {
      const child = document.querySelector("iframe")!.contentWindow!,
        origin = new URL(src).origin;
      const notification = {
        type: "little-worlds:statechange",
        url: src + "?view=forged",
      };
      window.dispatchEvent(
        new MessageEvent("message", {
          source: child,
          origin: "https://other.example",
          data: notification,
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin,
          data: notification,
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          source: child,
          origin,
          data: {
            type: "little-worlds:response",
            requestId: "wrong-request",
            ok: true,
            result: { url: src + "?view=forged", dataUrl: cover },
          },
        }),
      );
    },
    { src, cover: original.blob },
  );
  const result = JSON.parse((await download(page, "导出画布")).toString())
    .cards[0];
  expect(result.miniatureView).toBe(original.miniatureView);
  expect(result.blob).toBe(original.blob);
});

test("an unsupported capture protocol times out without leaving a background iframe running", async ({
  page,
}) => {
  await mockMiniature(page, { protocol: false });
  await ready(page);
  await page.clock.install();
  await create(page);
  await expect(page.locator(".miniature-capture-frame")).toHaveCount(1);
  // Start the timeout check after iframe load, which schedules the capture request.
  await expect
    .poll(() =>
      page
        .frameLocator(".miniature-capture-frame")
        .locator("body")
        .evaluate(() => document.readyState),
    )
    .toBe("complete");
  await page.clock.runFor(1);
  await page.clock.fastForward(13000);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator(".miniature-placeholder")).toHaveText(
    "暂无静态预览",
  );
  await page
    .locator(".miniature-model")
    .dblclick({ position: { x: 100, y: 100 } });
  await page.clock.fastForward(13000);
  await expect(page.locator("iframe")).toHaveCount(1);
  await page.locator(".canvas").click({ position: { x: 10, y: 100 } });
  await page.clock.fastForward(13000);
  await expect(page.locator("iframe")).toHaveCount(0);
});

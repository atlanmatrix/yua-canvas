import { test, expect, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { downloadSelectionMenu } from "./helpers";

const src = "https://atlanmatrix.github.io/codex-playground/city/";
const title = "被自然收回的城市街角";
const embed = `<iframe src="${src}" title="${title}" width="100%" height="480" style="border:0" loading="lazy" allow="fullscreen" allowfullscreen></iframe>`;

test.beforeEach(async ({ page }) => {
  // Keep scene interaction deterministic and independent of the remote host.
  await page.route(src, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<body style="background:#b8cbb3"><button onclick="this.textContent=\'场景已旋转\'">旋转场景</button></body>',
    }),
  );
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

test("iframe creates a draggable, resizable scene with opt-in interaction and reload persistence", async ({
  page,
}) => {
  await ready(page);
  await create(page);
  const card = page.locator(".card-miniature"),
    frame = card.locator("iframe");
  await expect(frame).toHaveAttribute("src", src);
  await expect(frame).toHaveAttribute("title", title);
  await expect(frame).toHaveAttribute("loading", "lazy");
  await expect(frame).toHaveAttribute("allow", "fullscreen");
  expect(await frame.evaluate((el) => el.getBoundingClientRect().height)).toBe(
    480,
  );
  await expect(frame).toHaveCSS("pointer-events", "none");
  const before = (await card.boundingBox())!;
  await page.mouse.move(before.x + 80, before.y + 100);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 125, { steps: 5 });
  await page.mouse.up();
  const moved = (await card.boundingBox())!;
  expect(moved.x).toBeCloseTo(before.x + 40, 0);
  expect(moved.y).toBeCloseTo(before.y + 25, 0);
  await card.getByRole("button", { name: "交互 3D 场景" }).click();
  await expect(frame).toHaveCSS("pointer-events", "auto");
  await page
    .frameLocator(".miniature-frame")
    .getByRole("button", { name: "旋转场景" })
    .click();
  await expect(
    page.frameLocator(".miniature-frame").getByRole("button"),
  ).toHaveText("场景已旋转");
  await card.getByRole("button", { name: "结束场景交互" }).click();
  await expect(frame).toHaveCSS("pointer-events", "none");
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
    width: 685,
    height: 540,
  });
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
  await page.reload();
  await expect(page.locator(".miniature-frame")).toHaveAttribute("src", src);
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
  await expect(page.locator("iframe")).not.toHaveAttribute("onload");
  await expect(page.locator("iframe")).not.toHaveAttribute("srcdoc");
  expect(await page.evaluate(() => (window as any).__unsafe)).toBeUndefined();
  await page
    .getByRole("button", { name: "编辑 miniature", exact: true })
    .click();
  await page.getByRole("textbox", { name: "场景名称" }).fill("更名");
  await page.keyboard.press("Escape");
  await expect(page.locator("iframe")).toHaveAttribute("title", title);
  await page
    .getByRole("button", { name: "编辑 miniature", exact: true })
    .click();
  await page.getByRole("button", { name: "使用示例场景" }).click();
  await page.getByRole("textbox", { name: "场景名称" }).fill("更名");
  await page.getByRole("button", { name: "保存场景" }).click();
  await expect(page.locator("iframe")).toHaveAttribute("title", "更名");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("iframe")).toHaveAttribute("title", title);
});

test("copy, JSON and ZIP retain miniature type, source, title and dimensions; invalid imports are atomic", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await ready(page);
  await create(page);
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
  for (const card of restored.cards)
    expect(card).toMatchObject({
      kind: "miniature",
      title,
      text: src,
      width: 640,
      height: 520,
    });
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
  await expect(page.locator(".share-miniature iframe")).toHaveAttribute(
    "src",
    src,
  );
  await expect(
    page.getByRole("button", { name: "编辑 miniature" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "交互 3D 场景" }).click();
  await page
    .frameLocator(".miniature-frame")
    .getByRole("button", { name: "旋转场景" })
    .click();
  await expect(
    page.frameLocator(".miniature-frame").getByRole("button"),
  ).toHaveText("场景已旋转");
});

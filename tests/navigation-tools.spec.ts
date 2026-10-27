import { test, expect, type Page } from "@playwright/test";
const note = (id: string, x = 80, y = 120) => ({
  id,
  kind: "text",
  title: "",
  text: id,
  x,
  y,
  width: 180,
  height: 80,
  color: "#ffffff",
});
const child = {
  id: "child",
  kind: "canvas",
  title: "项目",
  text: "",
  x: 500,
  y: 120,
  color: "#ffffff",
  canvas: {
    version: 1,
    id: "child-board",
    cards: [note("子级内容", 1600, 1200)],
    groups: [],
  },
};
async function setup(page: Page) {
  await page.goto("/");
  await page
    .getByTestId("import")
    .setInputFiles({
      name: "nav.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          cards: [note("根级内容"), child],
          groups: [
            {
              id: "g",
              name: "空分组",
              bounds: { x: 80, y: 350, width: 240, height: 160 },
            },
          ],
        }),
      ),
    });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
}
async function pin(page: Page, id: string) {
  await page
    .locator(`[data-card-id="${id}"]`)
    .click({ button: "right", position: { x: 30, y: 30 } });
  await page.getByRole("menuitem", { name: "Pin", exact: true }).click();
}
async function saved(page: Page) {
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
}
test("idle overview fades, hover and zoom restore opacity, hierarchy previews without navigation", async ({
  page,
}) => {
  await setup(page);
  await page.mouse.move(1200, 400);
  const overview = page.locator(".canvas-overview");
  await expect(overview).toHaveClass(/idle/);
  await expect(overview).toHaveCSS("opacity", "0.28");
  await page.getByTestId("minimap").hover();
  await expect(overview).toHaveCSS("opacity", "1");
  await page.mouse.move(1200, 400);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(overview).toHaveClass(/active/);
  const levels = page.getByRole("navigation", { name: "画布层级" });
  const root = levels.getByRole("button", {
      name: "第 1 层：根画布",
      exact: true,
    }),
    project = levels.getByRole("button", {
      name: "第 2 层：项目",
      exact: true,
    });
  await expect(root).toHaveAttribute("aria-current", "page");
  await project.hover();
  await expect(page.locator('[data-minimap-card="子级内容"]')).toHaveCount(1);
  await expect(page.locator('[data-card-id="根级内容"]')).toBeVisible();
  await project.click();
  await expect(project).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-card-id="子级内容"]')).toHaveCount(1);
  await root.hover();
  await expect(page.locator('[data-minimap-card="根级内容"]')).toHaveCount(1);
  await expect(page.locator('[data-card-id="子级内容"]')).toHaveCount(1);
  await root.click();
  await expect(page.locator('[data-card-id="根级内容"]')).toHaveCount(1);
});
test("pins persist, rename directly, navigate across levels and locate groups", async ({
  page,
}) => {
  await setup(page);
  await pin(page, "根级内容");
  const rail = page.getByRole("navigation", { name: "Pin 定位" });
  await rail.getByRole("button", { name: "根级内容", exact: true }).dblclick();
  const input = page.getByRole("textbox", { name: "Pin 名称" });
  await input.fill("重点");
  await input.press("Enter");
  await expect(
    rail.getByRole("button", { name: "重点", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "进入子画布 项目", exact: true })
    .click();
  await page.getByRole("button", { name: "适应所有内容", exact: true }).click();
  await pin(page, "子级内容");
  await rail.getByRole("button", { name: "重点", exact: true }).click();
  await expect(page.locator('[data-card-id="根级内容"]')).toHaveClass(
    /selected/,
  );
  await page
    .getByRole("button", { name: "拖动分组 空分组", exact: true })
    .click({ button: "right", position: { x: 30, y: 10 } });
  await page.getByRole("menuitem", { name: "Pin", exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(rail.getByRole("button")).toHaveCount(3);
  await rail.getByRole("button", { name: "子级内容", exact: true }).click();
  const target = page.locator('[data-card-id="子级内容"]');
  await expect(target).toHaveClass(/selected/);
  const rect = await target.boundingBox();
  expect(rect!.x).toBeGreaterThan(0);
  expect(rect!.y).toBeGreaterThan(70);
  expect(rect!.x + rect!.width).toBeLessThan(1280);
  await rail.getByRole("button", { name: "空分组", exact: true }).click();
  await expect(page.locator(".group-selected")).toHaveCount(1);
  await page
    .locator('[data-card-id="根级内容"]')
    .click({ button: "right", position: { x: 30, y: 30 } });
  await page.getByRole("menuitem", { name: "取消 Pin", exact: true }).click();
  await expect(
    rail.getByRole("button", { name: "重点", exact: true }),
  ).toHaveCount(0);
});
test("root can create one parent and persists the restriction; undo restores availability", async ({
  page,
}) => {
  await setup(page);
  const menu = async () => {
    await page
      .locator(".canvas")
      .click({ button: "right", position: { x: 1100, y: 500 } });
    return page.getByRole("menuitem", { name: "创建父画布", exact: true });
  };
  await (await menu()).click();
  await expect(await menu()).toBeDisabled();
  await page.keyboard.press("Escape");
  await saved(page);
  await page.reload();
  await expect(await menu()).toBeDisabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "进入子画布 画布", exact: true })
    .click();
  await expect(await menu()).toBeDisabled();
});
test("help opens with question mark icon, lists shortcuts and closes with Escape", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "使用说明", exact: true }).click();
  const help = page.getByRole("dialog", { name: "使用说明" });
  await expect(
    help.getByRole("heading", { name: "快捷键", exact: true }),
  ).toBeVisible();
  await expect(help).toContainText("⌘/Ctrl + C / X / V");
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await page.keyboard.press("?");
  await expect(help).toBeVisible();
  await page.getByRole("button", { name: "关闭使用说明" }).click();
  await expect(help).toHaveCount(0);
});
test("JSON and ZIP preserve pin labels, duplicate pins locate independent copies", async ({
  page,
}) => {
  await setup(page);
  await pin(page, "根级内容");
  await page.keyboard.press("ControlOrMeta+d");
  const rail = page.getByRole("navigation", { name: "Pin 定位" });
  await expect(
    rail.getByRole("button", { name: "根级内容", exact: true }),
  ).toHaveCount(2);
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  const stream = await (await promise).createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  const raw = Buffer.concat(chunks),
    data = JSON.parse(raw.toString());
  expect(data.cards.filter((c: any) => c.pin === "根级内容")).toHaveLength(2);
  await page
    .getByTestId("import")
    .setInputFiles({
      name: "pins.json",
      mimeType: "application/json",
      buffer: raw,
    });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(
    rail.getByRole("button", { name: "根级内容", exact: true }),
  ).toHaveCount(2);
  await page.locator(".card-text").first().click({position:{x:5,y:5}});
  await page
    .locator(".card-text")
    .last()
    .click({ modifiers: ["ControlOrMeta"] });
  const zipPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "批量下载", exact: true }).click();
  const zip = await (await zipPromise).createReadStream(),
    parts: Buffer[] = [];
  for await (const c of zip!) parts.push(c);
  await page
    .getByTestId("import")
    .setInputFiles({
      name: "pins.zip",
      mimeType: "application/zip",
      buffer: Buffer.concat(parts),
    });
  await expect(
    rail.getByRole("button", { name: "根级内容", exact: true }),
  ).toHaveCount(4);
});

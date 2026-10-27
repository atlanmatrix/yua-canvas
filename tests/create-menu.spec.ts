import { test, expect, type Page } from "@playwright/test";
async function menu(page: Page, x = 720, y = 360) {
  await page.locator(".canvas").click({ button: "right", position: { x, y } });
  return page.getByRole("menuitem", { name: "新建", exact: true });
}
async function position(page: Page, x = 720, y = 360) {
  return page.locator(".world").evaluate(
    (el, p) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { x: (p.x - m.e) / m.a, y: (p.y - m.f) / m.d };
    },
    { x, y },
  );
}
async function checkPosition(
  page: Page,
  kind: string,
  point: { x: number; y: number },
) {
  const item = page.locator(".card-" + kind).last();
  await expect(item).toBeVisible();
  const coords = await item.evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    y: parseFloat((el as HTMLElement).style.top),
  }));
  expect(coords.x).toBeCloseTo(point.x);
  expect(coords.y).toBeCloseTo(point.y);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
});
test("hover and click open all component types; text is created at zoomed right-click point", async ({
  page,
}) => {
  await page.getByRole("button", { name: "放大", exact: true }).click();
  const point = await position(page);
  const trigger = await menu(page);
  const popup = page.getByRole("menu");
  for (const label of ["新建内容", "内容操作", "画布层级"])
    await expect(
      popup.getByRole("group", { name: label, exact: true }),
    ).toBeVisible();
  await trigger.hover();
  const submenu = page.getByRole("menu", { name: "新建组件", exact: true });
  await expect(submenu.getByRole("menuitem")).toHaveText([
    "文本",
    "任务",
    "图片",
    "文件",
    "子画布",
    "Miniature",
    "分组",
  ]);
  await trigger.click();
  await expect(submenu).toBeVisible();
  await submenu.getByRole("menuitem", { name: "文本", exact: true }).click();
  await page.getByRole("textbox", { name: "文本内容" }).fill("右键创建的文本");
  await page.keyboard.press("ControlOrMeta+Enter");
  await checkPosition(page, "text", point);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(0);
});
test("task, child canvas and group creation share the original anchor", async ({
  page,
}) => {
  for (const [label, kind] of [
    ["任务", "todo"],
    ["子画布", "canvas"],
    ["分组", "group"],
  ]) {
    const point = await position(page);
    await (await menu(page)).hover();
    await page
      .getByRole("menu", { name: "新建组件" })
      .getByRole("menuitem", { name: label, exact: true })
      .click();
    if (kind === "todo") {
      await page.getByRole("textbox", { name: "任务内容 1" }).fill("任务");
      await page.keyboard.press("ControlOrMeta+Enter");
    }
    if (kind === "group") {
      await page.getByRole("textbox", { name: "分组名称" }).fill("新分组");
      await page.getByRole("textbox", { name: "分组名称" }).press("Enter");
      const group = page.locator(".group-boundary").last();
      const coords = await group.evaluate((el) => ({
        x: parseFloat((el as HTMLElement).style.left),
        y: parseFloat((el as HTMLElement).style.top),
      }));
      expect(coords.x).toBeCloseTo(point.x);
      expect(coords.y).toBeCloseTo(point.y);
    } else await checkPosition(page, kind, point);
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
  }
});
test("image and file picker preserve clicked position and original content", async ({
  page,
}) => {
  const image =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  for (const [label, kind, file] of [
    [
      "图片",
      "image",
      {
        name: "pixel.png",
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      },
    ],
    [
      "文件",
      "file",
      {
        name: "original.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.from([0, 1, 2, 255]),
      },
    ],
  ] as const) {
    const x = kind === "image" ? 600 : 900,
      y = 360;
    const point = await position(page, x, y);
    await (await menu(page, x, y)).hover();
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("menu", { name: "新建组件" })
      .getByRole("menuitem", { name: label, exact: true })
      .click();
    await (await chooser).setFiles(file);
    await checkPosition(page, kind, point);
    await expect(page.locator(".card-" + kind)).toHaveAttribute(
      "aria-label",
      file.name,
    );
  }
});
test("submenu stays in viewport near edges and supports keyboard navigation and dismissal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = await menu(page, 375, 600);
  await trigger.focus();
  await trigger.press("ArrowRight");
  const submenu = page.getByRole("menu", { name: "新建组件" });
  await expect(
    submenu.getByRole("menuitem", { name: "文本", exact: true }),
  ).toBeFocused();
  const bounds = await submenu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(8);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(382);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(836);
  await page.keyboard.press("ArrowDown");
  await expect(
    submenu.getByRole("menuitem", { name: "任务", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(submenu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByTestId("card")).toHaveCount(0);
});

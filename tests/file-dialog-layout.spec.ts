import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`file dialog keeps its frame and chrome fixed while only content scrolls at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.locator('.save-indicator[data-state="已保存至本地"]'),
    ).toBeVisible();
    await page.getByTestId("files").setInputFiles({
      name: "长文档.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# 文档\n\n" + "正文内容\n\n".repeat(200)),
    });
    await page.getByTestId("card").dblclick();
    const dialog = page.getByRole("dialog");
    const header = dialog.locator(".modal-heading");
    const footer = dialog.locator(".modal-bottom");
    const content = dialog.locator(".detail-content");
    await expect(
      dialog.getByRole("heading", { name: "文档", exact: true }),
    ).toBeVisible();
    const frame = await dialog.boundingBox();
    const headerFrame = await header.boundingBox();
    const footerFrame = await footer.boundingBox();
    await content.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(
      await dialog.evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(1);
    expect(await header.boundingBox()).toEqual(headerFrame);
    expect(await footer.boundingBox()).toEqual(footerFrame);
    expect(headerFrame!.y).toBeGreaterThan(frame!.y + 10);
    expect(footerFrame!.y + footerFrame!.height).toBeLessThan(
      frame!.y + frame!.height - 10,
    );
    await page.getByRole("button", { name: "编辑文件", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "文件内容", exact: true });
    await expect(editor).toBeFocused();
    expect(await dialog.boundingBox()).toEqual(frame);
    await editor.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await editor.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(
      await content.evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(1);
    await expect(editor).toHaveCSS("outline-style", "none");
    await expect(editor).toHaveCSS("border-top-color", "rgb(37, 99, 235)");
    await expect(
      page.getByRole("button", { name: "编辑文件", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(37, 99, 235)");
    await editor.fill("短文档");
    await page.getByRole("button", { name: "预览文件", exact: true }).click();
    expect(await dialog.boundingBox()).toEqual(frame);
    expect(await header.boundingBox()).toEqual(headerFrame);
    expect(await footer.boundingBox()).toEqual(footerFrame);
  });
}

test("filename edits on click and file types jump to typed names or extensions and save together", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.getByTestId("files").setInputFiles({
    name: "原名.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("# 标题"),
  });
  await page.getByTestId("card").dblclick();
  await expect(
    page.getByRole("textbox", { name: "文件名", exact: true }),
  ).toHaveCount(0);
  const filename = page.getByRole("button", { name: "文件名", exact: true });
  await filename.click();
  await page
    .getByRole("textbox", { name: "文件名", exact: true })
    .fill("新名.txt");
  await page.keyboard.press("Enter");
  await expect(filename).toHaveText("新名.txt");
  const type = page.getByRole("combobox", { name: "文件类型" });
  await type.click();
  await page.keyboard.type("yaml");
  const active = page.getByRole("listbox").locator('[data-active="true"]');
  await expect(active).toContainText("yaml (.yaml)");
  const menu = await page.getByRole("listbox").boundingBox();
  const option = await active.boundingBox();
  expect(option!.y).toBeGreaterThanOrEqual(menu!.y);
  expect(option!.y + option!.height).toBeLessThanOrEqual(
    menu!.y + menu!.height + 1,
  );
  await page.keyboard.press("Enter");
  await expect(filename).toHaveText("新名.yaml");
  await type.click();
  await page.keyboard.type("md");
  await page.keyboard.press("Enter");
  await expect(filename).toHaveText("新名.md");
  await page.getByRole("button", { name: "保存文件", exact: true }).click();
  await page.getByRole("button", { name: "关闭详情" }).click();
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await page.getByTestId("card").dblclick();
  await expect(filename).toHaveText("新名.md");
  await expect(type).toContainText("markdown (.md)");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "标题", exact: true }),
  ).toBeVisible();
});

test("vertical resizing a masked wide component preserves its width and position", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.getByTestId("import").setInputFiles({
    name: "masked.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          {
            id: "masked",
            kind: "text",
            title: "",
            text: "隐藏内容",
            masked: true,
            x: 100,
            y: 150,
            width: 1000,
            height: 180,
            color: "#ffffff",
            textAutoHeight: false,
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
  const card = page.getByTestId("card");
  await card.click();
  const original = await card.boundingBox();
  const handle = await card.getByTestId("card-resize-s").boundingBox();
  await page.mouse.move(handle!.x + 20, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 20, handle!.y + handle!.height / 2 + 70, {
    steps: 8,
  });
  await page.mouse.up();
  const resized = await card.boundingBox();
  expect(resized!.width).toBeCloseTo(original!.width);
  expect(resized!.x).toBeCloseTo(original!.x);
  expect(resized!.height).toBeGreaterThan(original!.height + 60);
  await expect(card).toHaveCSS("border-top-color", "rgb(37, 99, 235)");
  await expect(card).toHaveCSS("outline-style", "none");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(card).toHaveCSS("width", "1000px");
});

test("locked components resize freely without inheriting the text width limit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.getByTestId("import").setInputFiles({
    name: "wide.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          {
            id: "wide",
            kind: "text",
            title: "",
            text: "需要上锁的内容",
            x: 100,
            y: 150,
            width: 850,
            height: 180,
            color: "#ffffff",
            textAutoHeight: false,
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
  const card = page.getByTestId("card");
  await card.dispatchEvent("contextmenu", { clientX: 400, clientY: 200 });
  await page.getByRole("menuitem", { name: "密码锁定", exact: true }).click();
  await page
    .getByRole("textbox", { name: "主密码", exact: true })
    .fill("test-password-2026");
  await page
    .getByRole("textbox", { name: "确认主密码", exact: true })
    .fill("test-password-2026");
  await page.getByRole("dialog").locator("button.primary").click();
  await expect(page.locator(".component-locked")).toBeVisible();
  await card.click({ position: { x: 20, y: 20 } });
  const original = await card.boundingBox();
  const east = await card.getByTestId("card-resize-e").boundingBox();
  await page.mouse.move(east!.x + east!.width / 2, east!.y + 20);
  await page.mouse.down();
  await page.mouse.move(east!.x + east!.width / 2 + 30, east!.y + 20, {
    steps: 8,
  });
  await page.mouse.up();
  const wider = await card.boundingBox();
  expect(wider!.width).toBeCloseTo(original!.width + 30, 0);
  expect(wider!.height).toBeCloseTo(original!.height, 0);
  const south = await card.getByTestId("card-resize-s").boundingBox();
  await page.mouse.move(south!.x + 20, south!.y + south!.height / 2);
  await page.mouse.down();
  await page.mouse.move(south!.x + 20, south!.y + south!.height / 2 + 40, {
    steps: 8,
  });
  await page.mouse.up();
  const taller = await card.boundingBox();
  expect(taller!.width).toBeCloseTo(wider!.width, 0);
  expect(taller!.height).toBeCloseTo(wider!.height + 40, 0);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  const width = await card.evaluate((el) => el.style.width);
  await page.reload();
  await expect(page.locator(".component-locked")).toBeVisible();
  await expect(card).toHaveCSS("width", width);
});

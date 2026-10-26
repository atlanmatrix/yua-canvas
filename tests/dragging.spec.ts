import { test, expect, type Page, type Locator } from "@playwright/test";
async function setup(page: Page) {
  await page.goto("/");
  const board = {
    version: 1,
    groups: [
      {
        id: "outer",
        name: "外组",
        bounds: { x: 0, y: 0, width: 650, height: 500 },
      },
      {
        id: "inner",
        name: "内组",
        bounds: { x: 20, y: 60, width: 320, height: 330 },
      },
    ],
    cards: [
      {
        id: "a",
        kind: "text",
        text: "起点",
        title: "",
        x: 0,
        y: 0,
        color: "#fffdf5",
      },
      {
        id: "b",
        kind: "text",
        text: "移动卡片",
        title: "",
        x: 700,
        y: 400,
        color: "#fffdf5",
      },
    ],
  };
  await page.getByTestId("import").setInputFiles({
    name: "groups.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(board)),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
}
async function point(page: Page, x: number, y: number) {
  return page.locator(".world").evaluate(
    (el, p) => {
      const m = new DOMMatrix(getComputedStyle(el).transform),
        r = el.parentElement!.getBoundingClientRect();
      return { x: r.left + m.e + p.x * m.a, y: r.top + m.f + p.y * m.d };
    },
    { x, y },
  );
}
async function drag(page: Page, source: Locator, to: { x: number; y: number }) {
  const b = await source.boundingBox();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
const membership = (card: Locator) => card.locator("footer>span").first();
test("dragging into, between and out of groups uses full containment at zoom", async ({
  page,
}) => {
  await setup(page);
  const card = page.getByTestId("card").filter({ hasText: "移动卡片" });
  // Grab the card center, so drop coordinates are its center as well.
  await drag(page, card, await point(page, 170, 225));
  await expect(membership(card)).toHaveText("内组");
  await expect(page.getByText("已选 1 项")).toBeVisible();
  // Overlaps inner frame, but is not fully inside: falls back to outer frame.
  await drag(page, card, await point(page, 340, 225));
  await expect(membership(card)).toHaveText("外组");
  // The right edge exceeds both frames.
  await drag(page, card, await point(page, 700, 225));
  await expect(membership(card)).toHaveText("");
  await expect(page.locator(".group-boundary")).toHaveCount(2);
  await drag(page, card, await point(page, 170, 225));
  await expect(membership(card)).toHaveText("内组");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(membership(card)).toHaveText("内组");
  await page.getByRole("button", { name: "适应所有内容" }).click();
  const title = page.getByRole("button", { name: "拖动分组 内组" });
  await page.keyboard.press("Escape");
  const titleBox = await title.boundingBox();
  await title.click({
    position: { x: titleBox!.width - 20, y: titleBox!.height / 2 },
  });
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await expect(page.locator(".selection-bar")).toHaveCount(0);
  const before = await card.boundingBox();
  const groupBefore = await title.boundingBox();
  await page.mouse.move(
    groupBefore!.x + groupBefore!.width - 20,
    groupBefore!.y + groupBefore!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    groupBefore!.x + groupBefore!.width - 20 + 35,
    groupBefore!.y + groupBefore!.height / 2 + 20,
    { steps: 8 },
  );
  await page.mouse.up();
  const after = await card.boundingBox();
  expect(after!.x - before!.x).toBeCloseTo(35, 0);
  expect(after!.y - before!.y).toBeCloseTo(20, 0);
  await expect(page.locator(".card.selected")).toHaveCount(0);
});
test("toolbar note and Todo drag to exact positions, join groups and cancel outside canvas", async ({
  page,
}) => {
  await setup(page);
  await drag(
    page,
    page.getByRole("button", { name: "添加笔记", exact: true }),
    await point(page, 170, 225),
  );
  await expect(page.getByRole("dialog", { name: "新建笔记" })).toBeVisible();
  await page.getByRole("textbox", { name: "笔记内容" }).fill("拖入笔记");
  await page.getByRole("button", { name: "保存笔记" }).click();
  const note = page.getByTestId("card").filter({ hasText: "拖入笔记" });
  await expect(membership(note)).toHaveText("内组");
  const position = await note.evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    y: parseFloat((el as HTMLElement).style.top),
  }));
  expect(position.x).toBeCloseTo(50, 0);
  expect(position.y).toBeCloseTo(100, 0);
  await drag(
    page,
    page.getByRole("button", { name: "添加任务", exact: true }),
    await point(page, 470, 225),
  );
  await page.getByRole("textbox", { name: "任务内容 1" }).fill("拖入任务");
  await page.getByRole("button", { name: "保存任务" }).click();
  await expect(
    membership(page.getByTestId("card").filter({ hasText: "拖入任务" })),
  ).toHaveText("外组");
  await drag(
    page,
    page.getByRole("button", { name: "添加笔记", exact: true }),
    { x: 70, y: 450 },
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("card")).toHaveCount(4);
  await expect(page.locator(".creation-preview")).toHaveCount(0);
  // A normal click still works after a canceled drag.
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "新建笔记" })).toBeVisible();
});
test("toolbar attachment drops keep the drop position through file selection", async ({
  page,
}) => {
  await setup(page);
  for (const [button, name, mime, content] of [
    [
      "上传图片",
      "pasted.svg",
      "image/svg+xml",
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    ],
    ["上传文件", "file.txt", "text/plain", "内容"],
  ]) {
    const chooserEvent = page.waitForEvent("filechooser");
    await drag(
      page,
      page.getByRole("button", { name: button, exact: true }),
      await point(page, 170, 225),
    );
    const chooser = await chooserEvent;
    await chooser.setFiles({
      name,
      mimeType: mime,
      buffer: Buffer.from(content),
    });
    const card = page.getByTestId("card").filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(membership(card)).toHaveText("内组");
    const p = await card.evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      y: parseFloat((el as HTMLElement).style.top),
    }));
    expect(p.x).toBeCloseTo(50, 0);
    expect(p.y).toBeCloseTo(100, 0);
  }
});

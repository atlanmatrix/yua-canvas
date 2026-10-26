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
        y: 600,
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
const membership = (card: Locator) => card;
test("dragging into, between and out of groups uses full containment at zoom", async ({
  page,
}) => {
  await setup(page);
  const card = page.getByTestId("card").filter({ hasText: "移动卡片" });
  // Grab the card center, so drop coordinates are its center as well.
  await drag(page, card, await point(page, 170, 225));
  await expect(membership(card)).toHaveAttribute("data-group-name", "内组");
  await expect(page.getByText("已选 1 项")).toBeVisible();
  // Partial overlap retains the original group and expands its frame.
  await drag(page, card, await point(page, 340, 225));
  await expect(membership(card)).toHaveAttribute("data-group-name", "内组");
  // Fully outside inner, but overlapping outer: transfer and expand outer.
  await drag(page, card, await point(page, 700, 225));
  await expect(membership(card)).toHaveAttribute("data-group-name", "外组");
  await page.keyboard.press("-");
  await page.keyboard.press("-");
  await drag(page, card, await point(page, 1200, 225));
  await expect(membership(card)).toHaveAttribute("data-group-name", "");
  await expect(page.locator(".group-boundary")).toHaveCount(2);
  await drag(page, card, await point(page, 170, 225));
  await expect(membership(card)).toHaveAttribute("data-group-name", "内组");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(membership(card)).toHaveAttribute("data-group-name", "内组");
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
  await expect(membership(note)).toHaveAttribute("data-group-name", "内组");
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
  ).toHaveAttribute("data-group-name", "外组");
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
    const card = page.locator(`.card[aria-label="${name}"]`);
    await expect(card).toHaveCount(1);
    await expect(membership(card)).toHaveAttribute("data-group-name", "内组");
    const p = await card.evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      y: parseFloat((el as HTMLElement).style.top),
    }));
    expect(p.x).toBeGreaterThanOrEqual(50);
    expect(p.y).toBeCloseTo(100, 0);
  }
});

for (const modifier of ["Control", "Meta"]) {
  test(`${modifier} + left drag pans from canvas, cards and group controls without edits`, async ({
    page,
  }) => {
    await setup(page);
    const card = page.getByTestId("card").filter({ hasText: "移动卡片" });
    await card.click();
    await expect(page.locator(".card.selected")).toHaveCount(1);
    const geometry = () =>
      page
        .locator(".card,.group-boundary")
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).style.cssText),
        );
    const original = await geometry();
    const transform = () =>
      page.locator(".world").evaluate((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return { x: m.e, y: m.f, z: m.a };
      });
    const sources = [
      () => point(page, 600, 550),
      async () => {
        const b = await card.boundingBox();
        return { x: b!.x + 80, y: b!.y + 70 };
      },
      async () => {
        const b = await page
          .getByRole("button", { name: "拖动分组 内组" })
          .boundingBox();
        return { x: b!.x + b!.width - 20, y: b!.y + b!.height / 2 };
      },
      async () => {
        const b = await page
          .locator(".group-boundary")
          .first()
          .getByTestId("resize-se")
          .boundingBox();
        return { x: b!.x + 6, y: b!.y + 6 };
      },
    ];
    for (const [index, source] of sources.entries()) {
      const start = await source(),
        before = await transform();
      await page.keyboard.down(modifier);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down({ button: "left" });
      await page.mouse.move(start.x + 12, start.y + 9, { steps: 5 });
      await page.mouse.up();
      await page.keyboard.up(modifier);
      const after = await transform();
      expect(after.x - before.x, `pan source ${index}`).toBeCloseTo(12, 0);
      expect(after.y - before.y).toBeCloseTo(9, 0);
      expect(after.z).toBe(before.z);
      expect(await geometry()).toEqual(original);
      await expect(page.locator(".card.selected")).toHaveCount(1);
      await expect(page.locator(".marquee")).toHaveCount(0);
    }
    // Release the modifier: the next drag must move the card normally again.
    const before = await card.evaluate((el) =>
      parseFloat((el as HTMLElement).style.left),
    );
    const b = await card.boundingBox();
    await page.mouse.move(b!.x + 80, b!.y + 70);
    await page.mouse.down();
    await page.mouse.move(b!.x + 110, b!.y + 70, { steps: 5 });
    await page.mouse.up();
    expect(
      await card.evaluate((el) => parseFloat((el as HTMLElement).style.left)),
    ).toBeGreaterThan(before);
  });
}

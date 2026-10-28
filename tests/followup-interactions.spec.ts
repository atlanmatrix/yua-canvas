import { test, expect, type Page } from "@playwright/test";
const saved = (p: Page) =>
  expect(p.locator('.save-indicator[data-state="已保存至本地"]')).toBeVisible();
async function data(p: Page) {
  await saved(p);
  return p.evaluate(async () => {
    const mod = await import("/src/storage.ts" as string);
    return mod.readBoard();
  });
}
async function seed(p: Page, extra: any = {}) {
  await p.goto("/");
  await saved(p);
  await p.getByTestId("import").setInputFiles({
    name: "todo.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards: [
          {
            id: "todo",
            kind: "todo",
            title: "事项",
            text: "",
            x: 90,
            y: 140,
            width: 440,
            height: 320,
            color: "#ffffff",
            displayMode: "large",
            tasks: [
              { id: "one", text: "ABCDEFGHIJKLMN 中文事项", done: false },
              { id: "two", text: "Second task", done: true },
            ],
          },
        ],
        groups: [],
        ...extra,
      }),
    ),
  });
  await p.getByRole("button", { name: "确认替换" }).click();
  await saved(p);
}
async function draw(p: Page, x = 230, y = 240) {
  const box = await p.locator(".canvas").boundingBox();
  await p.mouse.move(box!.x + x, box!.y + y);
  await p.mouse.down();
  await p.mouse.move(box!.x + x + 70, box!.y + y + 30, { steps: 8 });
  await p.mouse.up();
}
test("drawing has a detached 12px entrance, a centered toolbar, scoped undo, clear, hide, exit and persistence", async ({
  page,
}) => {
  await seed(page);
  const before = await data(page);
  const brush = page.getByRole("button", { name: "画笔", exact: true });
  const entrance = await brush.boundingBox(),
    tools = await page.locator(".toolbar").boundingBox();
  expect(tools!.x - entrance!.x - entrance!.width).toBeCloseTo(12, 1);
  await expect(
    page.locator(".toolbar").getByRole("button", { name: "画笔", exact: true }),
  ).toHaveCount(0);
  await brush.click();
  const top = page.getByRole("toolbar", { name: "绘画工具栏" });
  await expect(top).toBeVisible();
  const bounds = await top.boundingBox();
  expect(bounds!.x + bounds!.width / 2).toBeCloseTo(640, 0);
  expect(bounds!.y).toBeLessThan(50);
  await expect(top.getByRole("button", { name: "撤销绘画" })).toBeDisabled();
  await top.getByLabel("画笔颜色").fill("#2563eb");
  await top.getByLabel("画笔粗细").fill("8");
  await draw(page);
  await draw(page, 330, 280);
  const paths = page.locator(".paint-layer [data-stroke-id]");
  await expect(paths).toHaveCount(2);
  await top.getByRole("button", { name: "撤销绘画" }).click();
  await expect(paths).toHaveCount(1);
  expect((await data(page)).cards).toEqual(before.cards);
  await top.getByRole("button", { name: "清空绘画" }).click();
  await expect(paths).toHaveCount(0);
  await top.getByRole("button", { name: "撤销绘画" }).click();
  await expect(paths).toHaveCount(1);
  await top.getByRole("button", { name: "隐藏绘画" }).click();
  await expect(paths).toHaveCount(0);
  expect((await data(page)).strokes).toHaveLength(1);
  await top.getByRole("button", { name: "退出绘画" }).click();
  await expect(top).toHaveCount(0);
  await expect(brush).toHaveAttribute("aria-pressed", "false");
  await saved(page);
  await page.reload();
  await expect(paths).toHaveCount(0);
  expect((await data(page)).strokesHidden).toBe(true);
  await brush.click();
  await top.getByRole("button", { name: "显示绘画" }).click();
  await expect(paths).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(top).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await brush.click();
  const mobile = await top.boundingBox();
  expect(mobile!.x).toBeGreaterThanOrEqual(0);
  expect(mobile!.x + mobile!.width).toBeLessThanOrEqual(390);
  await expect(top.getByRole("button", { name: "退出绘画" })).toBeVisible();
});
for (const zoom of [1, 0.6])
  test(`TODO double-click places caret at the clicked character at zoom ${zoom}`, async ({
    page,
  }) => {
    await seed(page);
    if (zoom !== 1) {
      await page.keyboard.press("-");
      await page.keyboard.press("-");
    }
    const text = page.locator(
      '.card-todo [data-task-id="one"] [data-task-text]',
    );
    const point = await text.evaluate((el) => {
      const range = document.createRange();
      range.setStart(el.firstChild!, 4);
      range.setEnd(el.firstChild!, 5);
      const r = range.getBoundingClientRect();
      return { x: r.left + 1, y: r.top + r.height / 2 };
    });
    await page.mouse.dblclick(point.x, point.y);
    const input = page.getByRole("textbox", { name: "任务内容 1" });
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((el: HTMLInputElement) => el.selectionStart),
    ).toBe(4);
    await page.keyboard.type("!");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(
      page.locator('.card-todo [data-task-id="one"] [data-task-text]'),
    ).toHaveText("ABCD!EFGHIJKLMN 中文事项");
    expect((await data(page)).cards[0].tasks).toHaveLength(2);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(
      page.locator('.card-todo [data-task-id="one"] [data-task-text]'),
    ).toHaveText("ABCDEFGHIJKLMN 中文事项");
  });
test("TODO double-click on header or blank space adds and focuses a new item, and Escape discards it", async ({
  page,
}) => {
  await seed(page);
  const todo = page.locator(".card-todo");
  await todo.locator(".card-top").dblclick();
  const third = page.getByRole("textbox", { name: "任务内容 3" });
  await expect(third).toBeFocused();
  await third.fill("New item");
  await page.keyboard.press("ControlOrMeta+Enter");
  expect((await data(page)).cards[0].tasks).toHaveLength(3);
  await todo.dblclick({ position: { x: 70, y: 250 } });
  await expect(page.getByRole("textbox", { name: "任务内容 4" })).toBeFocused();
  await page.keyboard.press("Escape");
  expect((await data(page)).cards[0].tasks).toHaveLength(3);
  await todo.locator(".card-top").dblclick();
  await page.keyboard.press("ControlOrMeta+Enter");
  expect((await data(page)).cards[0].tasks).toHaveLength(3);
});
for (const [width, height, scale] of [
  [800, 600, 1],
  [2560, 1440, 1],
  [2561, 1000, 0.5],
  [1200, 1441, 0.5],
  [3000, 1800, 0.5],
])
  test(`image paste displays ${width}x${height} at ${scale * 100}% and retains original pixels`, async ({
    page,
  }) => {
    await page.goto("/");
    await saved(page);
    await page.evaluate(
      ({ width, height }) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="red"/></svg>`;
        const data = new DataTransfer();
        data.items.add(
          new File([svg], "pasted.svg", { type: "image/svg+xml" }),
        );
        window.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: data }),
        );
      },
      { width, height },
    );
    const card = page.locator(".card-image");
    await expect(card).toHaveCSS("width", `${width * scale}px`);
    await expect(card).toHaveCSS("height", `${height * scale}px`);
    const image = card.locator("img");
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(width);
    const snapshot = await data(page);
    expect(snapshot.cards[0].displayMode).toBe("large");
    await page.reload();
    await expect(card).toHaveCSS("width", `${width * scale}px`);
    await expect(card).toHaveCSS("height", `${height * scale}px`);
  });
test("TODO list previews preserve the clicked task and caret when opening their editor", async ({
  page,
}) => {
  await seed(page, {
    cards: [
      {
        id: "todo",
        kind: "todo",
        title: "事项",
        text: "",
        x: 90,
        y: 140,
        width: 360,
        height: 240,
        color: "#ffffff",
        group: "g",
        tasks: [
          { id: "one", text: "ABCDEFGHIJKLMN", done: false },
          { id: "two", text: "Another item", done: true },
        ],
      },
    ],
    groups: [
      {
        id: "g",
        name: "分组",
        displayMode: "list",
        activeCard: "todo",
        bounds: { x: 40, y: 80, width: 780, height: 400 },
      },
    ],
  });
  const point = await page
    .locator('.group-list-detail [data-task-id="one"] [data-task-text]')
    .evaluate((el) => {
      const range = document.createRange();
      range.setStart(el.firstChild!, 3);
      range.setEnd(el.firstChild!, 4);
      const r = range.getBoundingClientRect();
      return { x: r.left + 1, y: r.top + r.height / 2 };
    });
  await page.mouse.dblclick(point.x, point.y);
  const input = page
    .getByRole("dialog")
    .getByRole("textbox", { name: "任务内容 1" });
  await expect(input).toBeFocused();
  expect(await input.evaluate((i: HTMLInputElement) => i.selectionStart)).toBe(
    3,
  );
  await page.keyboard.type("!");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await data(page)).cards[0].tasks[0].text).toBe("ABC!DEFGHIJKLMN");
});

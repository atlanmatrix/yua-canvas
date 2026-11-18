import { test, expect, type Page, type Locator } from "@playwright/test";
const card = (page: Page, id: string) =>
  page.locator(`.card[data-card-id="${id}"]`);
async function setup(page: Page, legacy = false) {
  await page.goto("/");
  const base = {
    title: "",
    text: "",
    color: "#ffffff",
    width: 240,
    height: 180,
  };
  await page.getByTestId("import").setInputFiles({
    name: "menu.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: legacy
          ? [
              {
                id: "g",
                name: "项目",
                color: "#dbeafe",
                bounds: { x: 40, y: 60, width: 700, height: 560 },
              },
              {
                id: "child",
                parent: "g",
                name: "子组",
                color: "#ede9fe",
                bounds: { x: 380, y: 330, width: 300, height: 250 },
              },
            ]
          : [],
        cards: [
          {
            ...base,
            id: "a",
            kind: "text",
            text: "选中的文本",
            x: 80,
            y: 130,
            height: 100,
            group: "g",
          },
          {
            ...base,
            id: "b",
            kind: "file",
            title: "file.txt",
            blob: "data:text/plain;base64,SGVsbG8=",
            x: 400,
            y: 130,
            group: "g",
          },
          {
            ...base,
            id: "c",
            kind: "todo",
            tasks: [{ id: "task", text: "待办", done: true }],
            x: 80,
            y: 330,
            group: "g",
          },
          {
            ...base,
            id: "d",
            kind: "image",
            title: "pixel.png",
            blob: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
            x: 420,
            y: 390,
            width: 220,
            height: 150,
            group: "child",
          },
          {
            ...base,
            id: "e",
            kind: "text",
            text: "未选择的元素",
            x: 850,
            y: 130,
            height: 100,
          },
        ],
        connections: [
          {
            id: "ab",
            from: { card: "a", side: "e" },
            to: { card: "b", side: "w" },
          },
          {
            id: "cd",
            from: { card: "c", task: "task", side: "e" },
            to: { card: "d", side: "w" },
          },
          {
            id: "bd",
            from: { card: "b", side: "s" },
            to: { card: "d", side: "n" },
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
}
async function menu(
  page: Page,
  target: Locator,
  position?: { x: number; y: number },
) {
  await target.click({ button: "right", position });
  await expect(page.getByRole("menu")).toBeVisible();
}
async function snapshot(page: Page) {
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  return page.evaluate(async () => {
    const { readBoard, exportBoard } = await import("/src/storage.ts");
    return JSON.parse(await exportBoard((await readBoard())!));
  });
}
async function selectEdge(page: Page) {
  const p = await page
    .locator('[data-connection-id="ab"] .connection-hit')
    .evaluate((el) => {
      const path = el as SVGPathElement;
      const point = path
        .getPointAtLength(path.getTotalLength() / 2)
        .matrixTransform(path.getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
  await page.mouse.click(p.x, p.y);
  await expect(
    page.locator('[data-connection-id="ab"] .connection-path'),
  ).toHaveClass(/selected/);
}

test("selection has no toolbar; context menus group capabilities for multiple selected cards and all seven colors", async ({
  page,
}) => {
  await setup(page);
  const original = await snapshot(page);
  for (const id of ["a", "b", "c", "d"]) {
    await card(page, id).click({ position: { x: 50, y: 50 } });
    await expect(card(page, id)).toHaveClass(/selected/);
    await expect(page.locator(".selection-bar")).toHaveCount(0);
    await expect(page.locator(".toolbar > button")).toHaveCount(6);
  }
  await card(page, "a").click({ position: { x: 50, y: 50 } });
  await card(page, "d").click({
    modifiers: ["Meta"],
    position: { x: 50, y: 50 },
  });
  await expect(page.locator(".card.selected")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "批量下载" })).toHaveCount(0);
  await menu(page, card(page, "a"), { x: 50, y: 50 });
  const popup = page.getByRole("menu");
  for (const label of ["内容操作", "外观", "删除操作"])
    await expect(
      popup.getByRole("group", { name: label, exact: true }),
    ).toBeVisible();
  await expect(
    popup.getByRole("group", { name: "内容操作" }).getByRole("menuitem"),
  ).toHaveText(["打开", /^复制/, /^剪切/, "Pin", /^导出/]);
  await expect(popup.getByRole("group", { name: "分组操作" })).toHaveCount(0);
  await expect(
    popup
      .getByRole("group", { name: "背景颜色", exact: true })
      .getByRole("menuitemradio"),
  ).toHaveCount(7);
  await expect(
    popup.getByRole("group", { name: "删除操作" }).getByRole("menuitem"),
  ).toHaveText(/^删除/);
  await expect(popup.locator(".context-menu-section").nth(1)).toHaveCSS(
    "border-top-style",
    "none",
  );
  await page.screenshot({ path: "/tmp/yua-menu-sections-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const b = (await popup.boundingBox())!;
      return (
        b.x >= 8 && b.x + b.width <= 382 && b.y >= 8 && b.y + b.height <= 836
      );
    })
    .toBe(true);
  await page.screenshot({ path: "/tmp/yua-menu-sections-mobile.png" });
  await page.keyboard.press("Escape");
  expect(await snapshot(page)).toEqual(original);
});

test("context deletion targets every card type, clears stale edge selection, prunes only related links and undoes once", async ({
  page,
}) => {
  await setup(page);
  const original = await snapshot(page);
  for (const id of ["a", "b", "c", "d"]) {
    await selectEdge(page);
    await menu(page, card(page, id), { x: 50, y: 50 });
    await expect(page.locator(".connection-path.selected")).toHaveCount(0);
    await page.getByRole("menuitem", { name: "删除", exact: true }).click();
    await expect(card(page, id)).toHaveCount(0);
    await expect(page.getByRole("menu")).toHaveCount(0);
    const deleted = await snapshot(page);
    expect(deleted.cards.map((c: any) => c.id)).toEqual(
      original.cards.filter((c: any) => c.id !== id).map((c: any) => c.id),
    );
    expect(deleted.connections).toEqual(
      original.connections.filter(
        (c: any) => c.from.card !== id && c.to.card !== id,
      ),
    );
    expect(deleted.groups).toEqual(original.groups);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await snapshot(page)).toEqual(original);
  }
  await card(page, "a").click({ position: { x: 50, y: 50 } });
  await card(page, "d").click({
    modifiers: ["Meta"],
    position: { x: 50, y: 50 },
  });
  await menu(page, card(page, "a"), { x: 50, y: 50 });
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  const deleted = await snapshot(page);
  expect(deleted.cards.map((c: any) => c.id)).toEqual(["b", "c", "e"]);
  expect(deleted.connections).toEqual([]);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await snapshot(page)).toEqual(original);
  await card(page, "a").click({ position: { x: 50, y: 50 } });
  await card(page, "d").click({
    modifiers: ["Meta"],
    position: { x: 50, y: 50 },
  });
  await menu(page, card(page, "e"), { x: 50, y: 50 });
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  expect((await snapshot(page)).cards.map((c: any) => c.id)).toEqual([
    "a",
    "b",
    "c",
    "d",
  ]);
});

test("deleting a migrated canvas removes descendants and undo restores their links", async ({
  page,
}) => {
  await setup(page, true);
  const original = await snapshot(page);
  await menu(page, card(page, "g"), { x: 20, y: 20 });
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  expect((await snapshot(page)).cards.map((c: any) => c.id)).toEqual(["e"]);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await snapshot(page)).toEqual(original);
});
test("every component menu copies content that can be pasted independently", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  const original = await snapshot(page);
  for (const id of ["a", "b", "c", "d"]) {
    await menu(page, card(page, id), { x: 50, y: 50 });
    await page.getByRole("menuitem", { name: "复制", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已复制");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(page.getByTestId("card")).toHaveCount(6);
    const pasted = (await snapshot(page)).cards.find(
      (item: any) =>
        !original.cards.some((source: any) => source.id === item.id),
    );
    const source = original.cards.find((item: any) => item.id === id);
    expect(pasted.kind).toBe(source.kind);
    expect(pasted.text).toBe(source.text);
    expect(pasted.blob).toBe(source.blob);
    expect(pasted.tasks?.map((task: any) => [task.text, task.done])).toEqual(
      source.tasks?.map((task: any) => [task.text, task.done]),
    );
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("card")).toHaveCount(5);
  }
});

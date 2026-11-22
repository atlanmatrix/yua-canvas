import { expect, test, type Page } from "@playwright/test";
import { openTextEditor } from "./helpers";
const note = (id: string, x: number, y: number) => ({
  id,
  x,
  y,
  kind: "text",
  title: "",
  text: id,
  width: 160,
  height: 90,
  color: "#ffffff",
});
const canvas = (id: string, x: number, cards: unknown[] = []) => ({
  ...note(id, x, 120),
  kind: "canvas",
  title: id,
  height: 160,
  canvas: { version: 1, groups: [], cards },
});
const item = (page: Page, id: string) => page.locator(`[data-card-id="${id}"]`);
async function load(
  page: Page,
  cards: unknown[],
  groups: unknown[] = [],
  connections: unknown[] = [],
) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "sample.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 1, cards, groups, connections }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
}
test("text preserves preview width and formats only selected characters across reload", async ({
  page,
}) => {
  await page.goto("/");
  await openTextEditor(page);
  const editor = page.getByRole("textbox", { name: "文本内容" });
  const card = page.locator(".card-text");
  const width = (await card.boundingBox())!.width;
  await editor.pressSequentially("abcdef");
  await editor.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
  for (let i = 0; i < 3; i++) await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "加粗", exact: true }).click();
  await page.getByRole("button", { name: "倾斜", exact: true }).click();
  await page.getByLabel("文本背景色").fill("#fef9c3");
  await expect(editor.locator("span").first()).toHaveText("abc");
  await expect(editor.locator("span").first()).toHaveCSS("font-weight", "700");
  await editor.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
  for (let i = 0; i < 18; i++) await editor.press("Enter");
  expect((await card.boundingBox())!.width).toBeCloseTo(width);
  await card.hover();
  await expect(card.locator(".card-toolbar")).toBeHidden();
  await editor.press("Control+Enter");
  const spans = card.locator(".note-body span");
  await expect(spans.first()).toHaveCSS("font-style", "italic");
  await expect(spans.nth(1)).toHaveCSS("font-weight", "400");
  await expect(spans.first()).toHaveCSS(
    "background-color",
    "rgb(254, 249, 195)",
  );
  await expect(spans.nth(1)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(spans.first()).toHaveText("abc");
  await expect(spans.nth(1)).toContainText("def");
});
test("todo input accommodates its line and hides hover controls until editing finishes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  const input = page.getByRole("textbox", { name: "任务内容 1" });
  await input.fill("新的待办项目");
  const metrics = await input.evaluate((el) => ({
    height: el.clientHeight,
    line: parseFloat(getComputedStyle(el).lineHeight),
    left: parseFloat(getComputedStyle(el).paddingLeft),
  }));
  expect(metrics.height).toBeGreaterThan(metrics.line);
  expect(metrics.left).toBeGreaterThan(2);
  await input.hover();
  await expect(page.locator(".card-toolbar")).toBeHidden();
  await input.press("Control+Enter");
  await expect(page.getByText("新的待办项目", { exact: true })).toBeVisible();
});
test("moving a nested canvas into another preserves its subtree and is undoable", async ({
  page,
}) => {
  await load(page, [
    canvas("source", 80, [note("inside", 32, 32)]),
    canvas("destination", 520),
  ]);
  const a = (await page
      .getByRole("button", { name: "进入子画布 source" })
      .boundingBox())!,
    b = (await item(page, "destination").boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await expect(item(page, "destination")).toHaveAttribute(
    "data-drop-target",
    "true",
  );
  await page.mouse.up();
  await expect(page.locator(".card-canvas")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".card-canvas")).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z");
  await page.getByRole("button", { name: "进入子画布 destination" }).click();
  await page.getByRole("button", { name: "进入子画布 source" }).click();
  await expect(item(page, "inside")).toBeVisible();
});
test("legacy groups become nested canvases and preserve local and crossing connections", async ({
  page,
}) => {
  await load(
    page,
    [
      { ...note("a", 110, 120), group: "inner" },
      { ...note("b", 240, 120), group: "inner" },
      note("outside", 700, 120),
    ],
    [
      {
        id: "outer",
        name: "父组",
        bounds: { x: 20, y: 20, width: 600, height: 480 },
      },
      {
        id: "inner",
        name: "子组",
        parent: "outer",
        bounds: { x: 60, y: 90, width: 490, height: 260 },
      },
    ],
    [
      {
        id: "local",
        from: { card: "a", side: "e" },
        to: { card: "b", side: "w" },
      },
      {
        id: "crossing",
        from: { card: "a", side: "n" },
        to: { card: "outside", side: "w" },
      },
    ],
  );
  await expect(page.locator(".group-boundary")).toHaveCount(0);
  await expect(page.locator(".connection-path")).toHaveCount(1);
  await page.getByRole("button", { name: "进入子画布 父组" }).click();
  await page.getByRole("button", { name: "进入子画布 子组" }).click();
  await expect(item(page, "a")).toBeVisible();
  await expect(page.locator(".connection-path")).toHaveCount(1);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(item(page, "b")).toBeVisible();
});
test("keyboard paste anchors to pointer, then centers the copied bounds outside canvas", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await load(page, [note("sample", 50, 50)]);
  await item(page, "sample").click();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制");
  await page.mouse.move(640, 280);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator(".card")).toHaveCount(2);
  let rect = (await page.locator(".card.selected").boundingBox())!;
  expect(rect.x).toBeCloseTo(640, 0);
  expect(rect.y).toBeCloseTo(280, 0);
  await page.getByRole("button", { name: "放大", exact: true }).hover();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator(".card")).toHaveCount(3);
  rect = (await page.locator(".card.selected").boundingBox())!;
  const area = (await page.locator(".canvas").boundingBox())!;
  expect(rect.x + rect.width / 2).toBeCloseTo(area.x + area.width / 2, 0);
  expect(rect.y + rect.height / 2).toBeCloseTo(area.y + area.height / 2, 0);
});

test("opening legacy IndexedDB data atomically migrates saved navigation and keeps IDs stable on the next load", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加任务", exact: true }).waitFor();
  await page.evaluate(
    async (data) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("yua-canvas", 1);
        r.onsuccess = () => resolve(r.result);
      });
      const tx = db.transaction("boards", "readwrite");
      tx.objectStore("boards").put(data, "main");
      tx.objectStore("boards").put(
        { path: ["old-child"], views: { existing: { x: 45, y: 32, z: 1.2 } } },
        "navigation",
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    {
      version: 1,
      groups: [{ id: "folder", name: "历史资料" }],
      cards: [
        {
          ...canvas("old-child", 25, [note("original", 32, 32)]),
          group: "folder",
          canvas: {
            version: 1,
            id: "existing",
            groups: [],
            cards: [note("original", 32, 32)],
          },
        },
      ],
    },
  );
  await page.goto("/?canvas=old-child");
  await expect(item(page, "original")).toBeVisible();
  await expect(page).toHaveURL(/canvas=folder(?:%2F|\/)old-child/);
  await page.reload();
  await expect(item(page, "original")).toBeVisible();
  await page.getByRole("button", { name: "返回父画布" }).click();
  await expect(item(page, "old-child")).toBeVisible();
});

test("moving a selection together preserves spacing, remaps conflicting IDs and reconnects external links", async ({
  page,
}) => {
  const edge = (id: string, a: string, b: string) => ({
    id,
    from: { card: a, side: "e" },
    to: { card: b, side: "w" },
  });
  await load(
    page,
    [
      note("a", 40, 100),
      note("b", 250, 120),
      canvas("target", 520, [{ ...note("a", 20, 20), text: "existing" }]),
      note("outside", 820, 100),
    ],
    [],
    [edge("local", "a", "b"), edge("external", "b", "outside")],
  );
  await item(page, "a").click({ position: { x: 24, y: 24 } });
  await item(page, "b").click({
    modifiers: ["Shift"],
    position: { x: 24, y: 24 },
  });
  const source = (await item(page, "a").boundingBox())!;
  const target = (await item(page, "target").boundingBox())!;
  await page.mouse.move(source.x + 24, source.y + 24);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(page.locator(".card")).toHaveCount(2);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  const board = await page.evaluate(async () =>
    (await import("/src/storage.ts")).readBoard(),
  );
  expect(board!.connections).toMatchObject([
    { id: "external", from: { card: "target" }, to: { card: "outside" } },
  ]);
  const child = board!.cards.find((c) => c.id === "target")!.canvas!;
  const a = child.cards.find((c) => c.text === "a")!,
    b = child.cards.find((c) => c.text === "b")!;
  expect(a.id).not.toBe("a");
  expect(child.cards.find((c) => c.id === "a")?.text).toBe("existing");
  expect(b.x - a.x).toBeCloseTo(210);
  expect(b.y - a.y).toBeCloseTo(20);
  expect(child.connections).toMatchObject([
    { id: "local", from: { card: a.id }, to: { card: b.id } },
  ]);
});

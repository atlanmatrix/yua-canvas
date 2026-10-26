import { test, expect, type Page } from "@playwright/test";
const saved = (page: Page) =>
  expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
async function load(page: Page, board: unknown) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "inline.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(board)),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
}
async function snapshot(page: Page) {
  await saved(page);
  return page.evaluate(async () => {
    const { readBoard, exportBoard } = await import("/src/storage.ts");
    return JSON.parse(await exportBoard((await readBoard())!));
  });
}
const card = (id: string, x: number, y: number, width = 100, height = 80) => ({
  id,
  kind: "text",
  title: "",
  text: id,
  color: "#ffffff",
  x,
  y,
  width,
  height,
});
test("saved connection labels stay above later crossing curves through selection, zoom, pan and reload", async ({
  page,
}) => {
  await load(page, {
    version: 1,
    groups: [],
    cards: [
      card("a", 20, 140),
      card("b", 680, 140),
      card("c", 360, -80, 80),
      card("d", 360, 360, 80),
    ],
    connections: [
      {
        id: "horizontal",
        from: { card: "a", side: "e" },
        to: { card: "b", side: "w" },
        label: "交叉连线上的文字",
      },
      {
        id: "vertical",
        from: { card: "c", side: "s" },
        to: { card: "d", side: "n" },
      },
    ],
  });
  const label = page.locator(".connection-label");
  const labelOnTop = async () =>
    expect(
      await label.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return (
          document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          ) === el
        );
      }),
    ).toBe(true);
  await expect(label).toBeVisible();
  await labelOnTop();
  await label.click();
  await expect(
    page.locator('[data-connection-id="horizontal"] .connection-path'),
  ).toHaveClass(/selected/);
  await label.dblclick();
  const input = page.getByRole("textbox", { name: "连线文字" });
  await expect(input).toBeFocused();
  await input.fill("更新后的文字");
  await page.keyboard.press("Enter");
  for (const action of ["缩小", "放大"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    await labelOnTop();
  }
  await page.mouse.move(1100, 500);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(1125, 520, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await labelOnTop();
  await saved(page);
  await page.reload();
  await expect(label).toHaveText("更新后的文字");
  await labelOnTop();
  await page.screenshot({ path: "/tmp/yua-connection-label-top.png" });
});

test("Todo edits inline, preserves task IDs and links, autosaves and restores the entire edit with undo or Escape", async ({
  page,
}) => {
  await load(page, {
    version: 1,
    groups: [
      {
        id: "g",
        name: "项目",
        color: "#dbeafe",
        bounds: { x: 50, y: 50, width: 400, height: 350 },
      },
    ],
    cards: [
      {
        ...card("todo", 100, 120, 300, 240),
        kind: "todo",
        text: "",
        color: "#fef9c3",
        group: "g",
        tasks: [
          { id: "one", text: "第一项", done: true },
          { id: "two", text: "第二项", done: false },
        ],
      },
      card("other", 650, 120),
    ],
    connections: [
      {
        id: "one-link",
        from: { card: "todo", task: "one", side: "e" },
        to: { card: "other", side: "w" },
      },
      {
        id: "two-link",
        from: { card: "todo", task: "two", side: "e" },
        to: { card: "other", side: "s" },
      },
    ],
  });
  const original = await snapshot(page),
    todo = page.locator(".card-todo"),
    editor = todo.locator(".todo-editor");
  await expect(todo.locator("footer")).toHaveCount(0);
  await todo.getByText("第二项", { exact: true }).dblclick();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    editor.getByRole("textbox", { name: "任务内容 2" }),
  ).toBeFocused();
  await expect(
    editor.getByRole("checkbox", { name: "完成任务 2" }),
  ).not.toBeChecked();
  await editor
    .getByRole("textbox", { name: "任务内容 2" })
    .fill("更新的第二项");
  await editor.getByRole("checkbox", { name: "完成任务 2" }).check();
  await editor.getByRole("textbox", { name: "任务内容 2" }).press("Enter");
  await expect(
    editor.getByRole("textbox", { name: "任务内容 3" }),
  ).toBeFocused();
  await editor.getByRole("textbox", { name: "任务内容 3" }).fill("新增第三项");
  await editor.getByRole("button", { name: "添加任务", exact: true }).click();
  await editor.getByRole("textbox", { name: "任务内容 4" }).fill("新增第四项");
  await editor.getByRole("button", { name: "删除任务 1" }).click();
  await expect(editor).toBeVisible();
  const draft = await snapshot(page);
  expect(draft.connections.map((c: any) => c.id)).toEqual(["two-link"]);
  expect(draft.cards[0].tasks[0]).toEqual({
    id: "two",
    text: "更新的第二项",
    done: true,
  });
  await page.locator(".canvas").click({ position: { x: 20, y: 110 } });
  await expect(editor).toHaveCount(0);
  const edited = await snapshot(page);
  await expect(
    todo.locator('[data-port-task="two"][data-port-side="e"]'),
  ).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await snapshot(page)).toEqual(original);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await snapshot(page)).toEqual(edited);
  await todo.getByText("更新的第二项", { exact: true }).dblclick();
  await editor.getByRole("button", { name: "删除任务 1" }).click();
  await expect(
    editor.getByRole("textbox", { name: "任务内容 1" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  expect(await snapshot(page)).toEqual(edited);
  await todo.locator(".card-top").dblclick();
  const count = edited.cards[0].tasks.length;
  for (let i = count; i > 0; i--)
    await editor
      .getByRole("button", { name: `删除任务 ${i}`, exact: true })
      .click();
  await expect(
    editor.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ControlOrMeta+Enter");
  expect((await snapshot(page)).cards[0].tasks).toEqual([]);
  await todo.locator(".card-top").dblclick();
  await editor.getByRole("button", { name: "添加任务", exact: true }).click();
  await editor.getByRole("textbox", { name: "任务内容 1" }).fill("重建的任务");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(
    todo.getByRole("checkbox", { name: "重建的任务" }),
  ).not.toBeChecked();
  await saved(page);
  await page.reload();
  await expect(
    todo.getByRole("checkbox", { name: "重建的任务" }),
  ).toBeVisible();
});

test("Todo creation is inline, cancels empty drafts, keeps focused rows visible at zoom and saves before switching to text editing", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await page.keyboard.press("t");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.locator(".selection-bar")).toHaveCount(0);
  await page.keyboard.press("t");
  await page.getByRole("textbox", { name: "任务内容 1" }).fill("草稿任务");
  await saved(page);
  await page.reload();
  const todo = page.locator(".card-todo");
  await expect(todo.getByRole("checkbox", { name: "草稿任务" })).toBeVisible();
  await page.keyboard.press("-");
  await page.keyboard.press("-");
  await todo.locator(".card-top").dblclick();
  const editor = todo.locator(".todo-editor");
  for (let i = 1; i <= 12; i++) {
    const input = editor.getByRole("textbox", {
      name: `任务内容 ${i}`,
      exact: true,
    });
    await input.fill(`第 ${i} 项`);
    if (i < 12) await input.press("Enter");
  }
  await expect(
    editor.getByRole("textbox", { name: "任务内容 12", exact: true }),
  ).toBeFocused();
  const list = (await editor.locator(".todo-list").boundingBox())!,
    last = (await editor
      .getByRole("textbox", { name: "任务内容 12", exact: true })
      .boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(list.y + list.height + 1);
  await page.screenshot({ path: "/tmp/yua-todo-inline.png" });
  await page.keyboard.press("ControlOrMeta+Enter");
  expect((await snapshot(page)).cards[0].tasks).toHaveLength(12);
  await page.keyboard.press("t");
  await page.locator(".canvas").click({ position: { x: 20, y: 110 } });
  await expect(page.getByTestId("card")).toHaveCount(1);
  await todo.locator(".card-top").dblclick();
  await editor
    .getByRole("textbox", { name: "任务内容 1", exact: true })
    .fill("切换前保存");
  await page.locator(".canvas").dblclick({ position: { x: 80, y: 500 } });
  await expect(page.getByRole("textbox", { name: "文本内容" })).toBeFocused();
  await page.getByRole("textbox", { name: "文本内容" }).fill("新的文本");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".card-text")).toHaveCount(0);
  await expect(todo.getByRole("checkbox", { name: "切换前保存" })).toHaveCount(
    1,
  );
});

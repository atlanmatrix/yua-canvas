import { test, expect, type Page } from "@playwright/test";
async function load(page: Page, groups: unknown[] = [], cards: unknown[] = []) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "board.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, groups, cards })),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
}
async function data(page: Page) {
  const e = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布" }).click();
  const d = await e,
    s = await d.createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of s!) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString());
}
const note = (id: string, x: number, y: number, group?: string) => ({
  id,
  kind: "text",
  text: id,
  title: "",
  x,
  y,
  group,
  color: "#fffdf5",
});
test("group copy/paste preserves nested IDs, files and tasks and is undoable", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await load(
    page,
    [
      {
        id: "p",
        name: "整组",
        bounds: { x: 0, y: 0, width: 750, height: 650 },
      },
      {
        id: "c",
        name: "子组",
        bounds: { x: 50, y: 80, width: 400, height: 500 },
      },
    ],
    [
      note("笔记", 100, 140, "c"),
      {
        id: "file",
        kind: "file",
        title: "sample.bin",
        text: "",
        x: 450,
        y: 140,
        color: "#fffdf5",
        group: "p",
        blob: "data:application/octet-stream;base64,AAEC/w==",
      },
      {
        id: "todo",
        kind: "todo",
        title: "",
        text: "",
        x: 100,
        y: 400,
        color: "#fffdf5",
        group: "c",
        tasks: [{ id: "t", text: "已完成任务", done: true }],
      },
    ],
  );
  await page.getByRole("button", { name: "拖动分组 整组" }).click();
  await expect(page.locator(".group-selected")).toHaveCount(1);
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制分组");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(6);
  await expect(page.locator(".group-boundary")).toHaveCount(4);
  const b = await data(page),
    clone = b.groups.find(
      (g: { id: string; name: string }) => g.name === "整组" && g.id !== "p",
    ),
    child = b.groups.find(
      (g: { id: string; name: string }) => g.name === "子组" && g.id !== "c",
    );
  expect(child.parent).toBe(clone.id);
  expect(b.groups.find((g: { id: string }) => g.id === "c").parent).toBe("p");
  expect(clone.bounds.x).toBeGreaterThan(0);
  const clonedTodo = b.cards.find(
    (c: { id: string; kind: string }) => c.kind === "todo" && c.id !== "todo",
  );
  expect(clonedTodo.group).toBe(child.id);
  expect(clonedTodo.tasks[0]).toEqual({
    id: expect.any(String),
    text: "已完成任务",
    done: true,
  });
  expect(clonedTodo.tasks[0].id).not.toBe("t");
  expect(
    b.cards.find(
      (c: { id: string; kind: string }) => c.kind === "file" && c.id !== "file",
    ).blob,
  ).toBe("data:application/octet-stream;base64,AAEC/w==");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(3);
  await expect(page.locator(".group-boundary")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByTestId("card")).toHaveCount(6);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(9);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(6);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-group-id="${child.id}"]`)).toHaveAttribute(
    "data-parent",
    clone.id,
  );
});
test("binary card duplicates internally; external clipboard changes do not reuse stale copies", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.getByTestId("files").setInputFiles({
    name: "file.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 1, 255]),
  });
  await expect(page.locator('.card[aria-label="file.bin"]')).toBeVisible();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(2);
  const b = await data(page);
  expect(b.cards[0].blob).toBe(b.cards[1].blob);
  expect(b.cards[0].id).not.toBe(b.cards[1].id);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+y");
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.evaluate(() => navigator.clipboard.writeText("外部复制"));
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(3);
  await expect(page.getByText("外部复制", { exact: true })).toBeVisible();
});
test("card context menu creates a group and title renames inline, dissolves and undoes", async ({
  page,
}) => {
  await load(page, [], [note("一", 100, 100), note("二", 400, 100)]);
  await page.getByTestId("card").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByTestId("card").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "创建分组" }).click();
  await page.getByRole("textbox", { name: "分组名称" }).fill("新组");
  await page.getByRole("button", { name: "保存分组" }).click();
  await expect(page.locator(".group-boundary")).toHaveCount(1);
  const title = page.getByRole("button", { name: "拖动分组 新组" });
  await title.dblclick();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const input = page.getByRole("textbox", { name: "分组名称" });
  await expect(input).toBeFocused();
  await input.fill("原地改名");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "拖动分组 原地改名" }),
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(title).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.getByRole("button", { name: "拖动分组 原地改名" }).dblclick();
  await page.getByRole("textbox", { name: "分组名称" }).fill("不保存");
  await page.getByRole("textbox", { name: "分组名称" }).press("Escape");
  await expect(
    page.getByRole("button", { name: "拖动分组 原地改名" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "拖动分组 原地改名" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "解散分组" }).click();
  await expect(page.locator(".group-boundary")).toHaveCount(0);
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".group-boundary")).toHaveCount(1);
  await expect(page.getByTestId("card").first()).toHaveAttribute(
    "data-group-name",
    "原地改名",
  );
});
test("a complete drag including automatic grouping is a single undo step", async ({
  page,
}) => {
  await load(
    page,
    [
      {
        id: "g",
        name: "目标",
        bounds: { x: 0, y: 0, width: 500, height: 500 },
      },
    ],
    [note("拖动", 600, 100)],
  );
  const card = page.getByTestId("card"),
    before = await card.evaluate((el) => (el as HTMLElement).style.cssText);
  const target = await page.locator(".world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform),
      r = el.parentElement!.getBoundingClientRect();
    return { x: r.left + m.e + 250 * m.a, y: r.top + m.f + 250 * m.d };
  });
  const box = await card.boundingBox();
  await page.mouse.move(box!.x + 120, box!.y + 125);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 20 });
  await page.mouse.up();
  await expect(card).toHaveAttribute("data-group-name", "目标");
  const after = await card.evaluate((el) => (el as HTMLElement).style.cssText);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await card.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
    before,
  );
  await expect(card).not.toHaveAttribute("data-group-name", "目标");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await card.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
    after,
  );
  await expect(card).toHaveAttribute("data-group-name", "目标");
});

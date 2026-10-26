import { test, expect, type Page } from "@playwright/test";
import { openTextEditor } from "./helpers";
const content = (page: Page) =>
  page.getByRole("textbox", { name: "文本内容", exact: true });
const saved = (page: Page) =>
  expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
async function setup(page: Page) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "text.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [
          {
            id: "g",
            name: "文本组",
            color: "#dbeafe",
            bounds: { x: 40, y: 60, width: 740, height: 340 },
          },
        ],
        cards: [
          {
            id: "t",
            kind: "text",
            title: "旧名称",
            text: "原来的内容",
            color: "#fef9c3",
            x: 80,
            y: 130,
            width: 300,
            height: 80,
            group: "g",
            textMode: "wrap",
            textAutoHeight: true,
          },
          {
            id: "other",
            kind: "text",
            title: "",
            text: "其他元素",
            color: "#ffffff",
            x: 880,
            y: 130,
            width: 200,
            height: 80,
          },
        ],
        connections: [
          {
            id: "c",
            from: { card: "t", side: "e" },
            to: { card: "other", side: "w" },
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
}
const card = (page: Page) => page.locator('[data-card-id="t"]');
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const { exportBoard, readBoard } = await import("/src/storage.ts");
    return JSON.parse(await exportBoard((await readBoard())!));
  });
}

test("double-click edits text in place, keeps native text interactions and saves without leaving the editor", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  await card(page).dblclick();
  const input = content(page);
  await expect(input).toBeFocused();
  await input.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(input).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card(page).locator("textarea")).toHaveCount(1);
  const before = await card(page).evaluate((el) => ({
    x: (el as HTMLElement).style.left,
    y: (el as HTMLElement).style.top,
  }));
  const a = (await card(page).boundingBox())!,
    b = (await input.boundingBox())!;
  expect(Math.abs(a.x - b.x)).toBeLessThan(3);
  expect(Math.abs(a.width - b.width)).toBeLessThan(3);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("n v h");
  await page.keyboard.press("Enter");
  await page.evaluate(() => navigator.clipboard.writeText("第二行内容"));
  await page.keyboard.press("ControlOrMeta+v");
  await expect(input).toHaveValue("n v h\n第二行内容");
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.keyboard.press("ArrowLeft");
  expect(
    await card(page).evaluate((el) => ({
      x: (el as HTMLElement).style.left,
      y: (el as HTMLElement).style.top,
    })),
  ).toEqual(before);
  // Selecting with the pointer must not drag the canvas or finish the edit.
  await input.selectText();
  await page.keyboard.insertText(
    Array.from({ length: 12 }, (_, i) => `第 ${i + 1} 行`).join("\n"),
  );
  await expect(input).toBeFocused();
  expect((await card(page).boundingBox())!.height).toBeGreaterThan(a.height);
  await saved(page);
  expect(
    (await snapshot(page)).cards.find((c: any) => c.id === "t").text,
  ).toContain("第 12 行");
  await expect(input).toBeVisible();
  await page.reload();
  await expect(card(page).locator(".note-body")).toContainText("第 12 行");
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await expect(page.getByRole("button", { name: /^文本 \d/ })).toBeVisible();
});

test("one edit is one undo step and Escape restores text, dimensions, colors, group frames and connections", async ({
  page,
}) => {
  await setup(page);
  await saved(page);
  const original = await snapshot(page);
  await card(page).dblclick();
  await content(page).fill("第一次修改");
  await content(page).fill(
    Array.from({ length: 18 }, () => "最终修改").join("\n"),
  );
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(content(page)).toHaveCount(0);
  await saved(page);
  const edited = await snapshot(page);
  expect(edited.groups[0].bounds.height).toBeGreaterThan(
    original.groups[0].bounds.height,
  );
  await page.keyboard.press("ControlOrMeta+z");
  await saved(page);
  expect(await snapshot(page)).toEqual(original);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await saved(page);
  expect(await snapshot(page)).toEqual(edited);
  await card(page).dblclick();
  await content(page).fill("取消修改");
  await page.keyboard.press("Escape");
  await saved(page);
  expect(await snapshot(page)).toEqual(edited);
  await page.keyboard.press("ControlOrMeta+z");
  await saved(page);
  expect(await snapshot(page)).toEqual(original);
});

test("new texts edit on the canvas, discard empty and cancelled drafts, and undo creation once", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await openTextEditor(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.locator(".selection-bar")).toHaveCount(0);
  await page.locator(".canvas").dblclick({ position: { x: 140, y: 160 } });
  const box = (await page.getByTestId("card").boundingBox())!;
  expect(box.x).toBeCloseTo(140, 0);
  expect(box.y).toBeCloseTo(160, 0);
  await content(page).fill("   ");
  await page.locator(".canvas").click({ position: { x: 20, y: 100 } });
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.locator(".selection-bar")).toHaveCount(0);
  await openTextEditor(page);
  await content(page).fill("取消新建");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.locator(".selection-bar")).toHaveCount(0);
  await openTextEditor(page);
  await content(page).fill("保留文本\n第二行");
  await page.locator(".canvas").click({ position: { x: 20, y: 100 } });
  await expect(content(page)).toHaveCount(0);
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.locator(".selection-bar")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByTestId("card")).toContainText("保留文本");
});

test("clicking another card ends editing before a new drag starts and search does not remove the active editor", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "展开搜索" }).click();
  await page.getByRole("textbox", { name: "搜索画布" }).fill("原来的内容");
  await card(page).dblclick();
  await content(page).fill("新的内容");
  await expect(content(page)).toBeFocused();
  await expect(card(page)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await page.getByRole("button", { name: "清除搜索" }).click();
  await card(page).dblclick();
  await content(page).fill("拖动之前的修改");
  const other = page.locator('[data-card-id="other"]'),
    before = (await other.boundingBox())!;
  await page.mouse.move(before.x + 60, before.y + 30);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 70, { steps: 5 });
  await page.mouse.up();
  await expect(content(page)).toHaveCount(0);
  expect((await other.boundingBox())!.x).toBeCloseTo(before.x + 60, 0);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await other.boundingBox())!.x).toBeCloseTo(before.x, 0);
  await expect(card(page)).toContainText("拖动之前的修改");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card(page)).toContainText("新的内容");
});

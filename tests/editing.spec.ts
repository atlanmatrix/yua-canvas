import { openSettings, exportCanvas } from "./settings-helper.mjs";
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
  await openSettings(page);
  await exportCanvas(page);
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
test("copying and pasting a migrated canvas remaps nested IDs, files and tasks and is undoable", async ({
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
  await page
    .locator('[data-card-id="p"]')
    .click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制");
  await page.keyboard.press("ControlOrMeta+v");
  const copied = await data(page);
  const [first, other] = copied.cards.map((c: any) => c.canvas);
  expect(other.id).not.toBe(first.id);
  const child = other.cards.find((c: any) => c.title === "子组").canvas;
  expect(
    child.cards.find((c: any) => c.kind === "todo").tasks[0],
  ).toMatchObject({ text: "已完成任务", done: true });
  expect(other.cards.find((c: any) => c.kind === "file").blob).toBe(
    "data:application/octet-stream;base64,AAEC/w==",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByTestId("card")).toHaveCount(2);
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
test("migrated group titles can be renamed as canvases and undone", async ({
  page,
}) => {
  await load(page, [{ id: "g", name: "旧组" }], [note("旧笔记", 80, 120, "g")]);
  await page.locator(".card-canvas .attachment-title span").dblclick();
  await page.getByRole("textbox", { name: "画布名称" }).fill("新名称");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "进入子画布 新名称" }),
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(
    page.getByRole("button", { name: "进入子画布 旧组" }),
  ).toBeVisible();
});
test("a complete drag into a child canvas is a single undo step", async ({
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
  const card = page.locator('[data-card-id="拖动"]');
  const before = (await card.boundingBox())!,
    dest = (await page.locator('[data-card-id="g"]').boundingBox())!;
  await page.mouse.move(before.x + 25, before.y + 25);
  await page.mouse.down();
  await page.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, {
    steps: 7,
  });
  await page.mouse.up();
  await expect(card).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await card.boundingBox())!.x).toBeCloseTo(before.x, 0);
});

import { test, expect, type Page, type Locator } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const note = (id: string, x = 100, y = 100) => ({
  id,
  kind: "text",
  title: "",
  text: id,
  x,
  y,
  color: "#ffffff",
  width: 230,
  height: 100,
});
const saved = (page: Page) =>
  expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
async function load(page: Page, data: any) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "nested.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
}
async function snapshot(page: Page) {
  await saved(page);
  return page.evaluate(async () => {
    const { readBoard, readNavigation, exportBoard } =
      await import("/src/storage.ts");
    return {
      board: JSON.parse(await exportBoard((await readBoard())!)),
      navigation: await readNavigation(),
    };
  });
}
async function current(page: Page) {
  const s = await snapshot(page);
  let board = s.board;
  for (const id of s.navigation?.path || [])
    board = board.cards.find((c: any) => c.id === id).canvas;
  return board;
}
const view = (page: Page) =>
  page.locator(".world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, z: m.a };
  });
async function background(page: Page, action: string) {
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 28, y: 130 } });
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}
async function text(page: Page, value: string) {
  await page.keyboard.press("n");
  await page.getByRole("textbox", { name: "文本内容" }).fill(value);
  await page.keyboard.press("ControlOrMeta+Enter");
}
async function rename(page: Page, card: Locator, name: string) {
  await card.click({ button: "right", position: { x: 45, y: 45 } });
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  const input = page.getByRole("textbox", { name: "画布名称" });
  await input.fill(name);
  await input.press("Enter");
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const file = await pending,
    stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return { name: file.suggestedFilename(), data: Buffer.concat(chunks) };
}
const seed = () => ({
  version: 1,
  groups: [
    {
      id: "g",
      name: "资料组",
      color: "#dbeafe",
      bounds: { x: 50, y: 50, width: 680, height: 300 },
    },
  ],
  cards: [
    { ...note("原来的文本"), group: "g" },
    {
      ...note("文件", 420),
      kind: "file",
      title: "original.env",
      text: "",
      blob: "data:text/plain;base64,SEVMTE8NCg==",
      group: "g",
    },
  ],
  connections: [
    {
      id: "link",
      from: { card: "原来的文本", side: "e" },
      to: { card: "文件", side: "w" },
      label: "原来的连线",
    },
  ],
});

test("toolbar and background create nested canvases with separate views, content, navigation and reload restoration", async ({
  page,
}) => {
  await load(page, seed());
  const original = (await snapshot(page)).board,
    rootView = await view(page);
  await page.getByRole("button", { name: "创建子画布", exact: true }).click();
  await rename(page, page.locator(".card-canvas"), "项目子画布");
  await page
    .getByRole("button", { name: "进入子画布 项目子画布", exact: true })
    .click();
  await expect(page.getByTestId("card")).toHaveCount(0);
  await text(page, "子画布里的文本");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await page.mouse.move(950, 500);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(985, 525, { steps: 5 });
  await page.mouse.up({ button: "right" });
  const childView = await view(page);
  await background(page, "创建子画布");
  await rename(page, page.locator(".card-canvas"), "孙画布");
  await page
    .getByRole("button", { name: "进入子画布 孙画布", exact: true })
    .click();
  await page.keyboard.press("t");
  await page.getByRole("textbox", { name: "任务内容 1" }).fill("孙画布任务");
  await page.keyboard.press("ControlOrMeta+Enter");
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "孙画布任务" }),
  ).toBeVisible();
  await expect(page.locator(".canvas-navigation")).toHaveText("孙画布");
  await page.getByRole("button", { name: "返回父画布" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect(page.getByText("子画布里的文本", { exact: true })).toBeVisible();
  expect(await view(page)).toEqual(childView);
  await page.screenshot({ path: "/tmp/yua-nested-canvas.png" });
  await page.getByRole("button", { name: "返回父画布" }).click();
  await expect(page.getByTestId("card")).toHaveCount(3);
  expect(await view(page)).toEqual(rootView);
  const stored = (await snapshot(page)).board;
  expect(stored.cards.filter((c: any) => c.kind !== "canvas")).toEqual(
    original.cards,
  );
  expect(stored.groups).toEqual(original.groups);
  expect(stored.connections).toEqual(original.connections);
});

test("creating a parent wraps once, disallows another parent and undoes without losing content or viewport", async ({
  page,
}) => {
  await load(page, seed());
  const original = (await snapshot(page)).board,
    originalView = await view(page);
  await background(page, "创建父画布");
  await expect(page.locator(".card-canvas")).toHaveCount(1);
  const parent = (await snapshot(page)).board;
  expect(parent.cards[0].canvas).toEqual(original);
  await expect(page.getByRole("button", { name: "返回父画布" })).toHaveCount(0);
  await page
    .getByRole("button", { name: "进入子画布 画布", exact: true })
    .click();
  expect(await view(page)).toEqual(originalView);
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 1100, y: 550 } });
  await expect(
    page.getByRole("menuitem", { name: "创建父画布", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: "返回父画布" })).toHaveCount(0);
  expect((await snapshot(page)).board).toEqual(original);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator(".card-canvas")).toHaveCount(1);
  expect((await snapshot(page)).board.cards[0].canvas).toEqual(original);
});

test("canvas duplication and ZIP restore independent complete subtrees, original file bytes, task IDs and local connections", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const inner = {
    version: 1,
    id: "inner",
    groups: [
      {
        id: "ig",
        name: "子组",
        bounds: { x: 30, y: 50, width: 700, height: 470 },
        color: "#dcfce7",
      },
    ],
    cards: [
      { ...note("text"), group: "ig" },
      {
        ...note("file", 400),
        kind: "file",
        title: "data.env",
        blob: "data:text/plain;base64,SEVMTE8NCg==",
        group: "ig",
      },
      {
        ...note("todo", 100, 300),
        kind: "todo",
        text: "",
        tasks: [{ id: "t", text: "任务", done: true }],
        group: "ig",
      },
      {
        ...note("deeper", 400, 300),
        kind: "canvas",
        title: "图片集",
        canvas: {
          version: 1,
          id: "deep",
          groups: [],
          cards: [
            {
              ...note("image"),
              kind: "image",
              title: "原图.png",
              blob: "data:image/png;base64," + pixel,
            },
            {
              ...note("reserved-file", 400),
              kind: "file",
              title: "yua-canvas.metadata.json",
              blob: "data:application/json;base64,e30=",
            },
          ],
        },
        group: "ig",
      },
    ],
    connections: [
      {
        id: "inner-link",
        from: { card: "text", side: "e" },
        to: { card: "file", side: "w" },
      },
    ],
  };
  await load(page, {
    version: 1,
    groups: [],
    cards: [{ ...note("node"), kind: "canvas", title: "项目", canvas: inner }],
  });
  await page.locator(".card-canvas").click({ position: { x: 35, y: 35 } });
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.locator(".card-canvas")).toHaveCount(2);
  const copied = (await snapshot(page)).board,
    first = copied.cards[0].canvas,
    second = copied.cards[1].canvas;
  expect(second.id).not.toBe(first.id);
  expect(
    second.cards.every(
      (c: any) => !first.cards.some((old: any) => old.id === c.id),
    ),
  ).toBe(true);
  expect(second.cards.find((c: any) => c.kind === "todo").tasks[0].id).not.toBe(
    first.cards.find((c: any) => c.kind === "todo").tasks[0].id,
  );
  expect(second.cards.find((c: any) => c.kind === "canvas").canvas.id).not.toBe(
    first.cards.find((c: any) => c.kind === "canvas").canvas.id,
  );
  expect(second.cards.find((c: any) => c.kind === "file").blob).toBe(
    first.cards.find((c: any) => c.kind === "file").blob,
  );
  expect(
    second.connections.every(
      (c: any) =>
        second.cards.some((n: any) => n.id === c.from.card) &&
        second.cards.some((n: any) => n.id === c.to.card),
    ),
  ).toBe(true);
  await page
    .locator(".card-canvas")
    .last()
    .getByRole("button", { name: "进入子画布 项目" })
    .click();
  const edited = page.locator(".card-text");
  await edited.dblclick();
  await page.getByRole("textbox", { name: "文本内容" }).fill("只修改副本");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.getByRole("button", { name: "返回父画布" }).click();
  await page
    .locator(".card-canvas")
    .first()
    .click({ position: { x: 10, y: 10 } });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator(".card-canvas")).toHaveCount(3);
  await page.keyboard.press("ControlOrMeta+a");
  const zip = await download(page, "批量下载"),
    entries = unzipSync(zip.data),
    metadata = JSON.parse(strFromU8(entries["yua-canvas.metadata.json"]));
  expect(
    Object.keys(entries).filter((p) => p.endsWith("data.env")),
  ).toHaveLength(3);
  expect(
    Buffer.from(
      entries[Object.keys(entries).find((p) => p.endsWith("data.env"))!],
    ).toString(),
  ).toBe("HELLO\r\n");
  expect(
    metadata.cards[0].canvas.cards.find((c: any) => c.kind === "file").blob,
  ).toBeUndefined();
  await page.getByTestId("files").setInputFiles({
    name: "nested.zip",
    mimeType: "application/zip",
    buffer: zip.data,
  });
  await expect(page.locator(".card-canvas")).toHaveCount(6);
  const restored = (await snapshot(page)).board;
  expect(new Set(restored.cards.map((c: any) => c.canvas.id)).size).toBe(6);
  expect(
    restored.cards.every(
      (c: any) =>
        c.canvas.cards.find((f: any) => f.kind === "file").blob ===
        first.cards.find((f: any) => f.kind === "file").blob,
    ),
  ).toBe(true);
  expect(
    restored.cards.every(
      (c: any) =>
        c.canvas.cards
          .find((n: any) => n.kind === "canvas")
          .canvas.cards.find((f: any) => f.kind === "file").title ===
        "yua-canvas.metadata.json",
    ),
  ).toBe(true);
  const json = await download(page, "导出画布");
  await page.getByTestId("import").setInputFiles({
    name: "nested.json",
    mimeType: "application/json",
    buffer: json.data,
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".card-canvas")).toHaveCount(6);
  const final = (await snapshot(page)).board;
  expect(
    final.cards[0].canvas.cards.find((c: any) => c.kind === "text").text,
  ).toBe("text");
  expect(
    final.cards[1].canvas.cards.find((c: any) => c.kind === "text").text,
  ).toBe("只修改副本");
});

test("deleting inside a child prunes its own links and deletion of an active canvas through undo returns to a valid parent", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await page.getByRole("button", { name: "创建子画布", exact: true }).click();
  await page.getByRole("button", { name: "进入子画布 子画布" }).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "返回父画布" })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.getByRole("button", { name: "进入子画布 子画布" }).click();
  await text(page, "内部元素");
  await page.locator(".card-text").click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".card-text")).toContainText("内部元素");
  await page.getByRole("button", { name: "返回父画布" }).click();
  await expect(page.locator(".card-canvas")).toHaveCount(1);
});

test("malformed nested JSON is rejected atomically and right-button dragging never creates a canvas menu", async ({
  page,
}) => {
  await load(page, seed());
  const original = (await snapshot(page)).board;
  await page.getByTestId("import").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          {
            ...note("bad"),
            kind: "canvas",
            canvas: {
              version: 1,
              groups: [],
              cards: [{ ...note("missing"), kind: "file" }],
            },
          },
        ],
      }),
    ),
  });
  await expect(page.getByRole("dialog", { name: "确认导入" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("缺少附件");
  expect((await snapshot(page)).board).toEqual(original);
  await page.mouse.move(28, 130);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(70, 170, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("child edits prune only child connections; deleting a canvas removes its subtree and parent links, and undo restores both", async ({
  page,
}) => {
  const inner = {
    version: 1,
    groups: [],
    cards: [note("inside", 100, 100), note("target", 500, 100)],
    connections: [
      {
        id: "inner",
        from: { card: "inside", side: "e" },
        to: { card: "target", side: "w" },
      },
    ],
  };
  await load(page, {
    version: 1,
    groups: [],
    cards: [
      {
        ...note("canvas", 100, 100),
        kind: "canvas",
        title: "子项目",
        canvas: inner,
      },
      note("outside", 650, 100),
    ],
    connections: [
      {
        id: "outer",
        from: { card: "canvas", side: "e" },
        to: { card: "outside", side: "w" },
      },
    ],
  });
  const original = (await snapshot(page)).board;
  await page.getByRole("button", { name: "进入子画布 子项目" }).click();
  await page.locator('[data-card-id="inside"]').click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".connection-path")).toHaveCount(0);
  const changed = (await snapshot(page)).board;
  expect(changed.connections).toEqual(original.connections);
  expect(changed.cards[0].canvas.connections).toEqual([]);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await snapshot(page)).board).toEqual(original);
  await page.getByRole("button", { name: "返回父画布" }).click();
  await page
    .locator(".card-canvas")
    .click({ button: "right", position: { x: 40, y: 40 } });
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  expect((await snapshot(page)).board.cards.map((c: any) => c.id)).toEqual([
    "outside",
  ]);
  await expect(page.locator(".connection-path")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await snapshot(page)).board).toEqual(original);
});

test("an image upload started before creating a parent completes in its original canvas and never changes the new parent selection", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    (window as any).releaseImage = release;
    HTMLImageElement.prototype.decode = function () {
      return pending.then(() => decode.call(this));
    };
  });
  await page.getByTestId("images").setInputFiles({
    name: "等待.png",
    mimeType: "image/png",
    buffer: Buffer.from(pixel, "base64"),
  });
  await background(page, "创建父画布");
  await page.evaluate(() => (window as any).releaseImage());
  await saved(page);
  await expect(page.locator(".card-canvas")).toHaveCount(1);
  await expect(page.locator(".card-image")).toHaveCount(0);
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await page
    .getByRole("button", { name: "进入子画布 画布", exact: true })
    .click();
  await expect(page.locator(".card-image")).toHaveCount(1);
  expect((await current(page)).cards[0].title).toBe("等待.png");
});

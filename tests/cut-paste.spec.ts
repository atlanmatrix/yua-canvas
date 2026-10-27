import { test, expect, type Page } from "@playwright/test";
const note = (id: string, x: number, y: number) => ({
  id,
  kind: "text",
  title: "",
  text: id,
  x,
  y,
  width: 180,
  height: 80,
  color: "#ffffff",
});
const cards = [
  note("A", 80, 120),
  note("B", 420, 120),
  {
    id: "child",
    kind: "canvas",
    title: "子画布",
    text: "",
    x: 760,
    y: 120,
    color: "#ffffff",
    canvas: {
      version: 1,
      id: "child-board",
      cards: [
        {
          id: "file",
          kind: "file",
          title: "sample.bin",
          text: "",
          x: 80,
          y: 100,
          color: "#ffffff",
          blob: "data:application/octet-stream;base64,AAEC/w==",
        },
        {
          id: "todo",
          kind: "todo",
          title: "",
          text: "",
          x: 400,
          y: 100,
          color: "#ffffff",
          tasks: [{ id: "t1", text: "内部任务", done: true }],
        },
      ],
      groups: [],
      connections: [
        {
          id: "inner-link",
          from: { card: "file", side: "e" },
          to: { card: "todo", side: "w", task: "t1" },
        },
      ],
    },
  },
];
async function setup(page: Page, group = false) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards: cards.map((c) => (group ? { ...c, group: "outer" } : c)),
        groups: group
          ? [
              {
                id: "outer",
                name: "整组",
                bounds: { x: 30, y: 60, width: 1100, height: 350 },
              },
            ]
          : [],
        connections: [
          {
            id: "link",
            from: { card: "A", side: "e" },
            to: { card: "B", side: "w" },
            label: "内部连线",
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(3);
}
async function snapshot(page: Page) {
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  const download = await promise,
    stream = await download.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
async function background(page: Page, x = 600, y = 500) {
  await page.locator(".canvas").click({ button: "right", position: { x, y } });
  return page.getByRole("menu");
}
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});
test("keyboard cuts multiple cards, menu pastes at cursor with internal links and undo", async ({
  page,
}) => {
  await setup(page);
  await page.locator('[data-card-id="A"]').click();
  await page
    .locator('[data-card-id="B"]')
    .click({ modifiers: ["ControlOrMeta"] });
  await page.keyboard.press("ControlOrMeta+x");
  await expect(page.getByRole("status")).toHaveText("已剪切");
  await expect(page.getByTestId("card")).toHaveCount(1);
  const popup = await background(page);
  const clickPoint = await page.locator(".canvas").evaluate((el) => {
    const r = el.getBoundingClientRect(),
      m = new DOMMatrix(
        getComputedStyle(document.querySelector(".world")!).transform,
      );
    return { x: (600 - m.e) / m.a, y: (500 - m.f) / m.a };
  });
  await popup.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await expect(page.getByTestId("card")).toHaveCount(3);
  const result = await snapshot(page),
    a = result.cards.find((c: any) => c.text === "A"),
    b = result.cards.find((c: any) => c.text === "B");
  expect(a.id).not.toBe("A");
  expect(b.id).not.toBe("B");
  expect(a.x).toBeCloseTo(clickPoint.x);
  expect(a.y).toBeCloseTo(clickPoint.y);
  expect(b.x - a.x).toBeCloseTo(340);
  expect(result.connections).toHaveLength(1);
  expect(result.connections[0].from.card).toBe(a.id);
  expect(result.connections[0].to.card).toBe(b.id);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(3);
  expect((await snapshot(page)).cards.some((c: any) => c.id === "A")).toBe(
    true,
  );
});
test("component menu cuts a subcanvas with original bytes and can paste into another canvas", async ({
  page,
}) => {
  await setup(page);
  await page
    .locator('[data-card-id="child"]')
    .click({ button: "right", position: { x: 30, y: 30 } });
  await page.getByRole("menuitem", { name: "剪切", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已剪切");
  await expect(page.getByTestId("card")).toHaveCount(2);
  await (
    await background(page)
  )
    .getByRole("menuitem", { name: "创建子画布", exact: true })
    .click();
  const newChild = page.locator(".card-canvas");
  await newChild.dblclick({ position: { x: 30, y: 30 } });
  await expect(page.getByTestId("card")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(1);
  const result = await snapshot(page),
    nested = result.cards[0].canvas;
  expect(nested.id).not.toBe("child-board");
  expect(nested.cards.find((c: any) => c.kind === "file").blob).toBe(
    "data:application/octet-stream;base64,AAEC/w==",
  );
  expect(nested.cards.find((c: any) => c.kind === "todo").tasks[0].done).toBe(
    true,
  );
  expect(nested.connections).toHaveLength(1);
  await (
    await background(page)
  )
    .getByRole("menuitem", { name: "返回父画布", exact: true })
    .click();
  await expect(page.locator(".canvas-navigation")).toHaveCount(0);
  await expect(
    (await background(page)).getByRole("menuitem", {
      name: "返回父画布",
      exact: true,
    }),
  ).toBeDisabled();
});
test("group menu cuts and restores the complete group and descendants", async ({
  page,
}) => {
  await setup(page, true);
  await page
    .getByRole("button", { name: "拖动分组 整组", exact: true })
    .click({ button: "right", position: { x: 30, y: 12 } });
  await page.getByRole("menuitem", { name: "剪切", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已剪切分组");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.locator(".group-frame")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(3);
  const result = await snapshot(page);
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].id).not.toBe("outer");
  expect(result.cards.every((c: any) => c.group === result.groups[0].id)).toBe(
    true,
  );
  expect(result.connections).toHaveLength(1);
  expect(
    result.cards.find((c: any) => c.kind === "canvas").canvas.cards,
  ).toHaveLength(2);
});
test("clipboard write failure keeps cut source and input retains native cut behavior", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: () =>
        Promise.reject(new DOMException("denied", "NotAllowedError")),
    });
  });
  await page.locator('[data-card-id="A"]').click();
  await page.keyboard.press("ControlOrMeta+x");
  await expect(page.getByRole("status")).toContainText("剪切失败");
  await expect(page.getByTestId("card")).toHaveCount(3);
  await page.getByRole("button", { name: "展开搜索" }).click();
  const input = page.getByRole("textbox", { name: "搜索画布" });
  await input.fill("native");
  await input.selectText();
  await page.keyboard.press("ControlOrMeta+x");
  await expect(input).toHaveValue("");
  expect((await snapshot(page)).cards).toHaveLength(3);
});
test("menu paste reads current external clipboard and denied reads do not paste stale content", async ({
  page,
}) => {
  await setup(page);
  await page.locator('[data-card-id="A"]').click();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toHaveText("已复制");
  await page.evaluate(() => navigator.clipboard.writeText("外部新内容"));
  await (
    await background(page)
  )
    .getByRole("menuitem", { name: "粘贴", exact: true })
    .click();
  await expect(page.getByTestId("card")).toHaveCount(4);
  await expect(page.getByText("外部新内容", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "read", {
      configurable: true,
      value: () =>
        Promise.reject(new DOMException("denied", "NotAllowedError")),
    });
  });
  await (
    await background(page, 400, 600)
  )
    .getByRole("menuitem", { name: "粘贴", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("无法读取剪贴板");
  await expect(page.getByTestId("card")).toHaveCount(4);
});

test("cut survives a page reload without losing attachments", async ({
  page,
}) => {
  await setup(page);
  await page
    .locator('[data-card-id="child"]')
    .click({ button: "right", position: { x: 30, y: 30 } });
  await page.getByRole("menuitem", { name: "剪切", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已剪切");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(3);
  const data = await snapshot(page);
  expect(
    data.cards
      .find((c: any) => c.kind === "canvas")
      .canvas.cards.find((c: any) => c.kind === "file").blob,
  ).toBe("data:application/octet-stream;base64,AAEC/w==");
});

test("async menu paste preserves edits made while waiting for clipboard permission", async ({
  page,
}) => {
  await setup(page);
  await page.locator('[data-card-id="A"]').click();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toHaveText("已复制");
  await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    Object.defineProperty(navigator.clipboard, "read", {
      configurable: true,
      value: () =>
        new Promise((resolve) => {
          (window as any).finishClipboardRead = () => resolve(items);
        }),
    });
  });
  await (
    await background(page)
  )
    .getByRole("menuitem", { name: "粘贴", exact: true })
    .click();
  await page.keyboard.press("n");
  const editor = page.getByRole("textbox", { name: "文本内容" });
  await editor.fill("读取期间新增的内容");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("card")).toHaveCount(4);
  await page.evaluate(() => (window as any).finishClipboardRead());
  await expect(page.getByTestId("card")).toHaveCount(5);
  await expect(
    page.getByText("读取期间新增的内容", { exact: true }),
  ).toBeVisible();
});

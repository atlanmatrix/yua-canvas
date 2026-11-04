import { test, expect, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { openSettings } from "./settings-helper.mjs";
import { pdfFixture } from "./pdf-fixture.mjs";
const note = (id: string, x: number, y: number) => ({
  id,
  kind: "text",
  title: "",
  text: id,
  x,
  y,
  width: 180,
  height: 100,
  color: "#ffffff",
  displayMode: "large",
});
const card = (page: Page, id: string) =>
  page.locator(`.card[data-card-id="${id}"]`);
async function setup(page: Page, extras: any[] = []) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "selection.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          note("a", 100, 120),
          note("b", 500, 120),
          note("outside", 900, 450),
          ...extras,
        ],
        connections: [
          {
            id: "inside",
            from: { card: "a", side: "e" },
            to: { card: "b", side: "w" },
            label: "inside link",
          },
          {
            id: "external",
            from: { card: "b", side: "s" },
            to: { card: "outside", side: "n" },
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  await expect(card(page, "a")).toBeVisible();
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
}
async function selectPair(page: Page) {
  await card(page, "a").click();
  await card(page, "b").click({ modifiers: ["Shift"] });
  await expect(page.locator(".card.selected")).toHaveCount(2);
}
async function contextExport(page: Page) {
  await card(page, "a").click({ button: "right" });
  await page.getByRole("menuitem", { name: "导出", exact: true }).click();
  const menu = page.getByRole("menu", { name: "导出格式", exact: true });
  await expect(menu.getByRole("menuitem")).toHaveCount(3);
  return menu;
}
async function bytes(page: Page, action: () => Promise<unknown>) {
  const pending = page.waitForEvent("download");
  await action();
  const d = await pending,
    stream = await d.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return { name: d.suggestedFilename(), data: Buffer.concat(chunks) };
}

test("modifier and marquee selections include only internal edges; H masks a selection in one undo", async ({
  page,
}) => {
  await setup(page);
  await selectPair(page);
  await expect(
    page.locator('[data-connection-id="inside"] .connection-path'),
  ).toHaveClass(/selected/);
  await expect(
    page.locator('[data-connection-id="external"] .connection-path'),
  ).not.toHaveClass(/selected/);
  await page.keyboard.press("h");
  await expect(page.locator(".card .component-mask")).toHaveCount(2);
  await page.keyboard.press("h");
  await expect(page.locator(".card .component-mask")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".card .component-mask")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".card .component-mask")).toHaveCount(0);
  const a = (await card(page, "a").boundingBox())!,
    b = (await card(page, "b").boundingBox())!;
  await page.mouse.move(Math.min(a.x, b.x) - 25, Math.min(a.y, b.y) - 25);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(a.x + a.width, b.x + b.width) + 25,
    Math.max(a.y + a.height, b.y + b.height) + 25,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.locator(".card.selected")).toHaveCount(2);
  await expect(
    page.locator('[data-connection-id="inside"] .connection-path'),
  ).toHaveClass(/selected/);
  await card(page, "b").click({ modifiers: ["Shift"] });
  await expect(page.locator(".connection-path.selected")).toHaveCount(0);
  await page.keyboard.press("h");
  await card(page, "b").click({ modifiers: ["Shift"] });
  await card(page, "a").click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "遮罩", exact: true }).locator("kbd"),
  ).toHaveText("H");
  await page.getByRole("menuitem", { name: "遮罩", exact: true }).click();
  await expect(page.locator(".card .component-mask")).toHaveCount(2);
  await page.keyboard.press("h");
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(1);
  await expect(page.locator(".connection-path")).toHaveCount(0);
});

test("selected canvas and ZIP export contain selected cards and internal links; settings ZIP contains the workspace", async ({
  page,
}) => {
  await setup(page);
  await selectPair(page);
  let menu = await contextExport(page);
  const json = await bytes(page, () =>
    menu.getByRole("menuitem", { name: "画布", exact: true }).click(),
  );
  const snapshot = JSON.parse(json.data.toString());
  expect(snapshot.cards.map((c: any) => c.id)).toEqual(["a", "b"]);
  expect(snapshot.connections.map((c: any) => c.id)).toEqual(["inside"]);
  menu = await contextExport(page);
  const zip = await bytes(page, () =>
    menu.getByRole("menuitem", { name: "组件压缩包", exact: true }).click(),
  );
  const metadata = JSON.parse(
    strFromU8(unzipSync(zip.data)["yua-canvas.metadata.json"]),
  );
  expect(metadata.cards).toHaveLength(2);
  expect(metadata.connections).toHaveLength(1);
  await openSettings(page);
  await expect(
    page.getByRole("menu", { name: "导出格式", exact: true }),
  ).toHaveCount(0);
  await openSettings(page);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const whole = await bytes(page, () =>
    page.getByRole("menuitem", { name: "组件压缩包", exact: true }).click(),
  );
  expect(
    JSON.parse(strFromU8(unzipSync(whole.data)["yua-canvas.metadata.json"]))
      .cards,
  ).toHaveLength(3);
});

test("PNG renders selected offscreen PDF and diagrams without exporting controls or unselected content", async ({
  page,
}) => {
  await setup(page, [
    {
      ...note("pdf", 3000, 1500),
      kind: "file",
      title: "page.pdf",
      text: "",
      width: 200,
      height: 300,
      contentAspectRatio: 2 / 3,
      mime: "application/pdf",
      blob: "data:application/pdf;base64," + pdfFixture().toString("base64"),
    },
    {
      ...note("diagram", 3350, 1500),
      kind: "mermaid",
      text: "graph TD; Hello-->World",
      width: 260,
      height: 180,
    },
  ]);
  // Deliberately export before these previews have ever entered the viewport.
  await page.keyboard.press("ControlOrMeta+a");
  await card(page, "a").click({ button: "right" });
  await page.getByRole("menuitem", { name: "导出", exact: true }).click();
  const image = await bytes(page, () =>
    page.getByRole("menuitem", { name: "PNG 图像", exact: true }).click(),
  );
  expect(image.name).toMatch(/\.png$/);
  expect(image.data.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    let red = 0,
      dark = 0;
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 180 && pixels[i + 1] < 70 && pixels[i + 2] < 70) red++;
      if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100) dark++;
    }
    return { width: img.width, height: img.height, red, dark };
  }, image.data.toString("base64"));
  expect(stats.width).toBeGreaterThan(3000);
  expect(stats.height).toBeGreaterThan(1500);
  expect(stats.red).toBeGreaterThan(10000);
  expect(stats.dark).toBeGreaterThan(300);
  await expect(page.locator(".png-export")).toHaveCount(0);
});

test("dialogs are opaque, controls are lighter, and menu shortcuts remain accessible", async ({
  page,
}) => {
  await setup(page, [
    {
      ...note("todo", 100, 350),
      kind: "todo",
      tasks: [{ id: "task", text: "task", done: false }],
    },
  ]);
  await expect(page.locator('.todo-list input[type="checkbox"]')).toHaveCSS(
    "background-color",
    "rgba(184, 194, 207, 0.25)",
  );
  await openSettings(page);
  await expect(page.locator(".settings-popover")).toHaveCSS(
    "backdrop-filter",
    "none",
  );
  await expect(page.locator(".settings-popover")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(
    page.getByRole("button", { name: "导入", exact: true }).locator("kbd"),
  ).toHaveText(/Ctrl\+O|⌘O/);
  await page.getByRole("button", { name: "导出", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("menuitem", { name: "画布", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "组件压缩包", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "导出", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await card(page, "a").click();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "文本内容", exact: true }).fill("h");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(card(page, "a")).toContainText("h");
  await expect(page.locator(".component-mask")).toHaveCount(0);
});

test("PNG respects masking and excludes unselected components", async ({
  page,
}) => {
  await page.goto("/");
  const svg = (color: string) =>
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="100"><rect width="180" height="100" fill="${color}"/></svg>`,
    ).toString("base64");
  await page.getByTestId("import").setInputFiles({
    name: "mask.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          note("a", 100, 120),
          {
            ...note("b", 500, 120),
            kind: "image",
            text: "",
            masked: true,
            blob: svg("blue"),
            mime: "image/svg+xml",
          },
          {
            ...note("outside", 900, 450),
            kind: "image",
            text: "",
            blob: svg("red"),
            mime: "image/svg+xml",
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  await selectPair(page);
  const menu = await contextExport(page);
  const image = await bytes(page, () =>
    menu.getByRole("menuitem", { name: "PNG 图像", exact: true }).click(),
  );
  const pixels = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        (data[i] > 200 && data[i + 1] < 50 && data[i + 2] < 50) ||
        (data[i + 2] > 200 && data[i] < 50 && data[i + 1] < 50)
      )
        colored++;
    return { colored, width: img.width, height: img.height };
  }, image.data.toString("base64"));
  expect(pixels.colored).toBe(0);
  expect(pixels.width).toBeLessThan(1400);
  expect(pixels.height).toBeLessThan(400);
});

test.describe("touch export menu", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test("settings export choices remain reachable inside a narrow viewport", async ({
    page,
  }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: "导出", exact: true }).tap();
    const menu = page.getByRole("menu", { name: "导出格式", exact: true });
    await expect(menu.getByRole("menuitem")).toHaveCount(3);
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(382);
    await page.screenshot({ path: "/tmp/yua-export-settings-touch.png" });
    const backup = await bytes(page, () =>
      menu.getByRole("menuitem", { name: "画布", exact: true }).tap(),
    );
    expect(JSON.parse(backup.data.toString()).cards).toHaveLength(0);
    await expect(page.locator(".settings-popover")).not.toBeVisible();
  });
});

test("H masks a selected group without changing its children's individual masks", async ({
  page,
}) => {
  await setup(page);
  await selectPair(page);
  await page.keyboard.press("ControlOrMeta+g");
  await page
    .getByRole("textbox", { name: "分组名称", exact: true })
    .fill("group mask");
  await page.getByRole("button", { name: "保存分组", exact: true }).click();
  await page
    .getByRole("button", { name: "拖动分组 group mask", exact: true })
    .click();
  await page.keyboard.press("h");
  await expect(page.locator(".group-boundary > .component-mask")).toHaveCount(
    1,
  );
  await expect(card(page, "a")).toHaveCount(0);
  await page.keyboard.press("h");
  await expect(card(page, "a")).toBeVisible();
  await expect(card(page, "b")).toBeVisible();
  await expect(page.locator(".component-mask")).toHaveCount(0);
});

test("PNG waits for cold file previews inside list groups", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const read = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function () {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return read.call(this);
    };
  });
  await page.goto("/");
  const source =
    "```mermaid\nflowchart LR; A[Ready]-->B[Exported]; style A fill:#ff0000;\n```\n";
  await page
    .getByTestId("import")
    .setInputFiles({
      name: "list.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          groups: [
            {
              id: "list",
              name: "List",
              displayMode: "list",
              activeCard: "doc",
              bounds: { x: 3000, y: 1500, width: 800, height: 500 },
            },
          ],
          cards: [
            {
              ...note("doc", 3100, 1600),
              kind: "file",
              group: "list",
              title: "diagram.md",
              text: "",
              width: 400,
              height: 300,
              mime: "text/markdown",
              blob:
                "data:text/markdown;base64," +
                Buffer.from(source).toString("base64"),
            },
          ],
        }),
      ),
    });
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  await openSettings(page);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const image = await bytes(page, () =>
    page.getByRole("menuitem", { name: "PNG 图像", exact: true }).click(),
  );
  const red = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) count++;
    return count;
  }, image.data.toString("base64"));
  expect(red).toBeGreaterThan(1000);
});

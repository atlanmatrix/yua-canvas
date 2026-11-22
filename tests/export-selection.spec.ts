import { test, expect, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
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
  await expect(menu.getByRole("menuitem")).toHaveText([
    "组件压缩包",
    "画布",
    "PNG 图像",
    "PDF 文档",
    "HTML 网页",
  ]);
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

test("PDF downloads use a single page sized to the selected components", async ({
  page,
}) => {
  await setup(page);
  await selectPair(page);
  const menu = await contextExport(page);
  const file = await bytes(page, () =>
    menu.getByRole("menuitem", { name: "PDF 文档", exact: true }).click(),
  );
  expect(file.name).toMatch(/\.pdf$/);
  const pdf = await PDFDocument.load(file.data);
  expect(pdf.getPageCount()).toBe(1);
  // Both selected notes and their internal link fit inside these bounds.
  // Including the third note would extend the page down and to the right.
  const size = pdf.getPages()[0].getSize();
  expect(size.width).toBe((680 - 100 + 2 * 24) * 0.75);
  expect(size.height).toBeGreaterThanOrEqual((24 + 2 * 16) * 0.75);
  expect(size.height).toBeLessThan((60 + 2 * 16) * 0.75);
  await expect(page.locator(".pdf-export")).toHaveCount(0);
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
    page.getByRole("menuitem", { name: "组件压缩包", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "画布", exact: true }),
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

test("H toggles masking for a selected child canvas", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "创建子画布", exact: true }).click();
  await page.keyboard.press("h");
  await expect(page.locator(".card-canvas > .component-mask")).toBeVisible();
  await page.keyboard.press("h");
  await expect(
    page.getByRole("button", { name: "进入子画布 子画布" }),
  ).toBeVisible();
});

test("PNG waits for cold file previews inside a migrated canvas", async ({
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
  await page.getByTestId("import").setInputFiles({
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
  await page.getByRole("button", { name: "进入子画布 List" }).click();
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

test("HTML selection opens offline with editable text, persistent checkboxes and only internal links", async ({
  page,
  context,
}) => {
  await setup(page, [
    {
      ...note("list", 120, 300),
      kind: "todo",
      tasks: [{ id: "task", text: "准备资料", done: false }],
    },
    { ...note("address", 840, 130), text: "person@example.org" },
    { ...note("hidden", 380, 305), masked: true, text: "private hidden note" },
    {
      ...note("formatted", 630, 300),
      text: "<标题> 正文",
      textRuns: [{ from: 0, to: 4, style: { bold: true } }],
    },
  ]);
  await selectPair(page);
  for (const id of ["list", "hidden", "formatted", "address"])
    await card(page, id).click({ modifiers: ["Shift"] });
  const menu = await contextExport(page);
  const exported = await bytes(page, () =>
    menu.getByRole("menuitem", { name: "HTML 网页" }).click(),
  );
  expect(exported.name).toMatch(/\.html$/);
  const html = exported.data.toString();
  expect(html).not.toContain("private hidden note");
  const url = await page.evaluate(
    (source) => URL.createObjectURL(new Blob([source], { type: "text/html" })),
    html,
  );
  const file = await context.newPage();
  await file.setViewportSize({ width: 520, height: 480 });
  const remoteRequests: string[] = [];
  file.on("request", (req) => {
    if (/^https?:/.test(req.url())) remoteRequests.push(req.url());
  });
  await context.setOffline(true);
  await file.goto(url);
  await expect(file.locator("article")).toHaveCount(6);
  const address = file.locator("article.note-address");
  await expect(address).toHaveCSS("height", "42px");
  await expect(address.locator(".note-link-icon")).toHaveCSS("width", "32px");
  await expect(address).toHaveCSS("padding", "4px 14px 4px 4px");
  await expect(address).toHaveCSS("gap", "10px");
  await expect(file.getByText("inside link")).toBeVisible();
  await expect(file.locator("button:visible,nav,iframe,form")).toHaveCount(0);
  const first = file.getByRole("textbox").first();
  await expect(first).toHaveText("a");
  const before = await file
    .locator("article")
    .evaluateAll((els) => els.map((el) => parseFloat(el.style.left)));
  expect(before[1] - before[0]).toBe(400);
  const canvas = file.locator("main");
  const fitted = (await canvas.boundingBox())!;
  const cursor = { x: 180, y: 60 };
  await file.mouse.move(cursor.x, cursor.y);
  await file.mouse.down({ button: "right" });
  await file.mouse.wheel(0, -120);
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeGreaterThan(fitted.width);
  const enlarged = (await canvas.boundingBox())!;
  const ratio = enlarged.width / fitted.width;
  expect(enlarged.x + (cursor.x - fitted.x) * ratio).toBeCloseTo(cursor.x, 1);
  expect(enlarged.y + (cursor.y - fitted.y) * ratio).toBeCloseTo(cursor.y, 1);

  await file.mouse.move(cursor.x + 36, cursor.y - 28, { steps: 5 });
  const panned = (await canvas.boundingBox())!;
  expect(panned.x - enlarged.x).toBeCloseTo(36, 1);
  expect(panned.y - enlarged.y).toBeCloseTo(-28, 1);
  expect(panned.width).toBeCloseTo(enlarged.width, 1);
  await file.mouse.wheel(0, 120);
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeCloseTo(fitted.width, 1);
  await file.mouse.up({ button: "right" });
  await expect(file.locator("body")).not.toHaveClass(/is-grabbing/);
  await expect(file.getByRole("menu")).toHaveCount(0);

  const released = await canvas.boundingBox();
  await file.mouse.wheel(0, -120);
  await file.mouse.move(cursor.x, cursor.y);
  expect(await canvas.boundingBox()).toEqual(released);
  const natural = await canvas.evaluate((el) => el.offsetWidth);
  for (const modifier of ["Control", "Meta"]) {
    await file.keyboard.press(`${modifier}+1`);
    expect((await canvas.boundingBox())!.width).toBeCloseTo(natural, 1);
    expect(
      await file.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
        window.scrollX,
        window.scrollY,
      ]),
    ).toEqual([520, 480, 0, 0]);
    await file.keyboard.press(`${modifier}+0`);
    expect(await canvas.boundingBox()).toEqual(fitted);
  }

  // Resizing in fit mode also respects the vertical bounds.
  await file.setViewportSize({ width: 900, height: 220 });
  await expect
    .poll(async () => (await canvas.boundingBox())!.height)
    .toBeCloseTo(220, 1);
  await file.setViewportSize({ width: 520, height: 480 });
  await expect.poll(() => canvas.boundingBox()).toEqual(fitted);
  await first.fill("修订后的内容");
  const check = file.getByRole("checkbox", { name: "准备资料" });
  await check.check();
  await file.reload();
  await expect(first).toHaveText("修订后的内容");
  await expect(check).toBeChecked();
  await expect(file.getByText("<标题>", { exact: true })).toHaveCSS(
    "font-weight",
    "700",
  );
  expect(remoteRequests).toEqual([]);
  await expect(card(page, "a").locator(".note-body")).toHaveText("a");
  await expect(card(page, "list").getByRole("checkbox")).not.toBeChecked();
});

test("single component context menu exports a self-contained image preview", async ({
  page,
}) => {
  const picture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#16984d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  });
  await setup(page, [
    {
      ...note("picture", 120, 310),
      kind: "image",
      title: "pixel.png",
      text: "",
      blob: picture,
    },
  ]);
  await card(page, "picture").click({ button: "right" });
  await page.getByRole("menuitem", { name: "导出", exact: true }).click();
  const file = await bytes(page, () =>
    page.getByRole("menuitem", { name: "HTML 网页" }).click(),
  );
  const result = await page.evaluate(async (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const img = new Image();
    img.src = doc.querySelector("article img")!.getAttribute("src")!;
    await img.decode();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      img,
      Math.floor(img.width / 2),
      Math.floor(img.height / 2),
      1,
      1,
      0,
      0,
      1,
      1,
    );
    return {
      count: doc.querySelectorAll("article").length,
      center: [...ctx.getImageData(0, 0, 1, 1).data],
    };
  }, file.data.toString());
  expect(result).toEqual({ count: 1, center: [22, 152, 77, 255] });
});

test("exporting from empty space in a child canvas includes its drawing and excludes the parent", async ({
  page,
}) => {
  const stroke = {
    id: "ink",
    color: "#ff0000",
    width: 5,
    points: [
      { x: 30, y: 90 },
      { x: 640, y: 210 },
    ],
  };
  await setup(page, [
    {
      ...note("child", 300, 300),
      kind: "canvas",
      title: "子画布",
      text: "",
      canvas: {
        version: 1,
        groups: [],
        cards: [note("child-note", 190, 110)],
        strokes: [stroke],
      },
    },
  ]);
  await page.getByRole("button", { name: "进入子画布 子画布" }).click();
  await expect(card(page, "child-note")).toBeVisible();
  await expect(page.locator(".card.selected")).toHaveCount(0);
  const fromCanvas = async (format: string) => {
    await page
      .locator(".canvas")
      .click({ button: "right", position: { x: 8, y: 8 } });
    await page.getByRole("menuitem", { name: "导出", exact: true }).click();
    const choices = page.getByRole("menu", { name: "导出格式" });
    return bytes(page, () =>
      choices.getByRole("menuitem", { name: format, exact: true }).click(),
    );
  };
  const json = JSON.parse((await fromCanvas("画布")).data.toString());
  expect(json.cards.map((item: { id: string }) => item.id)).toEqual([
    "child-note",
  ]);
  expect(json.strokes).toEqual([stroke]);
  const zip = unzipSync((await fromCanvas("组件压缩包")).data);
  const metadata = JSON.parse(strFromU8(zip["yua-canvas.metadata.json"]));
  expect(metadata.cards.map((item: { id: string }) => item.id)).toEqual([
    "child-note",
  ]);
  expect(metadata.strokes).toEqual([stroke]);
  const html = (await fromCanvas("HTML 网页")).data.toString();
  expect(html).toContain('data-stroke-id="ink"');
  expect(html).toContain("child-note");
  expect(html).not.toContain(">outside<");
  for (const format of ["PNG 图像", "PDF 文档"]) {
    const file = await fromCanvas(format);
    const includesInk = await page.evaluate(
      async ({ base64, pdf }) => {
        const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        let blob = new Blob([data], {
          type: pdf ? "application/pdf" : "image/png",
        });
        if (pdf) {
          const { requestPdfPreview } = await import("/src/pdfPreviewCache.ts");
          const bitmap = await requestPdfPreview(
            blob,
            1,
            1200,
            800,
            new AbortController().signal,
          );
          blob = bitmap.blob;
        }
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return ctx
          .getImageData(0, 0, canvas.width, canvas.height)
          .data.some(
            (value, index, pixels) =>
              index % 4 === 0 &&
              value > 230 &&
              pixels[index + 1] < 20 &&
              pixels[index + 2] < 20,
          );
      },
      { base64: file.data.toString("base64"), pdf: format === "PDF 文档" },
    );
    expect(includesInk, format).toBe(true);
  }
});

async function downloadCardPdf(page: Page, id: string) {
  await card(page, id).click({ button: "right" });
  await page.getByRole("menuitem", { name: "导出", exact: true }).click();
  return bytes(page, () =>
    page.getByRole("menuitem", { name: "PDF 文档", exact: true }).click(),
  );
}

async function pdfPageColors(page: Page, file: Buffer, pageNumber: number) {
  return page.evaluate(
    async ({ data, last }) => {
      const { requestPdfPreview } = await import("/src/pdfPreviewCache.ts");
      const pdf = new Blob(
        [Uint8Array.from(atob(data), (c) => c.charCodeAt(0))],
        { type: "application/pdf" },
      );
      const page = await requestPdfPreview(
        pdf,
        last,
        820,
        1800,
        new AbortController().signal,
      );
      const img = await createImageBitmap(page.blob);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const { data: pixels } = ctx.getImageData(0, 0, img.width, img.height);
      const inkWidth = new Uint32Array(canvas.height);
      let green = 0,
        red = 0,
        dark = 0,
        marginX = img.width,
        marginY = img.height;
      for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
        if (g > 155 && g > r * 2 && g > b * 2) green++;
        if (Math.max(r, g, b) < 145) dark++;
        if (r > 200 && g < 60 && b < 60) red++;
        if (Math.min(r, g, b) < 250) {
          const x = (i / 4) % img.width,
            y = Math.floor(i / (4 * img.width));
          inkWidth[y]++;
          marginX = Math.min(marginX, x, img.width - x - 1);
          marginY = Math.min(marginY, y, img.height - y - 1);
        }
      }
      img.close();
      const firstInk = inkWidth.findIndex((n) => n > 0);
      const lastInk = inkWidth.findLastIndex((n) => n > 0);
      // PDF viewers can antialias the outer pixel of a horizontal rule.
      const topRule =
        Math.max(inkWidth[firstInk], inkWidth[firstInk + 1]) / canvas.width;
      const bottomRule =
        Math.max(inkWidth[lastInk], inkWidth[lastInk - 1]) / canvas.width;
      return {
        green,
        red,
        dark,
        marginX,
        marginY,
        bitmapWidth: canvas.width,
        topRule,
        bottomRule,
      };
    },
    { data: file.toString("base64"), last: pageNumber },
  );
}

test("Markdown PDF includes the final table row on paper without the card or scrollbar", async ({
  page,
  baseURL,
}) => {
  const marker = new URL("/pdf-last-row.svg", baseURL).href;
  await page.route("**/pdf-last-row.svg*", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="18"><rect width="45" height="18" fill="#26bf40"/></svg>',
    }),
  );
  const rows = Array.from(
    { length: 85 },
    (_, i) => "| Item " + (i + 1) + " | 内容 |",
  );
  const md = [
    "# 数据需求",
    "",
    "| 模块 | 数据 |",
    "| --- | --- |",
    ...rows,
    "| 完成 | ![末行](" + marker + ") |",
  ].join("\n");
  await setup(page, [
    {
      ...note("doc", 150, 300),
      kind: "file",
      title: "需求.md",
      mime: "text/markdown",
      displayMode: "small",
      color: "#ff0000",
      blob: "data:text/markdown;base64," + Buffer.from(md).toString("base64"),
    },
  ]);
  const file = await downloadCardPdf(page, "doc");
  const pages = (await PDFDocument.load(file.data)).getPages();
  expect(pages.length).toBeGreaterThan(1);
  const paperWidth = 410 + 2 * 24;
  for (const [index, sheet] of pages.entries()) {
    expect(sheet.getWidth()).toBe(paperWidth * 0.75);
    const colors = await pdfPageColors(page, file.data, index + 1);
    const pixelsPerCssPixel = colors.bitmapWidth / paperWidth;
    expect(colors.marginX).toBeGreaterThanOrEqual(24 * pixelsPerCssPixel - 2);
    expect(colors.marginY).toBeGreaterThanOrEqual(16 * pixelsPerCssPixel - 2);
    expect(colors.red).toBe(0);
    if (index === pages.length - 1) expect(colors.green).toBeGreaterThan(100);
  }
});

test("full PDF export retains code beyond the preview limit and every page of a PDF attachment", async ({
  page,
}) => {
  const source = (" ".repeat(80) + "\n").repeat(1000) + "END OF FILE";
  const attachment = pdfFixture(3);
  await setup(page, [
    {
      ...note("code", 105, 300),
      kind: "file",
      title: "source.txt",
      mime: "text/plain",
      displayMode: "small",
      blob: "data:text/plain;base64," + Buffer.from(source).toString("base64"),
    },
    {
      ...note("pdf", 550, 310),
      kind: "file",
      title: "pages.pdf",
      mime: "application/pdf",
      displayMode: "small",
      pdfPage: 2,
      blob: "data:application/pdf;base64," + attachment.toString("base64"),
    },
  ]);
  expect((await downloadCardPdf(page, "pdf")).data).toEqual(attachment);
  const file = await downloadCardPdf(page, "code");
  const count = (await PDFDocument.load(file.data)).getPageCount();
  // At 24px per line this exceeds both the normal preview limit and the
  // maximum height of a conventional 16K screenshot canvas.
  expect(count).toBeGreaterThan(20);
  const colors = await pdfPageColors(page, file.data, count);
  expect(colors.dark).toBeGreaterThan(0);
});

test("a wide Markdown table exports through its rightmost column", async ({
  page,
}) => {
  await page.route("**/pdf-last-col.svg*", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#26bf40"/></svg>',
    }),
  );
  const header = Array(20).fill("A").join("|");
  const rule = Array(20).fill("---").join("|");
  const row = Array(19).fill("X").concat("![end](/pdf-last-col.svg)").join("|");
  await setup(page, [
    {
      ...note("wide", 160, 300),
      kind: "file",
      title: "wide.md",
      displayMode: "custom",
      customSize: { width: 200, height: 100, base: "large" },
      mime: "text/markdown",
      blob:
        "data:text/markdown;base64," +
        Buffer.from([header, rule, row].join("\n")).toString("base64"),
    },
  ]);
  const file = await downloadCardPdf(page, "wide");
  const [sheet] = (await PDFDocument.load(file.data)).getPages();
  expect(sheet.getWidth()).toBeGreaterThan(200 * 0.75);
  const colors = await pdfPageColors(page, file.data, 1);
  const pixelsPerCssPixel = colors.bitmapWidth / (sheet.getWidth() / 0.75);
  expect(colors.marginX / pixelsPerCssPixel).toBeCloseTo(48, 0);
  expect(colors.marginY / pixelsPerCssPixel).toBeCloseTo(32, 0);
  expect(colors.green).toBeGreaterThan(0);
});

test("PDF includes mind map branches outside the card width", async ({
  page,
}) => {
  let branch = {
    id: "leaf",
    text: "末端",
    fill: "#26bf40",
    children: [] as unknown[],
  };
  // Keep the final leaf beyond 900 CSS pixels even with compact deep-level labels.
  for (let i = 0; i < 11; i++)
    branch = { id: "n" + i, text: "节点", fill: "#eeeeee", children: [branch] };
  await setup(page, [
    {
      ...note("map", 160, 300),
      kind: "mindmap",
      text: JSON.stringify({ root: branch, view: "map", checkboxes: false }),
      displayMode: "small",
    },
  ]);
  const file = await downloadCardPdf(page, "map");
  const [sheet] = (await PDFDocument.load(file.data)).getPages();
  expect(sheet.getWidth()).toBeGreaterThan(900 * 0.75);
  expect((await pdfPageColors(page, file.data, 1)).green).toBeGreaterThan(100);
});

for (const extraRows of [0, 95]) {
  test(
    "PDF preserves the closing rule of a wrapped table with " +
      extraRows +
      " continuation rows",
    async ({ page }) => {
      const md = [
        "# 数据需求",
        "",
        "|模块|依赖数据|来源系统|用途|",
        "|---|---|---|---|",
        "|用户|院内/电厂用户&组织架构数据|需确认（可能存在不同的用户管理体系）|用户同步、单点登录等|",
        "|项目计划管理|项目计划数据|项目管理辅助系统|同步年度技改项目、计划数据|",
        "|知识库模块|提问报告|ECM|历史经验的提取分析，问答，指导报告生成|",
        "|OBS|观察指导|人因管理系统|通过观察指导文件自动生成 OBS|",
        "|AFI|标准准则、程序|BDX|AFI业绩准则参考|",
        ...Array(extraRows).fill("|模块|数据|系统|用途|"),
        "|OE|事件、事件报告、SOER 等|经验反馈系统|数据分析、报告生成、经验库沉淀|",
      ].join("\n");
      await setup(page, [
        {
          ...note("table", 100, 300),
          kind: "file",
          title: "数据需求.md",
          mime: "text/markdown",
          displayMode: "custom",
          customSize: { width: 978, height: 350, base: "large" },
          blob:
            "data:text/markdown;base64," + Buffer.from(md).toString("base64"),
        },
      ]);
      const file = await downloadCardPdf(page, "table");
      const pages = (await PDFDocument.load(file.data)).getPageCount();
      if (extraRows) expect(pages).toBeGreaterThan(1);
      else expect(pages).toBe(1);
      for (let n = 1; n <= pages; n++) {
        const ink = await pdfPageColors(page, file.data, n);
        if (n > 1)
          expect(ink.topRule, "top of page " + n).toBeGreaterThan(0.75);
        expect(ink.bottomRule, "bottom of page " + n).toBeGreaterThan(0.75);
      }
    },
  );
}

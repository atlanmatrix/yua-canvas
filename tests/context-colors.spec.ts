import { downloadSelectionMenu } from "./helpers";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
const palette = [
  ["白色", "#ffffff"],
  ["浅粉", "#ffe4e6"],
  ["浅橙", "#ffedd5"],
  ["浅黄", "#fef9c3"],
  ["浅绿", "#dcfce7"],
  ["浅蓝", "#dbeafe"],
  ["浅紫", "#ede9fe"],
];
const raw = Buffer.concat([
  Buffer.from([255, 254]),
  Buffer.from("原始文件\r\n", "utf16le"),
]);
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
async function setup(page: Page) {
  await page.goto("/");
  const note = (
    id: string,
    kind: string,
    x: number,
    y: number,
    width = 240,
    height = 180,
  ) => ({
    id,
    kind,
    title: id,
    text: kind === "text" ? id : "",
    x,
    y,
    width,
    height,
    color: "#ffffff",
    group: "g",
  });
  const cards = [
    note("普通文本", "text", 80, 130, 220, 100),
    {
      ...note("配置.env", "file", 480, 130, 240, 230),
      blob: "data:text/plain;base64," + raw.toString("base64"),
    },
    {
      ...note("图片.png", "image", 80, 430, 220, 140),
      blob: "data:image/png;base64," + pixel,
    },
    {
      ...note("任务", "todo", 480, 430, 260, 190),
      tasks: [{ id: "t", text: "待办事项", done: false }],
    },
    {
      ...note("链接", "text", 830, 130, 260, 100),
      text: "https://example.com/canvas",
    },
    {
      ...note("附件.bin", "file", 830, 450, 260, 180),
      blob: "data:application/octet-stream;base64,AQID",
    },
  ];
  await page.getByTestId("import").setInputFiles({
    name: "colors.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards,
        groups: [
          {
            id: "g",
            name: "背景组",
            bounds: { x: 30, y: 60, width: 1100, height: 600 },
          },
          {
            id: "child",
            name: "子分组",
            parent: "g",
            bounds: { x: 800, y: 310, width: 280, height: 120 },
          },
        ],
        connections: [
          {
            id: "c",
            from: { card: "普通文本", side: "e" },
            to: { card: "配置.env", side: "w" },
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(6);
  await page.getByRole("button", { name: "关闭提示" }).click();
}
const card = (page: Page, id: string) =>
  page.locator(`.card[data-card-id="${id}"]`);
async function menu(page: Page, target: Locator) {
  await target.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
}
async function color(page: Page, target: Locator, name: string) {
  await menu(page, target);
  await page
    .getByRole("menuitemradio", { name: `背景色：${name}`, exact: true })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}
async function bytes(page: Page, action: string, rightMenu = false) {
  const pending = page.waitForEvent("download");
  if (action === "批量下载") await downloadSelectionMenu(page);
  else
    await page
      .getByRole(rightMenu ? "menuitem" : "button", {
        name: action,
        exact: true,
      })
      .click();
  const file = await pending,
    stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return { name: file.suggestedFilename(), data: Buffer.concat(chunks) };
}
function rgb(hex: string) {
  return `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
}

test("text menus copy, download and open the clicked text; file menus download original bytes and names", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  const note = card(page, "普通文本");
  await page.keyboard.press("ControlOrMeta+a");
  await menu(page, note);
  await page.getByRole("menuitem", { name: "复制", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已复制");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "普通文本",
  );
  await page.keyboard.press("Escape");
  await menu(page, note);
  const text = await bytes(page, "下载", true);
  expect(text.name).toMatch(/^\d{4}-\d{2}-\d{2}_.*\.txt$/);
  expect(text.data.toString()).toBe("普通文本");
  await menu(page, note);
  await page.getByRole("menuitem", { name: "打开", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "文本内容" })).toHaveValue(
    "普通文本",
  );
  await page.keyboard.press("Escape");
  await menu(page, card(page, "配置.env"));
  const file = await bytes(page, "下载", true);
  expect(file.name).toBe("配置.env");
  expect(file.data).toEqual(raw);
  await menu(page, card(page, "图片.png"));
  const image = await bytes(page, "下载", true);
  expect(image.name).toBe("图片.png");
  expect(image.data).toEqual(Buffer.from(pixel, "base64"));
  await context.route("https://example.com/**", (route) =>
    route.fulfill({ body: "<title>Opened</title>", contentType: "text/html" }),
  );
  await menu(page, card(page, "链接"));
  const pending = context.waitForEvent("page");
  await page.getByRole("menuitem", { name: "打开", exact: true }).click();
  const tab = await pending;
  await tab.waitForLoadState();
  expect(tab.url()).toBe("https://example.com/canvas");
  expect(await tab.evaluate(() => window.opener)).toBeNull();
  await tab.close();
});

test("seven horizontal pastel choices color every card type and groups, preserve edges, undo and round-trip through JSON and ZIP", async ({
  page,
}) => {
  await setup(page);
  const ids = ["普通文本", "配置.env", "图片.png", "任务", "链接", "附件.bin"];
  await menu(page, card(page, ids[0]));
  const swatches = page.getByRole("menuitemradio");
  await expect(swatches).toHaveCount(7);
  const boxes = await swatches.evaluateAll((els) =>
    els.map((el) => ({
      x: el.getBoundingClientRect().x,
      y: el.getBoundingClientRect().y,
    })),
  );
  expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
  for (let i = 1; i < boxes.length; i++)
    expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x);
  await page.keyboard.press("Escape");
  for (const [index, id] of ids.entries()) {
    await color(page, card(page, id), palette[index + 1][0]);
    await expect(card(page, id)).toHaveCSS(
      "background-color",
      rgb(palette[index + 1][1]),
    );
    await expect(page.locator(`[data-minimap-card="${id}"] > rect`)).toHaveCSS(
      "fill",
      rgb(palette[index + 1][1]),
    );
  }
  const parent = page.locator('.group-boundary[data-group-id="g"]');
  await color(
    page,
    page.getByRole("button", { name: "拖动分组 背景组", exact: true }),
    "浅绿",
  );
  await expect(parent).toHaveCSS("background-color", rgb(palette[4][1]));
  expect(
    await parent.evaluate(
      (el) => getComputedStyle(el, "::before").backgroundColor,
    ),
  ).toBe(rgb(palette[4][1]));
  await expect(card(page, ids[0])).toHaveCSS(
    "background-color",
    rgb(palette[1][1]),
  );
  const edgeIsVisible = () =>
    page.locator(".connection-hit").evaluate((el) => {
      const p = el as SVGPathElement,
        point = p
          .getPointAtLength(p.getTotalLength() / 2)
          .matrixTransform(p.getScreenCTM()!);
      return !!document
        .elementFromPoint(point.x, point.y)
        ?.closest("[data-connection-id]");
    });
  expect(await edgeIsVisible()).toBe(true);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(parent).not.toHaveCSS("background-color", rgb(palette[4][1]));
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(parent).toHaveCSS("background-color", rgb(palette[4][1]));
  await color(
    page,
    page.getByRole("button", { name: "拖动分组 子分组", exact: true }),
    "浅紫",
  );
  await expect(
    page.locator('.group-boundary[data-group-id="child"]'),
  ).toHaveCSS("background-color", rgb(palette[6][1]));
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(parent).toHaveCSS("background-color", rgb(palette[4][1]));
  for (const [index, id] of ids.entries())
    await expect(card(page, id)).toHaveCSS(
      "background-color",
      rgb(palette[index + 1][1]),
    );
  const json = JSON.parse((await bytes(page, "导出画布")).data.toString());
  expect(json.groups.find((g: any) => g.id === "g").color).toBe(palette[4][1]);
  await page
    .getByRole("button", { name: "拖动分组 背景组", exact: true })
    .click();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.getByTestId("card")).toHaveCount(12);
  await expect(page.locator(".group-boundary")).toHaveCount(4);
  const duplicated = JSON.parse(
    (await bytes(page, "导出画布")).data.toString(),
  );
  expect(
    duplicated.groups.filter((g: any) => g.color === palette[4][1]),
  ).toHaveLength(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(6);
  await page
    .getByRole("button", { name: "拖动分组 背景组", exact: true })
    .click();
  const archive = await bytes(page, "批量下载"),
    metadata = JSON.parse(
      strFromU8(unzipSync(archive.data)["yua-canvas.metadata.json"]),
    );
  expect(metadata.groups.map((g: any) => g.color)).toEqual([
    palette[4][1],
    palette[6][1],
  ]);
  await page.getByTestId("import").setInputFiles({
    name: "colors.zip",
    mimeType: "application/zip",
    buffer: archive.data,
  });
  await expect(page.getByTestId("card")).toHaveCount(12);
  await expect(page.locator(".group-boundary")).toHaveCount(4);
  const restored = JSON.parse((await bytes(page, "导出画布")).data.toString());
  expect(
    restored.groups.filter((g: any) => g.color === palette[6][1]),
  ).toHaveLength(2);
  for (const [index, id] of ids.entries())
    expect(
      restored.cards
        .filter((c: any) => c.title === id)
        .every((c: any) => c.color === palette[index + 1][1]),
    ).toBe(true);
});

test("palette keyboard navigation does not move elements and expanded menus stay inside the viewport", async ({
  page,
}) => {
  await setup(page);
  const note = card(page, "普通文本"),
    original = await note.evaluate((el) => (el as HTMLElement).style.cssText);
  await menu(page, note);
  await page.getByRole("menuitemradio", { name: "背景色：白色" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("menuitemradio", { name: "背景色：浅粉" }),
  ).toBeFocused();
  expect(await note.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
    original,
  );
  await page.keyboard.press("Enter");
  await expect(note).toHaveCSS("background-color", rgb(palette[1][1]));
  await page.keyboard.press("ControlOrMeta+z");
  await expect(note).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.setViewportSize({ width: 390, height: 844 });
  await note.evaluate((el) =>
    el.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: innerWidth - 1,
        clientY: innerHeight - 1,
      }),
    ),
  );
  const box = (await page.getByRole("menu").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(382);
  expect(box.y + box.height).toBeLessThanOrEqual(836);
  await expect(page.getByRole("menuitemradio")).toHaveCount(7);
  await page.screenshot({ path: "/tmp/yua-context-menu-mobile.png" });
});

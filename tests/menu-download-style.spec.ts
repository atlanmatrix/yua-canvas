import { test, expect, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
const note = (id: string, x: number, y: number, group?: string) => ({
  id,
  kind: "text",
  title: "",
  text: id,
  x,
  y,
  width: 180,
  height: 80,
  color: "#ffffff",
  group,
});
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
async function setup(page: Page) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "menu.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards: [
          { ...note("text", 80, 150, "inner"), pin: "第一项" },
          {
            ...note("file", 720, 150, "outer"),
            kind: "file",
            title: "original.bin",
            text: "",
            blob: "data:application/octet-stream;base64,AAEC/w==",
            pin: "第二项",
          },
          {
            ...note("image", 400, 150, "outer"),
            kind: "image",
            title: "pixel.png",
            text: "",
            blob: "data:image/png;base64," + pixel,
          },
          {
            ...note("todo", 80, 400, "outer"),
            kind: "todo",
            tasks: [{ id: "t", text: "完成", done: true }],
          },
          {
            ...note("child", 430, 400, "outer"),
            kind: "canvas",
            title: "子画布",
            text: "",
            canvas: {
              version: 1,
              id: "nested",
              cards: [
                {
                  ...note("nested-file", 80, 100),
                  kind: "file",
                  title: "nested.bin",
                  text: "",
                  blob: "data:application/octet-stream;base64,AQID",
                },
              ],
              groups: [],
            },
          },
          note("outside", 1200, 150),
        ],
        groups: [
          {
            id: "outer",
            name: "整组",
            bounds: { x: 40, y: 90, width: 1050, height: 600 },
          },
          {
            id: "inner",
            name: "子组",
            parent: "outer",
            bounds: { x: 60, y: 120, width: 220, height: 140 },
          },
        ],
        connections: [
          {
            id: "edge",
            from: { card: "text", side: "e" },
            to: { card: "file", side: "w" },
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(6);
}
async function zipFromMenu(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载", exact: true }).click();
  const d = await pending;
  expect(d.suggestedFilename()).toMatch(/\.zip$/);
  const stream = await d.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const files = unzipSync(Buffer.concat(chunks));
  return {
    files,
    meta: JSON.parse(strFromU8(files["yua-canvas.metadata.json"])),
  };
}
test("group menu ZIP includes all descendants, subcanvas attachments and links", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "拖动分组 整组", exact: true })
    .click({ button: "right", position: { x: 30, y: 10 } });
  const { files, meta } = await zipFromMenu(page);
  expect(meta.cards).toHaveLength(5);
  expect(meta.groups).toHaveLength(2);
  expect(meta.connections).toHaveLength(1);
  expect(meta.cards.some((c: any) => c.id === "outside")).toBe(false);
  const nested = meta.cards.find((c: any) => c.kind === "canvas").canvas
    .cards[0];
  expect([...files[nested.file]]).toEqual([1, 2, 3]);
  expect([...files[meta.cards.find((c: any) => c.id === "file").file]]).toEqual(
    [0, 1, 2, 255],
  );
  await expect(page.locator(".batch-download")).toHaveCount(0);
});
test("multi-selected component menu downloads whole selection rather than clicked item", async ({
  page,
}) => {
  await setup(page);
  await page
    .locator('[data-card-id="text"]')
    .click({ position: { x: 20, y: 20 } });
  await page
    .locator('[data-card-id="file"]')
    .click({ modifiers: ["Shift"], position: { x: 20, y: 20 } });
  await page
    .locator('[data-card-id="text"]')
    .click({ button: "right", position: { x: 20, y: 20 } });
  const { meta } = await zipFromMenu(page);
  expect(meta.cards.map((c: any) => c.id).sort()).toEqual(["file", "text"]);
  await expect(page.getByRole("button", { name: "批量下载" })).toHaveCount(0);
});
test("box selection survives right click on blank canvas and downloads every selected item", async ({
  page,
}) => {
  await setup(page);
  const world = await page.locator(".world").evaluate((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { x: m.e, y: m.f, z: m.a };
    }),
    r = await page.locator(".canvas").boundingBox();
  await page.mouse.move(
    r!.x + world.x + 30 * world.z,
    r!.y + world.y + 70 * world.z,
  );
  await page.mouse.down();
  await page.mouse.move(
    r!.x + world.x + 1080 * world.z,
    r!.y + world.y + 670 * world.z,
    { steps: 10 },
  );
  await page.mouse.up();
  const selected = await page
    .locator(".card.selected")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-card-id")));
  expect(selected.length).toBeGreaterThan(1);
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 10, y: 10 } });
  const { meta } = await zipFromMenu(page);
  expect(meta.cards.map((c: any) => c.id).sort()).toEqual(selected.sort());
});
test("Pin list is vertical, ordinary cards share file borders and shadows, curves are lighter gray", async ({
  page,
}) => {
  await setup(page);
  const rail = page.getByRole("navigation", { name: "Pin 定位" }),
    buttons = rail.getByRole("button"),
    first = await buttons.nth(0).boundingBox(),
    second = await buttons.nth(1).boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  expect(second!.x).toBeCloseTo(first!.x);
  const styles = await page
    .locator(".card:not(.card-canvas)")
    .evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return [s.border, s.boxShadow];
      }),
    );
  for (const style of styles) expect(style).toEqual(styles[0]);
  expect(styles[0][0]).toContain("rgb(207, 212, 223)");
  expect(styles[0][1]).not.toBe("none");
  await page.mouse.move(1200, 700);
  await expect(page.locator(".connection-path:not(.draft)")).toHaveCSS(
    "stroke",
    "rgb(209, 213, 219)",
  );
  await expect(
    page.locator("aside,.sidebar,.search,.batch-download"),
  ).toHaveCount(0);
});

test("Pin boxes fit their actual labels and share the right edge on desktop and mobile", async ({
  page,
}) => {
  await setup(page);
  const rail = page.getByRole("navigation", { name: "Pin 定位" });
  await rail.getByRole("button", { name: "第二项", exact: true }).dblclick();
  await page
    .getByRole("textbox", { name: "Pin 名称" })
    .fill("一个长度不同的 Pin 名称");
  await page.getByRole("textbox", { name: "Pin 名称" }).press("Enter");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await rail.getByRole("button").evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect(),
          css = getComputedStyle(element),
          canvas = document.createElement("canvas"),
          ctx = canvas.getContext("2d")!;
        ctx.font = css.font;
        return {
          x: box.x,
          right: box.right,
          width: box.width,
          expected:
            ctx.measureText(element.textContent!).width +
            parseFloat(css.paddingLeft) +
            parseFloat(css.paddingRight) +
            parseFloat(css.borderLeftWidth) +
            parseFloat(css.borderRightWidth),
        };
      }),
    );
    expect(boxes[0].width).toBeLessThan(boxes[1].width);
    expect(boxes[0].right).toBeCloseTo(boxes[1].right, 0);
    for (const box of boxes) expect(box.width).toBeCloseTo(box.expected, 0);
    const container = (await rail.boundingBox())!;
    expect(container.width).toBeCloseTo(
      Math.max(...boxes.map((box) => box.width)) + 6,
      0,
    );
    expect(container.x + container.width).toBeCloseTo(
      width - (width < 700 ? 12 : 20),
      0,
    );
  }
});

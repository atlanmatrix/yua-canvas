import { test, expect, type Page, type Locator } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture.mjs";
import { openSettings } from "./settings-helper.mjs";
const note = (id = "note") => ({
  id,
  kind: "text",
  title: "",
  text: "缩放与清晰度",
  x: 80,
  y: 120,
  width: 300,
  height: 150,
  color: "#ffffff",
  displayMode: "large",
});
async function seed(page: Page, cards: any[]) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "scaling.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, cards, groups: [] })),
  });
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
}
async function mode(page: Page, card: Locator, label: string) {
  await card.dispatchEvent("contextmenu", { clientX: 400, clientY: 220 });
  await page
    .getByRole("menuitemradio", { name: `显示模式：${label}`, exact: true })
    .click();
}
const logical = (card: Locator) =>
  card.evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    y: parseFloat((el as HTMLElement).style.top),
    width: parseFloat((el as HTMLElement).style.width),
    height: parseFloat((el as HTMLElement).style.height),
  }));
const visualFont = (el: Locator) =>
  el.evaluate((e) => {
    const frame = e.closest(".component-content")!,
      world = e.closest(".world")!;
    return (
      parseFloat(getComputedStyle(e).fontSize) *
      new DOMMatrix(getComputedStyle(frame).transform).a *
      new DOMMatrix(getComputedStyle(world).transform).a
    );
  });
for (const dpr of [1, 2])
  test.describe(`screen density ${dpr}`, () => {
    test.use({
      deviceScaleFactor: dpr,
      viewport: { width: 1440, height: 1000 },
    });
    test("double-click text retains its apparent font and frame when editing ends, including at zoom and with custom font sizes", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(
        page.getByRole("button", { name: "添加任务", exact: true }),
      ).toBeEnabled();
      await page.locator(".canvas").dblclick({ position: { x: 450, y: 300 } });
      const editor = page.getByRole("textbox", {
        name: "文本内容",
        exact: true,
      });
      await editor.fill("Retina 文字比例\n第二行保持一致");
      expect(
        await editor.evaluate(
          (el) =>
            new DOMMatrix(
              getComputedStyle(el.closest(".component-content")!).transform,
            ).a,
        ),
      ).toBeGreaterThanOrEqual(0.99);
      await page
        .getByRole("spinbutton", { name: "字号", exact: true })
        .fill("24");
      const card = page.locator(".card-text");
      const before = await visualFont(editor),
        frame = await logical(card);
      await editor.press("ControlOrMeta+Enter");
      await expect
        .poll(() => visualFont(card.locator(".note-body p")))
        .toBeCloseTo(before, 1);
      expect(await logical(card)).toEqual(frame);
      await page.getByRole("button", { name: "放大", exact: true }).click();
      await card.locator(".note-body").dblclick();
      const zoomed = await visualFont(editor);
      await page.mouse.click(25, 300);
      await expect(editor).toHaveCount(0);
      await expect
        .poll(() => visualFont(card.locator(".note-body p")))
        .toBeCloseTo(zoomed, 1);
    });
  });

test("medium frames preserve landscape and portrait proportions; PDF large is 150 percent and uses its page's real ratio", async ({
  page,
}) => {
  const pdf = {
    ...note("pdf"),
    kind: "file",
    title: "proportions.pdf",
    text: "",
    width: 360,
    height: 480,
    mime: "application/pdf",
    displayMode: "medium",
    blob: "data:application/pdf;base64," + pdfFixture().toString("base64"),
  };
  await seed(page, [
    { ...note("wide"), x: 600, width: 640, height: 160, displayMode: "medium" },
    pdf,
  ]);
  const wide = page.locator('[data-card-id="wide"]'),
    card = page.locator('[data-card-id="pdf"]');
  expect(
    (await logical(wide)).width / (await logical(wide)).height,
  ).toBeCloseTo(4, 5);
  await expect(card.locator('[data-pdf-page="1"]')).toHaveCount(1, {
    timeout: 20000,
  });
  await expect
    .poll(async () => {
      const r = await logical(card);
      return r.width / r.height;
    })
    .toBeCloseTo(2 / 3, 5);
  const medium = await logical(card);
  await mode(page, card, "大");
  const large = await logical(card);
  expect(large.width / medium.width).toBeCloseTo(1.5, 5);
  expect(large.height / medium.height).toBeCloseTo(1.5, 5);
  await mode(page, wide, "大");
  expect(
    (await logical(wide)).width / (await logical(wide)).height,
  ).toBeCloseTo(4, 5);
  await mode(page, card, "中");
  expect(await logical(card)).toEqual(medium);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect.poll(() => logical(card)).toEqual(medium);
});

test("Shift resizes corners and edges proportionally around their opposite anchors; normal dragging remains free and undo restores geometry", async ({
  page,
}) => {
  await seed(page, [note()]);
  const card = page.locator(".card-text");
  await card.click();
  const before = await logical(card);
  let handle = (await card.getByTestId("card-resize-se").boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + 90,
    handle.y + handle.height / 2 + 10,
    { steps: 6 },
  );
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const corner = await logical(card);
  expect(corner.width).toBeGreaterThan(before.width);
  expect(corner.width / corner.height).toBeCloseTo(
    before.width / before.height,
    4,
  );
  expect(corner.x).toBe(before.x);
  expect(corner.y).toBe(before.y);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await logical(card)).toEqual(before);
  await card.click();
  handle = (await card.getByTestId("card-resize-n").boundingBox())!;
  await page.mouse.move(handle.x + 25, handle.y + handle.height / 2);
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(handle.x + 25, handle.y + handle.height / 2 - 50, {
    steps: 6,
  });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const edge = await logical(card);
  expect(edge.width / edge.height).toBeCloseTo(before.width / before.height, 4);
  expect(edge.y + edge.height).toBeCloseTo(before.y + before.height, 3);
  expect(edge.x + edge.width / 2).toBeCloseTo(before.x + before.width / 2, 3);
  await page.keyboard.press("ControlOrMeta+z");
  await card.click();
  handle = (await card.getByTestId("card-resize-se").boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + 90,
    handle.y + handle.height / 2 + 5,
    { steps: 6 },
  );
  await page.mouse.up();
  const free = await logical(card);
  expect(free.width / free.height).toBeGreaterThan(2.2);
});

test.describe("PDF on Retina", () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 1440, height: 1000 } });
  test("jumping, bounded thumbnail rendering and camera zoom keep vector text sharp and page choice persisted", async ({
    page,
  }) => {
    await seed(page, [
      {
        ...note("pdf"),
        kind: "file",
        title: "pages.pdf",
        text: "",
        width: 360,
        height: 540,
        contentAspectRatio: 2 / 3,
        displayMode: "medium",
        mime: "application/pdf",
        blob:
          "data:application/pdf;base64," + pdfFixture(80).toString("base64"),
      },
    ]);
    const card = page.locator(".pdf-file-card"),
      canvas = card.locator(".pdf-preview > canvas");
    await expect(card.locator('[data-pdf-page="1"]')).toHaveCount(1, {
      timeout: 20000,
    });
    await card.click();
    const input = card.getByRole("textbox", { name: "PDF 页码", exact: true });
    await input.fill("2");
    await input.press("Enter");
    await expect(card.locator('[data-pdf-page="2"]')).toHaveCount(1);
    await input.fill("abc");
    await input.press("Tab");
    await expect(input).toHaveValue("2");
    await card.getByRole("button", { name: "显示缩略图", exact: true }).click();
    await expect(card.locator(".pdf-thumbnail img").first()).toBeVisible();
    expect(await card.locator(".pdf-thumbnail").count()).toBeLessThan(15);
    await card
      .locator(".pdf-thumbnails")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await card
      .getByRole("button", { name: "跳转到第 80 页", exact: true })
      .click();
    await expect(card.locator('[data-pdf-page="80"]')).toHaveCount(1, {
      timeout: 20000,
    });
    await card.getByRole("button", { name: "显示缩略图", exact: true }).click();
    const initial = await canvas.evaluate((el: HTMLCanvasElement) => el.width);
    await page.getByRole("button", { name: "放大", exact: true }).click();
    await page.getByRole("button", { name: "放大", exact: true }).click();
    await expect
      .poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.width), {
        timeout: 20000,
      })
      .toBeGreaterThan(initial);
    const density = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
      screenWidth: el.getBoundingClientRect().width,
      screenHeight: el.getBoundingClientRect().height,
      dpr: devicePixelRatio,
    }));
    expect(density.width).toBeGreaterThanOrEqual(
      density.screenWidth * density.dpr - 2,
    );
    expect(density.height).toBeGreaterThanOrEqual(
      density.screenHeight * density.dpr - 2,
    );
    await expect(
      page.locator('.save-indicator[data-state="已保存至本地"]'),
    ).toBeVisible();
    await page.reload();
    await expect(card.locator('[data-pdf-page="80"]')).toHaveCount(1, {
      timeout: 20000,
    });
    await openSettings(page);
    await page.screenshot({ path: "/tmp/yua-glass-pdf-retina.png" });
  });
});

test.describe("touch arcs", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1000, height: 820 },
  });
  test("four corner handles resize an auto-height note without moving the camera, and cancellation restores the previous frame", async ({
    page,
    context,
  }) => {
    await seed(page, [{ ...note(), textAutoHeight: true }]);
    const card = page.locator(".card-text");
    await card.tap();
    await expect(card.locator(".card-resize")).toHaveCount(4);
    const client = await context.newCDPSession(page);
    const camera = await page.locator(".world").getAttribute("style");
    const before = await logical(card),
      handle = (await card.getByTestId("card-resize-se").boundingBox())!;
    expect(handle.width).toBeGreaterThanOrEqual(43);
    const x = handle.x + handle.width / 2,
      y = handle.y + handle.height / 2;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 65, y: y + 40 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const after = await logical(card);
    expect(after.width).toBeGreaterThan(before.width + 30);
    expect(after.height).toBeGreaterThan(before.height + 20);
    expect(await page.locator(".world").getAttribute("style")).toEqual(camera);
    const next = (await card.getByTestId("card-resize-nw").boundingBox())!,
      nx = next.x + next.width / 2,
      ny = next.y + next.height / 2;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: nx, y: ny }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: nx - 40, y: ny - 20 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect.poll(() => logical(card)).toEqual(after);
    for (let i = 0; i < 5; i++)
      await page.getByRole("button", { name: "缩小", exact: true }).tap();
    await card.tap();
    const zoomHandle = (await card
      .getByTestId("card-resize-se")
      .boundingBox())!;
    expect(zoomHandle.width).toBeGreaterThanOrEqual(43);
    expect(zoomHandle.width).toBeLessThanOrEqual(45);
    const downloading = page.waitForEvent("download");
    await card.locator(".card-download").tap();
    await downloading;
    await page.screenshot({ path: "/tmp/yua-touch-corner-arcs.png" });
  });
});

test("PDF navigation in a read-only share stays local and leaves the downloaded snapshot unchanged", async ({
  page,
}) => {
  const snapshot = {
    version: 1,
    groups: [],
    cards: [
      {
        ...note("pdf"),
        kind: "file",
        title: "shared.pdf",
        text: "",
        mime: "application/pdf",
        pdfPage: 1,
        contentAspectRatio: 2 / 3,
        blob: "data:application/pdf;base64," + pdfFixture().toString("base64"),
      },
    ],
  };
  await page.route("**/api/shares/resolve", (route) =>
    route.fulfill({ json: { snapshot } }),
  );
  await page.goto("/#/s/" + "a".repeat(64));
  const card = page.locator(".share-card");
  await expect(card.locator('[data-pdf-page="1"]')).toHaveCount(1, {
    timeout: 20000,
  });
  await card.hover();
  await card.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(card.locator('[data-pdf-page="2"]')).toHaveCount(1);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载快照", exact: true }).click();
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).cards[0].pdfPage).toBe(1);
});

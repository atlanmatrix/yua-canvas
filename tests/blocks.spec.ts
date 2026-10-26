import { textWidth80 } from "./helpers";
import { test, expect, type Page, type Locator } from "@playwright/test";
async function point(page: Page, x: number, y: number) {
  return page.locator(".world").evaluate(
    (el, p) => {
      const m = new DOMMatrix(getComputedStyle(el).transform),
        r = el.parentElement!.getBoundingClientRect();
      return { x: r.left + m.e + p.x * m.a, y: r.top + m.f + p.y * m.d };
    },
    { x, y },
  );
}
async function move(page: Page, el: Locator, to: { x: number; y: number }) {
  const b = await el.boundingBox();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 18 });
  await page.mouse.up();
}
async function noOverlap(page: Page) {
  return page.getByTestId("card").evaluateAll((els) => {
    const boxes = els.map((el) => el.getBoundingClientRect());
    return boxes.every((a, i) =>
      boxes.every(
        (b, j) =>
          i === j ||
          a.right <= b.left + 0.5 ||
          b.right <= a.left + 0.5 ||
          a.bottom <= b.top + 0.5 ||
          b.bottom <= a.top + 0.5,
      ),
    );
  });
}
test("plain text pastes as a title-free 80-character block with persistent border resizing", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  const text = "文字与 spaces ".repeat(50) + "\n末行";
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press("ControlOrMeta+v");
  const card = page.getByTestId("card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".note-body")).toHaveText(text);
  await expect(card.locator(".card-top,footer")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const size = await card.evaluate((el) => ({
    width: parseFloat((el as HTMLElement).style.width),
    height: parseFloat((el as HTMLElement).style.height),
  }));
  expect(size.width).toBeLessThanOrEqual(await textWidth80(page));
  expect(size.height).toBeGreaterThan(48);
  const edge = await card.getByTestId("card-resize-e").boundingBox();
  await page.mouse.move(edge!.x + 4, edge!.y + edge!.height / 10);
  await page.mouse.down();
  await page.mouse.move(edge!.x - 116, edge!.y + edge!.height / 10, {
    steps: 10,
  });
  await page.mouse.up();
  const width = await card.evaluate((el) =>
    parseFloat((el as HTMLElement).style.width),
  );
  expect(width).toBeLessThan(size.width);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(card).toHaveCount(1);
  expect(
    await card.evaluate((el) => parseFloat((el as HTMLElement).style.width)),
  ).toBeCloseTo(width);
  await expect(card.locator(".note-body")).toHaveText(text);
});
test("pasted images retain aspect ratio without chrome and new copies may overlap without displacing originals", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 90;
    c.getContext("2d")!.fillRect(0, 0, 160, 90);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!)));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  });
  await page.keyboard.press("ControlOrMeta+v");
  const img = page.locator(".card-image");
  await expect(img).toHaveCount(1);
  await expect(img.locator(".card-top,footer,.attachment-title")).toHaveCount(
    0,
  );
  const ratio = () =>
    img.evaluate(
      (el) =>
        parseFloat((el as HTMLElement).style.width) /
        parseFloat((el as HTMLElement).style.height),
    );
  expect(await ratio()).toBeCloseTo(16 / 9, 5);
  const edge = await img.getByTestId("card-resize-se").boundingBox();
  await page.mouse.move(edge!.x + 6, edge!.y + 6);
  await page.mouse.down();
  await page.mouse.move(edge!.x + 66, edge!.y + 36, { steps: 8 });
  await page.mouse.up();
  expect(await ratio()).toBeCloseTo(16 / 9, 5);
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制图片");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(2);
  expect(await noOverlap(page)).toBe(false);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(
      (t) => navigator.clipboard.writeText(t),
      `外部文本 ${i}`,
    );
    await page.keyboard.press("ControlOrMeta+v");
    await expect(page.getByTestId("card")).toHaveCount(3 + i);
    expect(await noOverlap(page)).toBe(false);
  }
});
test("partially outside blocks expand a group; wholly outside leave and overlapping neighbours remain stationary", async ({
  page,
}) => {
  await page.goto("/");
  const make = (id: string, x: number, group?: string) => ({
    id,
    kind: "text",
    title: "",
    text: id,
    x,
    y: 100,
    width: 160,
    height: 80,
    color: "#fffdf5",
    group,
  });
  await page.getByTestId("import").setInputFiles({
    name: "board.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [
          {
            id: "g",
            name: "容器",
            bounds: { x: 80, y: 60, width: 220, height: 160 },
          },
        ],
        cards: [make("甲", 100, "g"), make("乙", 650), make("丙", 900)],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  const a = page.getByTestId("card").filter({ hasText: "甲" });
  await expect(a).toHaveCount(1);
  await move(page, a, await point(page, 280, 140));
  await expect(a).toHaveAttribute("data-group-name", "容器");
  const frame = page.locator(".group-boundary");
  const rect = await frame.evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    w: parseFloat((el as HTMLElement).style.width),
  }));
  expect(rect.x + rect.w).toBeGreaterThanOrEqual(360);
  await move(page, a, await point(page, 500, 140));
  await expect(a).toHaveAttribute("data-group-name", "");
  expect(await noOverlap(page)).toBe(true);
  await move(page, a, await point(page, 730, 140));
  expect(await noOverlap(page)).toBe(false);
  const ar = await a.evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    w: parseFloat((el as HTMLElement).style.width),
  }));
  expect(ar.x).toBeCloseTo(650, 0);
  const neighbour = await page
    .getByTestId("card")
    .filter({ hasText: "乙" })
    .evaluate((el) => parseFloat((el as HTMLElement).style.left));
  expect(neighbour).toBe(650);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(a).toHaveAttribute("data-group-name", "");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(a).toHaveAttribute("data-group-name", "容器");
  expect(await noOverlap(page)).toBe(true);
});

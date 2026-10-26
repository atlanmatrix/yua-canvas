import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "cursor.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [
          {
            id: "g",
            name: "分组",
            bounds: { x: 80, y: 70, width: 400, height: 300 },
          },
        ],
        cards: [
          {
            id: "a",
            kind: "text",
            text: "拖动卡片",
            title: "",
            x: 100,
            y: 130,
            width: 160,
            height: 80,
            group: "g",
            color: "#ffffff",
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(1);
}
const transform = (page: Page) =>
  page.locator(".world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, z: m.a };
  });
test("right-button zoom keeps grabbing cursor, pointer anchor and subsequent panning", async ({
  page,
}) => {
  await setup(page);
  const card = page.getByTestId("card"),
    b = await card.boundingBox(),
    geometry = await card.evaluate((el) => (el as HTMLElement).style.cssText);
  const x = b!.x + 60,
    y = b!.y + 40;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await expect(page.locator(".canvas")).toHaveCSS("cursor", "grabbing");
  await expect(card).toHaveCSS("cursor", "grabbing");
  const before = await transform(page),
    r = await page.locator(".canvas").boundingBox();
  const anchor = {
    x: (x - r!.x - before.x) / before.z,
    y: (y - r!.y - before.y) / before.z,
  };
  await page.mouse.wheel(0, -80);
  await expect
    .poll(async () => (await transform(page)).z)
    .toBeGreaterThan(before.z);
  const zoomed = await transform(page);
  expect((x - r!.x - zoomed.x) / zoomed.z).toBeCloseTo(anchor.x, 2);
  expect((y - r!.y - zoomed.y) / zoomed.z).toBeCloseTo(anchor.y, 2);
  await expect(card).toHaveCSS("cursor", "grabbing");
  await page.mouse.move(x + 35, y + 20, { steps: 6 });
  const moved = await transform(page);
  expect(moved.z).toBe(zoomed.z);
  expect(moved.x - zoomed.x).toBeCloseTo(35);
  expect(moved.y - zoomed.y).toBeCloseTo(20);
  expect(await card.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
    geometry,
  );
  await page.mouse.up({ button: "right" });
  await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.mouse.wheel(0, 40);
  await expect
    .poll(async () => (await transform(page)).y)
    .toBeCloseTo(moved.y - 40);
  expect((await transform(page)).z).toBe(moved.z);
});
test("card, group and toolbar drags use grabbing; release and lost focus restore the cursor", async ({
  page,
}) => {
  await setup(page);
  const card = page.getByTestId("card");
  await card.hover();
  await expect(card).toHaveCSS("cursor", "grab");
  const box = await card.boundingBox();
  await page.mouse.move(box!.x + 50, box!.y + 40);
  await page.mouse.down();
  await expect(card).toHaveCSS("cursor", "grabbing");
  await page.mouse.move(box!.x + 70, box!.y + 40, { steps: 4 });
  await page.mouse.up();
  await expect(card).toHaveCSS("cursor", "grab");
  const title = page.getByRole("button", { name: "拖动分组 分组" }),
    t = await title.boundingBox();
  await page.mouse.move(t!.x + 30, t!.y + 17);
  await page.mouse.down();
  await expect(title).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await expect(title).toHaveCSS("cursor", "grab");
  const tool = page.getByRole("button", { name: "添加笔记", exact: true }),
    u = await tool.boundingBox();
  await page.mouse.move(u!.x + 15, u!.y + 15);
  await page.mouse.down();
  await page.mouse.move(u!.x + 15, u!.y - 30);
  await expect(page.locator(".canvas")).toHaveCSS("cursor", "grabbing");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.mouse.move(box!.x + 50, box!.y + 40);
  await page.mouse.down({ button: "right" });
  await expect(page.locator(".app")).toHaveClass(/is-grabbing/);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
  await page.mouse.up({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
});

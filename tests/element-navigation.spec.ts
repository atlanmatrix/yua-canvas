import { test, expect, type Page } from "@playwright/test";

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
});
async function setup(page: Page) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "navigation.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          { ...note("origin", 400, 400), pin: "起点" },
          note("right", 800, 400),
          note("left", 100, 400),
          note("up", 400, 100),
          note("down", 400, 800),
          note("diagonal", 650, 650),
          note("far", 4200, 400),
          {
            ...note("child", 800, 100),
            kind: "canvas",
            title: "子画布",
            canvas: { version: 1, groups: [], cards: [] },
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
}
const card = (page: Page, id: string) => page.locator(`[data-card-id="${id}"]`);
const start = (page: Page) =>
  page
    .locator(".pin-bar")
    .getByRole("button", { name: "起点", exact: true })
    .click();
const geometry = (page: Page) =>
  page
    .getByTestId("card")
    .evaluateAll((elements) =>
      elements.map((el) => (el as HTMLElement).style.cssText),
    );

test("arrows activate after selection, follow adjacent elements and reveal distant ones without moving content", async ({
  page,
}) => {
  await setup(page);
  const original = await geometry(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".card.selected")).toHaveCount(0);
  for (const [key, target] of [
    ["ArrowRight", "right"],
    ["ArrowLeft", "left"],
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
  ]) {
    await start(page);
    await page.keyboard.press(key);
    await expect(card(page, target)).toHaveClass(/selected/);
    await expect(page.locator(".card.selected")).toHaveCount(1);
  }
  await start(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(card(page, "far")).toHaveClass(/selected/);
  const bounds = await card(page, "far").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(47);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1233);
  await page.keyboard.press("ArrowRight");
  await expect(card(page, "far")).toHaveClass(/selected/);
  expect(await geometry(page)).toEqual(original);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("text editing, menus, shift nudging and parent-child shortcuts retain their own keys", async ({
  page,
}) => {
  await setup(page);
  await start(page);
  await card(page, "origin").dblclick();
  const editor = page.getByRole("textbox", { name: "文本内容" });
  await editor.fill("abc");
  await page.keyboard.press("ArrowLeft");
  expect(
    await editor.evaluate((el: HTMLTextAreaElement) => el.selectionStart),
  ).toBe(2);
  await expect(card(page, "origin")).toHaveClass(/selected/);
  await page.keyboard.press("Escape");
  await start(page);
  await card(page, "origin").click({
    button: "right",
    position: { x: 30, y: 30 },
  });
  await page.getByRole("menuitemradio", { name: "背景色：白色" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("menuitemradio", { name: "背景色：浅粉" }),
  ).toBeFocused();
  await expect(card(page, "origin")).toHaveClass(/selected/);
  await page.keyboard.press("Escape");
  await start(page);
  await card(page, "origin").click({ position: { x: 30, y: 30 } });
  const x = await card(page, "origin").evaluate((el) =>
    parseFloat((el as HTMLElement).style.left),
  );
  await page.keyboard.press("Shift+ArrowRight");
  await expect(card(page, "origin")).toHaveCSS("left", `${x + 10}px`);
  await page.keyboard.press("ControlOrMeta+z");
  await start(page);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(card(page, "child")).toHaveClass(/selected/);
  await page.keyboard.press("Meta+ArrowDown");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await page.keyboard.press("Meta+ArrowUp");
  await expect(card(page, "child")).toBeVisible();
});

test("child canvas has an inset long-dashed border within its solid outline", async ({
  page,
}) => {
  await setup(page);
  const child = card(page, "child");
  await expect(child).toHaveCSS("border-top-style", "solid");
  await expect(child.locator(".canvas-card-inner-border rect")).toHaveCSS(
    "stroke-dasharray",
    "12px, 7px",
  );
  const borders = await child.evaluate((el) => {
    const outer = el.getBoundingClientRect(),
      inner = el
        .querySelector(".canvas-card-inner-border")!
        .getBoundingClientRect();
    return {
      inside:
        inner.left > outer.left &&
        inner.right < outer.right &&
        inner.top > outer.top &&
        inner.bottom < outer.bottom,
      interactive: getComputedStyle(
        el.querySelector(".canvas-card-inner-border")!,
      ).pointerEvents,
    };
  });
  expect(borders).toEqual({ inside: true, interactive: "none" });
  await expect(
    card(page, "origin").locator(".canvas-card-inner-border"),
  ).toHaveCount(0);
});

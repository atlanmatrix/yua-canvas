import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "hover.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          {
            id: "hover-card",
            kind: "text",
            title: "悬停卡片",
            text: "卡片操作与悬停效果",
            x: 250,
            y: 250,
            width: 420,
            height: 180,
            color: "#ffffff",
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.mouse.click(5, 150);
  const card = page.locator('[data-card-id="hover-card"]');
  await expect(card.locator(".card-toolbar")).toHaveCSS("opacity", "0");
  return card;
}

test("hover reveals controls without moving the card, and the toolbar gap remains interactive", async ({
  page,
}) => {
  const card = await setup(page);
  const toolbar = card.getByRole("toolbar", { name: "组件操作" });
  const before = await card.boundingBox();
  const restShadow = await card.evaluate(
    (el) => getComputedStyle(el).boxShadow,
  );
  await page.screenshot({ path: "work/card-default.png" });
  await card.hover();
  await expect(toolbar).toHaveCSS("opacity", "1");
  await expect
    .poll(() => card.evaluate((el) => getComputedStyle(el).boxShadow))
    .not.toBe(restShadow);
  expect(await card.boundingBox()).toEqual(before);
  const bounds = (await toolbar.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, before!.y + 4);
  await page.mouse.move(bounds.x + bounds.width / 2, before!.y - 4, {
    steps: 4,
  });
  await expect(toolbar).toHaveCSS("opacity", "1");
  await toolbar.hover();
  await expect(toolbar).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "work/card-hover.png" });
  const download = page.waitForEvent("download");
  await toolbar.getByRole("button", { name: "下载 悬停卡片" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.txt$/);
  await page.mouse.click(5, 150);
  await expect(toolbar).toHaveCSS("opacity", "0");
});

test("keyboard focus reveals controls and an open menu keeps elevation and actions visible", async ({
  page,
}) => {
  const card = await setup(page);
  const toolbar = card.locator(".card-toolbar");
  const more = card.getByRole("button", { name: "更多组件操作" });
  await more.focus();
  await expect(toolbar).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".context-menu").first()).toBeVisible();
  await page.mouse.move(5, 150);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await expect(toolbar).toHaveCSS("opacity", "1");
  await expect(card.locator(".port-e")).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await page.mouse.click(5, 150);
  await expect(toolbar).toHaveCSS("opacity", "0");
});

test("dark mode and reduced motion retain keyboard controls", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const card = await setup(page);
  await expect(card).toHaveCSS("border-top-color", "rgba(226, 232, 240, 0.1)");
  await expect(card).toHaveCSS("transition-duration", "0s");
  await card.getByRole("button", { name: "更多组件操作" }).focus();
  await expect(card.locator(".card-toolbar")).toHaveCSS("opacity", "1");
  await expect(card.locator(".card-toolbar")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(card.locator(".card-more")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.screenshot({ path: "work/card-hover-dark.png" });
});

test("touch users can access toolbar actions without hover", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await page.getByTestId("import").setInputFiles({
      name: "touch-hover.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          groups: [],
          cards: [
            {
              id: "touch-card",
              kind: "text",
              title: "触屏卡片",
              text: "触屏操作",
              x: 250,
              y: 250,
              width: 420,
              height: 180,
              color: "#ffffff",
            },
          ],
        }),
      ),
    });
    await page.getByRole("button", { name: "确认替换" }).tap();
    const card = page.locator('[data-card-id="touch-card"]');
    await expect(card.locator(".card-toolbar")).toHaveCSS("opacity", "1");
    const more = card.getByRole("button", { name: "更多组件操作" });
    await expect(more).toHaveCSS("width", "36px");
    await more.tap();
    await expect(more).toHaveAttribute("aria-expanded", "true");
  } finally {
    await context.close();
  }
});

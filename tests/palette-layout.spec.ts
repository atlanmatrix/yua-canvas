import { test, expect } from "@playwright/test";

test("component and Pin palettes keep wider spacing and all focus rings inside menus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "palette.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          {
            id: "note",
            kind: "text",
            title: "",
            text: "色板测试",
            x: 100,
            y: 140,
            width: 200,
            height: 100,
            color: "#ffffff",
            pin: "色板测试",
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  for (const width of [1280, 390, 210, 180]) {
    await page.setViewportSize({ width, height: 844 });
    for (const target of [
      page.locator('[data-card-id="note"]'),
      page.locator(".pin-bar button"),
    ]) {
      await target.evaluate((el) =>
        el.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: innerWidth - 1,
            clientY: innerHeight - 1,
          }),
        ),
      );
      const popup = page.getByRole("menu");
      await expect(popup).toBeVisible();
      const bounds = await popup.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(8);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 8);
      const layout = await popup.locator(".color-palette").evaluate((el) => {
        const menu = el.closest<HTMLElement>(".context-menu")!;
        const rect = menu.getBoundingClientRect();
        return {
          gap: parseFloat(getComputedStyle(el).gap),
          overflow: menu.scrollWidth > menu.clientWidth,
          options: Array.from(el.querySelectorAll("button"), (button) => {
            const b = button.getBoundingClientRect();
            return {
              diameter: b.width,
              fits:
                b.left - 5 >= rect.left &&
                b.right + 5 <= rect.right &&
                b.top - 5 >= rect.top &&
                b.bottom + 5 <= rect.bottom,
            };
          }),
        };
      });
      expect(layout.overflow).toBe(false);
      expect(layout.gap / layout.options[0].diameter).toBeCloseTo(1 / 3, 2);
      expect(layout.options.every((option) => option.fits)).toBe(true);
      const choices = popup.locator(".color-palette").getByRole("menuitemradio");
      await choices.last().click();
      await expect(choices.last()).toHaveAttribute("aria-checked", "true");
      await choices.first().click();
      await expect(choices.first()).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
    }
  }
});

test.describe("touch palette", () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 320, height: 640 } });

  test("all seven swatches stay circular on one row", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "添加任务", exact: true }).tap();
    await page.locator(".todo-editor input:not([type=checkbox])").first().fill("触屏色板");
    await page.keyboard.press("ControlOrMeta+Enter");
    await page.locator(".card-todo").click({ button: "right", position: { x: 40, y: 30 } });
    const swatches = page.locator(".color-palette").getByRole("menuitemradio");
    await expect(swatches).toHaveCount(7);
    const bounds = await swatches.evaluateAll((buttons) =>
      buttons.map((button) => {
        const { top, width, height } = button.getBoundingClientRect();
        return { top, width, height };
      }),
    );
    for (const swatch of bounds) {
      expect(swatch.width).toBeGreaterThanOrEqual(24);
      expect(swatch.height).toBe(swatch.width);
      expect(swatch.top).toBe(bounds[0].top);
    }
    await swatches.last().tap();
    await expect(swatches.last()).toHaveAttribute("aria-checked", "true");
    await swatches.first().tap();
    await expect(swatches.first()).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(swatches).toHaveCount(0);
  });
});

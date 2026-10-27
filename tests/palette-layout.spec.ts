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
      await popup.getByRole("menuitemradio").last().click();
      await expect(popup).toHaveCount(0);
    }
  }
});

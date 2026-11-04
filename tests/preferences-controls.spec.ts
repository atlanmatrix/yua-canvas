import { test, expect } from "@playwright/test";
test("preference sliders support pointer dragging, keyboard navigation, stored choices and system appearance without moving the canvas", async ({
  page,
}) => {
  await page.goto("/");
  const camera = () => page.locator(".world").getAttribute("style");
  const before = await camera();
  const language = page.getByRole("slider", { name: "语言", exact: true }),
    r = (await language.boundingBox())!;
  await page.mouse.move(r.x + 10, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width - 5, r.y + r.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("slider", { name: "Language", exact: true }),
  ).toHaveAttribute("aria-valuetext", "English");
  const appearance = page.getByRole("slider", {
    name: "Appearance",
    exact: true,
  });
  await appearance.press("Home");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await appearance.press("ArrowRight");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await camera()).toEqual(before);
  await page.reload();
  await expect(
    page.getByRole("slider", { name: "Appearance", exact: true }),
  ).toHaveValue("1");
  await page.emulateMedia({ colorScheme: "light" });
  await page
    .getByRole("slider", { name: "Appearance", exact: true })
    .press("End");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("slider", { name: "Language", exact: true })
    .press("Home");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});
test.describe("touch capsules", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test("touch sliders stay within the mobile viewport, open no dropdowns and preserve the canvas", async ({
    page,
  }) => {
    await page.goto("/");
    const before = await page.locator(".world").getAttribute("style");
    const language = page.getByRole("slider", { name: "语言", exact: true }),
      r = (await language.boundingBox())!;
    await page.touchscreen.tap(r.x + r.width - 8, r.y + r.height / 2);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const theme = page.getByRole("slider", { name: "Appearance", exact: true }),
      t = (await theme.boundingBox())!;
    await page.touchscreen.tap(t.x + t.width / 2, t.y + t.height / 2);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.locator(".world").getAttribute("style")).toEqual(before);
    const bounds = await page.locator(".floating-actions").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await expect(page.locator(".preferences-controls select")).toHaveCount(0);
    await page.screenshot({ path: "/tmp/yua-capsule-touch.png" });
  });
});

test("rounded submenus align the first choice with the trigger and remain inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.mouse.click(500, 220, { button: "right" });
  const trigger = page.getByRole("menuitem", { name: "新建", exact: true });
  await trigger.hover();
  const submenu = page.getByRole("menu", { name: "新建组件", exact: true });
  await expect(submenu).toBeVisible();
  const item = await submenu.getByRole("menuitem").first().boundingBox(),
    anchor = await trigger.boundingBox(),
    panel = await submenu.boundingBox();
  expect(item!.y).toBeCloseTo(anchor!.y, 0);
  expect(panel!.y).toBeGreaterThanOrEqual(8);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(892);
});

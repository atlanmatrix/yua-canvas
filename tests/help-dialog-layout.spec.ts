import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 640 },
]) {
  test(`help dialog keeps its heading and close button visible while content scrolls at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "使用说明", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "使用说明", exact: true });
    const heading = dialog.locator(".modal-heading");
    const close = dialog.getByRole("button", { name: "关闭使用说明" });
    const content = dialog.locator(".help-dialog-content");
    await expect(close).toBeFocused();
    const frame = await dialog.boundingBox();
    const headingFrame = await heading.boundingBox();
    const closeFrame = await close.boundingBox();
    expect(headingFrame!.y).toBeGreaterThan(frame!.y + 10);
    await content.hover();
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => content.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await content.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(content.locator("kbd").last()).toBeInViewport();
    expect(
      await dialog.evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(1);
    expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await dialog.boundingBox()).toEqual(frame);
    expect(await heading.boundingBox()).toEqual(headingFrame);
    expect(await close.boundingBox()).toEqual(closeFrame);
    await expect(heading).toBeInViewport();
    await expect(close).toBeInViewport();
    await close.click();
    await expect(dialog).toHaveCount(0);
  });
}

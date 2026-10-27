import { expect, type Page } from "@playwright/test";

export async function openTextEditor(page: Page) {
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("n");
  await expect(page.getByRole("textbox", { name: "文本内容" })).toBeVisible();
}
export async function textWidth80(page: Page) {
  return page.evaluate(() => {
    const element = document.createElement("span");
    element.style.cssText =
      "position:fixed;visibility:hidden;display:block;font:13px monospace;width:80ch;padding:0;border:0";
    document.body.append(element);
    const width = Math.ceil(element.getBoundingClientRect().width) + 26;
    element.remove();
    return width;
  });
}

export async function downloadSelectionMenu(page: Page) {
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 10, y: 10 } });
  await page.getByRole("menuitem", { name: "下载", exact: true }).click();
}

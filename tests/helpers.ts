import { expect, type Page } from "@playwright/test";

export async function openNoteEditor(page: Page) {
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("n");
  await expect(page.getByRole("textbox", { name: "笔记内容" })).toBeVisible();
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

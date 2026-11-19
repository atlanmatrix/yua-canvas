import { expect, test } from "@playwright/test";

test("hints clear on dismissal, creation tools form one tab stop and help returns focus", async ({
  page,
}) => {
  await page.goto("/");
  const settings = page.locator(".settings-trigger");
  await settings.hover();
  await expect(page.getByRole("tooltip")).toContainText("设置");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  const tools = page.locator(".toolbar button");
  await tools.first().focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tools.last()).toBeFocused();
  await expect(
    page
      .locator(".toolbar button")
      .evaluateAll(
        (buttons) =>
          buttons.filter(
            (button) => (button as HTMLButtonElement).tabIndex === 0,
          ).length,
      ),
  ).resolves.toBe(1);
  await page.keyboard.press("ArrowRight");
  await expect(tools.first()).toBeFocused();

  const help = page.getByRole("button", { name: "使用说明" });
  await help.click();
  const dialog = page.getByRole("dialog", { name: "使用说明" });
  for (const key of ["Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    await expect(dialog.locator(":focus")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
});

test("the full calculator keypad remains visible after evaluation in a default medium card", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 210, y: 120 } });
  await page.getByRole("menuitem", { name: "新建工具", exact: true }).hover();
  await page.getByRole("menuitem", { name: "计算器", exact: true }).click();
  const card = page.locator(".card-calculator");
  await expect(card).toHaveCSS("width", "268px");
  await expect(card).toHaveCSS("height", "380px");
  const display = card.getByRole("textbox");
  for (const expression of ["2+3", "6*7", "12/4"]) {
    await display.fill(expression);
    await display.press("Enter");
  }
  await expect(display).toHaveValue("3");
  await expect(card.locator(".calculator-keys button")).toHaveCount(20);
  const body = card.locator(".tool-body");
  expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(
    0,
  );
});

test("zoom steps, limits and sparse dots survive a reload", async ({
  page,
}) => {
  await page.goto("/");
  const minus = page.getByRole("button", { name: "缩小", exact: true });
  const plus = page.getByRole("button", { name: "放大", exact: true });
  const percentage = page.locator(".zoom-percentage");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await minus.click();
  await expect(percentage).toHaveText("80%");
  for (let i = 0; i < 4; i++) await minus.click();
  await expect(minus).toBeDisabled();
  await expect(percentage).toHaveText("10%");
  await expect(page.locator(".canvas")).toHaveCSS(
    "background-size",
    "4.8px 4.8px",
  );
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(percentage).toHaveText("10%");
  await percentage.click();
  for (let i = 0; i < 15; i++) await plus.click();
  await expect(percentage).toHaveText("400%");
  await expect(plus).toBeDisabled();
});

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

test("the calculator display stays fully visible and stable as history grows in a default medium card", async ({
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
  const body = card.locator(".tool-body");
  await display.focus();
  const initialHeight = await display.evaluate((el) => el.offsetHeight);
  for (const expression of ["2+3", "6*7", "12/4"]) {
    await display.fill(expression);
    await display.press("Enter");
    expect(await display.evaluate((el) => el.offsetHeight)).toBe(initialHeight);
  }
  await expect(display).toHaveValue("3");
  const focusClearance = await display.evaluate((el) => {
    const style = getComputedStyle(el);
    const ring =
      parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    const inputTop = el.getBoundingClientRect().top;
    const bodyTop = el.parentElement!.getBoundingClientRect().top;
    return inputTop - ring - bodyTop;
  });
  expect(focusClearance).toBeGreaterThanOrEqual(0);
  await expect(card.locator(".calculator-keys button")).toHaveCount(20);
  expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(
    0,
  );
});

test("calculator size presets align every row with the display and share calculations", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 210, y: 120 } });
  await page.getByRole("menuitem", { name: "新建工具", exact: true }).hover();
  await page.getByRole("menuitem", { name: "计算器", exact: true }).click();
  const card = page.locator(".card-calculator");
  const input = card.getByRole("textbox");
  const key = (name: string) => card.getByRole("button", { name, exact: true });
  const switchSize = async (size: string) => {
    await card.locator(".tool-heading").click({ button: "right" });
    await page
      .getByRole("menuitemradio", { name: `显示模式：${size}`, exact: true })
      .click();
  };
  const checkRows = async (columns: number) => {
    const display = (await input.boundingBox())!;
    const keys = card.locator(".calculator-keys button");
    await expect(keys).toHaveCount(columns * 5);
    for (let row = 0; row < 5; row++) {
      const first = (await keys.nth(row * columns).boundingBox())!;
      const last = (await keys.nth((row + 1) * columns - 1).boundingBox())!;
      expect(first.x).toBeCloseTo(display.x, 0);
      expect(last.x + last.width).toBeCloseTo(display.x + display.width, 0);
      expect(first.y).toBe(last.y);
    }
  };

  await checkRows(4);
  await input.fill("2+");
  await switchSize("大");
  await expect(card.locator(".tool-heading")).toContainText("科学计算器");
  await expect(input).toHaveValue("2+");
  await checkRows(6);
  for (const label of [
    "sin",
    "π",
    "÷",
    "2",
    ")",
    "+",
    "√",
    "9",
    ")",
    "+",
    "2",
    "xʸ",
    "3",
    "=",
  ])
    await key(label).click();
  await expect(input).toHaveValue("14");
  await switchSize("中");
  await checkRows(4);
  await expect(input).toHaveValue("14");
  await expect(card.locator(".calculator-history")).toContainText(
    "2+sin(π÷2)+sqrt(9)+2^3 = 14",
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

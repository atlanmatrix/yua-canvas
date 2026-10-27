import { test, expect, type Page } from "@playwright/test";
import { mockMiniature, SCENE } from "./miniature-fixture";

test.beforeEach(async ({ page }) => {
  await mockMiniature(page);
});

async function create(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "添加 miniature", exact: true })
    .click();
  await page.getByRole("button", { name: "使用示例场景" }).click();
  await page.getByRole("button", { name: "保存场景" }).click();
  await expect(page.locator(".miniature-cover")).toBeVisible();
  return page.locator(".card-miniature");
}

test("idle models hide their chrome; hover and selection reveal a dashed frame and labels below it", async ({
  page,
}) => {
  const card = await create(page);
  await expect(card.locator(".miniature-heading")).toHaveCount(0);
  await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(card).toHaveCSS("box-shadow", "none");
  await expect(card).toHaveCSS("border-style", "dashed");
  await expect(card.locator(".miniature-cover")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  const frame = (await card.boundingBox())!;
  const name = (await card.locator(".miniature-name").boundingBox())!;
  const link = (await card.locator(".miniature-url").boundingBox())!;
  expect(name.y).toBeGreaterThan(frame.y + frame.height);
  expect(link.y).toBeGreaterThanOrEqual(name.y + name.height);
  await expect(card.locator(".miniature-name")).toHaveCSS("font-size", "13px");
  await expect(card.locator(".miniature-name")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.locator(".canvas").click({ position: { x: 10, y: 100 } });
  await expect(card.locator(".miniature-labels")).toBeHidden();
  await expect(card.locator(".card-download")).toBeHidden();
  await expect(card.locator(".connection-port").first()).toBeHidden();
  await expect(card).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
  await expect(card.locator(".miniature-cover")).toBeVisible();
  await card.hover({ position: { x: 100, y: 100 } });
  await expect(card.locator(".miniature-labels")).toBeVisible();
  await card.click({ position: { x: 100, y: 100 } });
  await page.mouse.move(10, 100);
  await expect(card.locator(".miniature-labels")).toBeVisible();
  await expect(card.locator("iframe")).toHaveCount(0);
});

test("names and links edit inline with validation, cancel, blur save, undo and reload persistence", async ({
  page,
}) => {
  const card = await create(page);
  const originalTitle = await card.locator(".miniature-name").textContent();
  const originalBounds = await card.evaluate(
    (el) => (el as HTMLElement).style.cssText,
  );
  await card.locator(".miniature-name").dblclick();
  const name = page.getByRole("textbox", { name: "场景名称", exact: true });
  await name.fill("新的模型名称");
  await name.press("Enter");
  await expect(card.locator(".miniature-name")).toHaveText("新的模型名称");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card.locator(".miniature-name")).toHaveText(originalTitle!);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(card.locator(".miniature-name")).toHaveText("新的模型名称");
  await card.locator(".miniature-url").dblclick();
  const url = page.getByRole("textbox", { name: "场景链接", exact: true });
  await url.fill("javascript:alert(1)");
  await url.press("Enter");
  await expect(url).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("HTTP / HTTPS");
  await url.press("Escape");
  await expect(card.locator(".miniature-link")).toHaveAttribute("href", SCENE);
  await card.locator(".miniature-url").dblclick();
  const updated = SCENE + "?variant=updated";
  await url.fill(updated);
  await url.press("Enter");
  await expect(card.locator(".miniature-link")).toHaveAttribute(
    "href",
    updated,
  );
  await expect(card.locator(".miniature-cover")).toBeVisible();
  await expect(card.locator("iframe")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card.locator(".miniature-link")).toHaveAttribute("href", SCENE);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(card.locator(".miniature-link")).toHaveAttribute(
    "href",
    updated,
  );
  await expect(card.locator(".miniature-cover")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await card.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
    originalBounds,
  );
  await card.locator(".miniature-name").dblclick();
  await name.fill("失焦保存的名称");
  await page.locator(".canvas").click({ position: { x: 10, y: 100 } });
  await expect(card.locator(".miniature-name")).toHaveText("失焦保存的名称");
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
  await page.reload();
  await expect(card.locator(".miniature-name")).toHaveText("失焦保存的名称");
  await expect(card.locator(".miniature-link")).toHaveAttribute(
    "href",
    updated,
  );
  await expect(card.locator("iframe")).toHaveCount(0);
});

for (const modifier of ["Meta", "Control"] as const) {
  test(`${modifier} click opens the scene link while modifier dragging pans the canvas`, async ({
    page,
    context,
  }) => {
    const card = await create(page);
    const link = card.locator(".miniature-link");
    const geometry = await card.evaluate(
      (el) => (el as HTMLElement).style.cssText,
    );
    const world = page.locator(".world");
    const originalView = await world.evaluate(
      (el) => getComputedStyle(el).transform,
    );
    await context.route(SCENE + "**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<title>Scene link</title>",
      }),
    );
    await page.keyboard.down(modifier);
    await expect(link).toHaveCSS("text-decoration-line", "underline");
    await page.keyboard.up(modifier);
    const pending = context.waitForEvent("page");
    await link.click({ modifiers: [modifier] });
    const tab = await pending;
    await tab.waitForLoadState();
    expect(tab.url()).toBe(SCENE);
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    await tab.close();
    expect(await world.evaluate((el) => getComputedStyle(el).transform)).toBe(
      originalView,
    );
    await link.click();
    await expect(page.locator('.miniature[data-active="true"]')).toHaveCount(0);
    expect(context.pages()).toHaveLength(1);
    const bounds = (await link.boundingBox())!;
    await page.keyboard.down(modifier);
    await page.mouse.move(bounds.x + 20, bounds.y + 10);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 60, bounds.y + 30, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up(modifier);
    expect(
      await world.evaluate((el) => getComputedStyle(el).transform),
    ).not.toBe(originalView);
    expect(await card.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
      geometry,
    );
    expect(context.pages()).toHaveLength(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("undoing a move during interaction restores the view without leaving activation stuck", async ({
  page,
}) => {
  const card = await create(page);
  const original = (await card.boundingBox())!;
  await page.mouse.move(original.x + 100, original.y + 100);
  await page.mouse.down();
  await page.mouse.move(original.x + 130, original.y + 115, { steps: 6 });
  await page.mouse.up();
  await card
    .locator(".miniature-model")
    .dblclick({ position: { x: 100, y: 100 } });
  await page.frameLocator("iframe").getByRole("button").click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const source = "/src/storage.ts";
        const { readBoard } = await import(source);
        return (await readBoard())?.cards[0]?.miniatureView || "";
      }),
    )
    .toContain("view=rotated");
  await card.locator(".miniature-model").focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card.locator('.miniature[data-active="true"]')).toBeVisible();
  await expect(card.locator("iframe")).toHaveAttribute("src", /view=initial/);
  expect((await card.boundingBox())!.x).toBeCloseTo(original.x, 0);
  await page.locator(".canvas").click({ position: { x: 10, y: 100 } });
  await expect(card.locator("iframe")).toHaveCount(0);
  await card
    .locator(".miniature-model")
    .dblclick({ position: { x: 100, y: 100 } });
  await expect(card.locator('.miniature[data-active="true"]')).toBeVisible();
});

test("activating a second model closes the first, and labels count as outside the model", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "models.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [0, 1].map((i) => ({
          id: `model-${i}`,
          kind: "miniature",
          title: `模型 ${i}`,
          text: SCENE,
          x: 80 + i * 400,
          y: 100,
          width: 320,
          height: 260,
          color: "#ffffff",
        })),
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".miniature-cover")).toHaveCount(2);
  const first = page.locator('[data-card-id="model-0"]');
  const second = page.locator('[data-card-id="model-1"]');
  await first
    .locator(".miniature-model")
    .dblclick({ position: { x: 100, y: 100 } });
  await expect(first.locator('.miniature[data-active="true"]')).toBeVisible();
  await second
    .locator(".miniature-model")
    .dblclick({ position: { x: 100, y: 100 } });
  await expect(first.locator("iframe")).toHaveCount(0);
  await expect(second.locator('.miniature[data-active="true"]')).toBeVisible();
  await second.locator(".miniature-name").click();
  await expect(second.locator("iframe")).toHaveCount(0);
  await expect(second.locator(".miniature-cover")).toBeVisible();
  await second.locator(".miniature-model").focus();
  await page.keyboard.press("Enter");
  await expect(second.locator('.miniature[data-active="true"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(second.locator("iframe")).toHaveCount(0);
});

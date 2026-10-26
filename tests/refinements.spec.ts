import { test, expect, type Page, type Locator } from "@playwright/test";
async function load(page: Page, cards: unknown[], groups: unknown[] = []) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "refine.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, cards, groups })),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(cards.length);
}
const note = (id: string, x: number, y: number) => ({
  id,
  kind: "text",
  title: "",
  text: id,
  x,
  y,
  width: 150,
  height: 100,
  color: "#ffffff",
});
async function point(page: Page, x: number, y: number) {
  return page.locator(".world").evaluate(
    (el, p) => {
      const m = new DOMMatrix(getComputedStyle(el).transform),
        r = el.parentElement!.getBoundingClientRect();
      return { x: r.left + m.e + p.x * m.a, y: r.top + m.f + p.y * m.d };
    },
    { x, y },
  );
}
for (const direction of ["right", "left", "down", "up"]) {
  test(`dragging ${direction} allows overlap without moving neighbours and undoes in one step`, async ({
    page,
  }) => {
    const horizontal = direction === "right" || direction === "left",
      positive = direction === "right" || direction === "down";
    const a = positive ? 100 : 700,
      b = positive ? 350 : 450,
      c = positive ? 550 : 250,
      target = positive ? 350 : 450;
    await load(
      page,
      horizontal
        ? [note("主动", a, 150), note("邻居", b, 150), note("后续", c, 150)]
        : [note("主动", 200, a), note("邻居", 200, b), note("后续", 200, c)],
    );
    const coords = () =>
      page.getByTestId("card").evaluateAll((els) =>
        els.map((el) => ({
          x: parseFloat((el as HTMLElement).style.left),
          y: parseFloat((el as HTMLElement).style.top),
          w: parseFloat((el as HTMLElement).style.width),
          h: parseFloat((el as HTMLElement).style.height),
        })),
      );
    const before = await coords(),
      card = page.getByTestId("card").first(),
      box = await card.boundingBox(),
      to = await point(
        page,
        horizontal ? target + 75 : 275,
        horizontal ? 200 : target + 50,
      );
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 18 });
    await page.mouse.up();
    const after = await coords();
    expect(horizontal ? after[0].x : after[0].y).toBeCloseTo(target, 0);
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(after[0].x).toBeCloseTo(after[1].x, 0);
    expect(after[0].y).toBeCloseTo(after[1].y, 0);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await coords()).toEqual(before);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect(await coords()).toEqual(after);
  });
}
test("env previews, 16px filenames/icons, invisible resize corners and unified group header", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.getByTestId("files").setInputFiles([
    {
      name: "agentos.env",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("APP_ENV=development\nPORT=3000\n"),
    },
    {
      name: ".env.local",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("FEATURE_ENABLED=true\n"),
    },
    {
      name: "说明.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# 内容\n预览正文"),
    },
  ]);
  await expect(page.getByTestId("card")).toHaveCount(3);
  await page.keyboard.press("1");
  const env = page.locator('.card[aria-label="agentos.env"]');
  await expect(env.locator(".file-content-thumbnail")).toContainText(
    "APP_ENV=development",
  );
  await expect(env.locator(".card-top")).toHaveCount(0);
  await expect(
    page.locator('.card[aria-label=".env.local"] .file-content-thumbnail'),
  ).toContainText("FEATURE_ENABLED=true");
  for (const title of await page.locator(".attachment-title").all()) {
    await expect(title).toHaveCSS("font-size", "16px");
    await expect(title.locator("svg")).toHaveCSS("width", "16px");
    await expect(title.locator("svg")).toHaveCSS("height", "16px");
  }
  await env.click();
  await expect(env.getByTestId("card-resize-se")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(env.getByTestId("card-resize-se")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+g");
  await page.getByRole("textbox", { name: "分组名称" }).fill("统一标题");
  await page.getByRole("button", { name: "保存分组" }).click();
  await page.getByRole("button", { name: "适应所有内容" }).click();
  await expect(page.locator(".group-title")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".group-fit")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.getByTestId("resize-se")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  expect(
    await page
      .locator(".group-boundary")
      .evaluate((el) => getComputedStyle(el, "::before").backgroundColor),
  ).toBe("rgb(239, 246, 255)");
  await page.screenshot({ path: "/tmp/yua-refined-cards.png" });
});

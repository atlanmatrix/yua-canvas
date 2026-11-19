import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.goto("/");
  const base = {
    title: "",
    text: "",
    color: "#ffffff",
    width: 210,
    height: 160,
  };
  await page.getByTestId("import").setInputFiles({
    name: "selection.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [
          {
            id: "g",
            name: "资料",
            bounds: { x: 30, y: 400, width: 1000, height: 280 },
          },
        ],
        cards: [
          {
            ...base,
            id: "text",
            kind: "text",
            text: "普通文本",
            x: 60,
            y: 120,
          },
          {
            ...base,
            id: "file",
            kind: "file",
            title: "file.txt",
            blob: "data:text/plain;base64,SGVsbG8=",
            x: 300,
            y: 120,
          },
          {
            ...base,
            id: "image",
            kind: "image",
            title: "pixel.png",
            blob: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
            x: 540,
            y: 120,
          },
          {
            ...base,
            id: "todo",
            kind: "todo",
            tasks: [{ id: "task", text: "待办", done: false }],
            x: 780,
            y: 120,
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
}
const card = (page: Page, id: string) =>
  page.locator(`.card[data-card-id="${id}"]`);
const selection = (page: Page) =>
  page
    .locator(".card.selected")
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-card-id")).sort(),
    );
const view = (page: Page) =>
  page.locator(".world").evaluate((el) => getComputedStyle(el).transform);
for (const modifier of ["Meta", "Control"] as const) {
  test(`${modifier} click toggles multi-selection across card types and coexists with panning and cancellation`, async ({
    page,
  }) => {
    await setup(page);
    const geometry = await page
      .locator(".card,.group-boundary")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.cssText));
    const originalView = await view(page);
    const click = async (
      id: string,
      mods: [typeof modifier] | ["Shift"] = [modifier],
    ) => card(page, id).click({ modifiers: mods, position: { x: 55, y: 100 } });
    await click("text");
    expect(await selection(page)).toEqual(["text"]);
    await click("file");
    await click("image");
    await click("todo");
    expect(await selection(page)).toEqual(["file", "image", "text", "todo"]);
    await expect(page.getByRole("button", { name: "批量下载" })).toHaveCount(0);
    await click("file");
    expect(await selection(page)).toEqual(["image", "text", "todo"]);
    await click("image", ["Shift"]);
    expect(await selection(page)).toEqual(["text", "todo"]);
    await click("todo");
    await click("text");
    expect(await selection(page)).toEqual([]);
    await expect(page.locator(".selection-bar")).toHaveCount(0);
    expect(await view(page)).toBe(originalView);
    expect(
      await page
        .locator(".card,.group-boundary")
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).style.cssText),
        ),
    ).toEqual(geometry);
    // Migrated canvases participate in the same modifier-click selection as other cards.
    await page
      .locator('[data-card-id="g"]')
      .click({ position: { x: 16, y: 16 } });
    await click("text");
    expect(await selection(page)).toEqual(["g", "text"]);
    await card(page, "g").click({
      modifiers: [modifier],
      position: { x: 16, y: 16 },
    });
    expect(await selection(page)).toEqual(["text"]);
    const b = (await card(page, "file").boundingBox())!;
    const x = b.x + 55,
      y = b.y + 100;
    await page.keyboard.down(modifier);
    // Small click jitter must not shift the view or turn into a pan.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 1, y + 1);
    expect(await selection(page)).toEqual(["text"]);
    await page.mouse.up();
    expect(await selection(page)).toEqual(["file", "text"]);
    expect(await view(page)).toBe(originalView);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 24, y + 16, { steps: 5 });
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.up();
    expect(await selection(page)).toEqual(["file", "text"]);
    expect(await view(page)).toBe(originalView);
    // Cancel and loss of focus must not toggle the pending card.
    await page.mouse.down();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await selection(page)).toEqual([]);
    await page.mouse.down();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    expect(await selection(page)).toEqual([]);
    await page.mouse.down();
    await page
      .locator(".canvas")
      .dispatchEvent("pointercancel", { pointerId: 1, clientX: x, clientY: y });
    await page.mouse.up();
    expect(await selection(page)).toEqual([]);
    await page.keyboard.up(modifier);
    await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
    // Space and the hand tool retain their explicit pan behavior.
    await page.keyboard.down("Space");
    await click("image");
    await page.keyboard.up("Space");
    expect(await selection(page)).toEqual([]);
    await page.keyboard.press("h");
    await click("image");
    expect(await selection(page)).toEqual([]);
  });
}

test("marquee keeps its canvas anchor and follows the pointer through pan and zoom", async ({
  page,
}) => {
  await setup(page);
  const file = card(page, "file");
  const box = (await file.boundingBox())!;
  const x = Math.round(box.x + 30);
  const y = Math.round(box.y - 25);
  const marquee = page.locator(".marquee");
  async function expectTip(px: number, py: number) {
    await expect
      .poll(async () => {
        const rect = await marquee.boundingBox();
        if (!rect) return Infinity;
        return Math.max(
          Math.abs(rect.x + rect.width - px),
          Math.abs(rect.y + rect.height - py),
        );
      })
      .toBeLessThan(1);
  }

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.wheel(15, 50);
  await expect(file).toHaveClass(/selected/);
  await expectTip(x, y);
  const anchor = (await marquee.boundingBox())!;
  expect(anchor.x).toBeCloseTo(x - 15, 0);
  expect(anchor.y).toBeCloseTo(y - 50, 0);

  for (const delta of [-60, 90]) {
    const before = await view(page);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, delta);
    await page.keyboard.up("Control");
    await expect.poll(() => view(page)).not.toBe(before);
    await expectTip(x, y);
    await page.mouse.move(x + 20, y + 15);
    await expectTip(x + 20, y + 15);
    await page.mouse.move(x, y);
  }

  await page.mouse.wheel(0, -35);
  await expect(file).not.toHaveClass(/selected/);
  await expectTip(x, y);
  await page.mouse.up();
  await expect(marquee).toHaveCount(0);
  await expect(file).not.toHaveClass(/selected/);
});

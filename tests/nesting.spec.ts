import { test, expect, type Page } from "@playwright/test";
async function load(page: Page, groups: unknown[], cards: unknown[]) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "nested.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, groups, cards })),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".group-boundary")).toHaveCount(groups.length);
}
const frame = (page: Page, id: string) =>
  page.locator(`.group-boundary[data-group-id="${id}"]`);
async function world(page: Page) {
  return page.locator(".world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { z: m.a };
  });
}
async function dragTitle(page: Page, name: string, dx: number, dy: number) {
  const title = page.getByRole("button", { name: `拖动分组 ${name}` }),
    b = await title.boundingBox();
  await page.mouse.move(b!.x + 30, b!.y + b!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + 30 + dx, b!.y + b!.height / 2 + dy, {
    steps: 10,
  });
  await page.mouse.up();
}
const note = (id: string, x: number, y: number, group?: string) => ({
  id,
  kind: "text",
  text: id,
  title: "",
  x,
  y,
  group,
  color: "#fffdf5",
});
async function backup(page: Page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布" }).click();
  const d = await event,
    stream = await d.createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  return Buffer.concat(chunks);
}
test("partially overlapping child groups retain parent and descendants follow drags", async ({
  page,
}) => {
  await load(
    page,
    [
      {
        id: "p",
        name: "父组",
        bounds: { x: 0, y: 0, width: 700, height: 650 },
      },
      {
        id: "c",
        name: "子组",
        bounds: { x: 50, y: 80, width: 450, height: 450 },
      },
      {
        id: "g",
        name: "孙组",
        bounds: { x: 80, y: 140, width: 280, height: 300 },
      },
    ],
    [note("nested", 100, 180, "g"), note("anchor", 850, 500)],
  );
  await expect(frame(page, "c")).toHaveAttribute("data-parent", "p");
  await expect(frame(page, "g")).toHaveAttribute("data-parent", "c");
  const z = (await world(page)).z;
  const positions = () =>
    page.locator(".group-boundary,.card").evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute("data-group-id") || el.textContent,
        x: parseFloat((el as HTMLElement).style.left),
        y: parseFloat((el as HTMLElement).style.top),
      })),
    );
  const before = await positions();
  await dragTitle(page, "子组", 300 * z, 0);
  await expect(frame(page, "c")).toHaveAttribute("data-parent", "p");
  await expect(frame(page, "g")).toHaveAttribute("data-parent", "c");
  let after = await positions();
  expect(
    after.find((v) => v.id === "c")!.x - before.find((v) => v.id === "c")!.x,
  ).toBeCloseTo(300);
  expect(
    after.find((v) => v.id === "g")!.x - before.find((v) => v.id === "g")!.x,
  ).toBeCloseTo(300);
  expect(after.find((v) => v.id === "p")!.x).toBe(
    before.find((v) => v.id === "p")!.x,
  );
  await dragTitle(page, "子组", -300 * z, 0);
  await expect(frame(page, "c")).toHaveAttribute("data-parent", "p");
  const nestedBefore = await page
    .getByTestId("card")
    .filter({ hasText: "nested" })
    .boundingBox();
  await dragTitle(page, "父组", 20, 15);
  const nestedAfter = await page
    .getByTestId("card")
    .filter({ hasText: "nested" })
    .boundingBox();
  expect(nestedAfter!.x - nestedBefore!.x).toBeCloseTo(20);
  expect(nestedAfter!.y - nestedBefore!.y).toBeCloseTo(15);
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(frame(page, "g")).toHaveAttribute("data-parent", "c");
  await expect(frame(page, "c")).toHaveAttribute("data-parent", "p");
  const bytes = await backup(page);
  expect(
    JSON.parse(bytes.toString()).groups.find(
      (g: { id: string }) => g.id === "g",
    ).parent,
  ).toBe("c");
  await page.getByTestId("import").setInputFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(frame(page, "g")).toHaveAttribute("data-parent", "c");
});
test("fit button sizes the frame around cards and child frames, without moving contents", async ({
  page,
}) => {
  await load(
    page,
    [
      {
        id: "p",
        name: "父组",
        bounds: { x: 0, y: 0, width: 700, height: 650 },
      },
      {
        id: "c",
        name: "子组",
        bounds: { x: 50, y: 80, width: 450, height: 450 },
      },
    ],
    [note("inside", 100, 180, "c"), note("outside", 1000, 500)],
  );
  const cards = () =>
    page
      .getByTestId("card")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.cssText));
  const before = await cards();
  await page.getByRole("button", { name: "自适应分组 子组" }).click();
  const bounds = (id: string) =>
    frame(page, id).evaluate((el) => {
      const s = (el as HTMLElement).style;
      return {
        x: parseFloat(s.left),
        y: parseFloat(s.top),
        width: parseFloat(s.width),
        height: parseFloat(s.height),
      };
    });
  expect(await bounds("c")).toEqual({ x: 80, y: 135, width: 280, height: 315 });
  expect(await cards()).toEqual(before);
  await page.getByRole("button", { name: "自适应分组 父组" }).click();
  expect(await bounds("p")).toEqual({ x: 60, y: 90, width: 320, height: 380 });
  expect(await cards()).toEqual(before);
  await expect(frame(page, "c")).toHaveAttribute("data-parent", "p");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  expect(await bounds("p")).toEqual({ x: 60, y: 90, width: 320, height: 380 });
});
test("equal frames never create a parent cycle", async ({ page }) => {
  await load(
    page,
    [
      { id: "a", name: "甲", bounds: { x: 0, y: 0, width: 400, height: 400 } },
      { id: "b", name: "乙", bounds: { x: 0, y: 0, width: 400, height: 400 } },
    ],
    [note("anchor", 500, 500)],
  );
  await expect(frame(page, "a")).toHaveAttribute("data-parent", "");
  await expect(frame(page, "b")).toHaveAttribute("data-parent", "");
});

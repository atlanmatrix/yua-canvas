import { openTextEditor } from "./helpers";
import { test, expect, type Page } from "@playwright/test";

async function rectangles(page: Page) {
  return page.getByTestId("card").evaluateAll((els) =>
    els.map((el) => {
      const { left, top, width, height } = (el as HTMLElement).style;
      return {
        x: +parseFloat(left),
        y: +parseFloat(top),
        width: +parseFloat(width),
        height: +parseFloat(height),
      };
    }),
  );
}

test("overlapping imports, creation, resizing and duplication preserve all other positions", async ({
  page,
}) => {
  await page.goto("/");
  const cards = [
    {
      id: "a",
      kind: "text",
      title: "",
      text: "底层",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      color: "#ffffff",
    },
    {
      id: "b",
      kind: "text",
      title: "",
      text: "上层",
      x: 140,
      y: 120,
      width: 200,
      height: 100,
      color: "#ffffff",
    },
  ];
  await page.getByTestId("import").setInputFiles({
    name: "overlapping.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, cards, groups: [] })),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
  const original = cards.map(({ x, y, width, height }) => ({
    x,
    y,
    width,
    height,
  }));
  expect(await rectangles(page)).toEqual(original);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(2);
  expect(await rectangles(page)).toEqual(original);

  const upper = page.getByTestId("card").last();
  await upper.click();
  const handle = await upper.getByTestId("card-resize-se").boundingBox();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle!.x + handle!.width / 2 + 60,
    handle!.y + handle!.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  const resized = await rectangles(page);
  expect(resized[0]).toEqual(original[0]);
  expect(resized[1].width).toBeGreaterThan(original[1].width);
  expect(resized[1].height).toBeGreaterThan(original[1].height);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await rectangles(page)).toEqual(original);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await rectangles(page)).toEqual(resized);

  for (const text of ["新建一", "新建二"]) {
    await openTextEditor(page);
    await page.getByRole("textbox", { name: "文本内容" }).fill(text);
    await page.keyboard.press("ControlOrMeta+Enter");
  }
  const created = await rectangles(page);
  expect(created.slice(0, 2)).toEqual(resized);
  expect(created[2]).toEqual(created[3]);
  await page.getByTestId("card").last().click();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.getByTestId("card")).toHaveCount(5);
  const duplicated = await rectangles(page);
  expect(duplicated.slice(0, 4)).toEqual(created);
  expect(duplicated[4]).toEqual({
    ...created[3],
    x: created[3].x + 30,
    y: created[3].y + 30,
  });
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(5);
  expect(await rectangles(page)).toEqual(duplicated);
});

import { test, expect, type Page } from "@playwright/test";
async function view(page: Page) {
  return page.locator(".world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, z: m.a };
  });
}
async function saved(page: Page) {
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
}

test("zoom and pan are saved without editing cards and restored on reload or a new tab", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await saved(page);
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记内容" }).fill("位置保持不变");
  await page.getByRole("button", { name: "保存笔记" }).click();
  const cardPosition = () =>
    page
      .getByTestId("card")
      .evaluate((el) => ({
        x: (el as HTMLElement).style.left,
        y: (el as HTMLElement).style.top,
      }));
  const original = await cardPosition();
  await page.mouse.move(800, 400);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(850, 440, { steps: 8 });
  await page.mouse.wheel(0, -45);
  await page.mouse.up({ button: "right" });
  await page.mouse.wheel(35, 80);
  await expect.poll(async () => (await view(page)).z).toBeGreaterThan(1);
  await saved(page);
  const before = await view(page);
  expect(before.x).not.toBe(65);
  expect(await cardPosition()).toEqual(original);
  await page.reload();
  await saved(page);
  await expect.poll(() => view(page)).toEqual(before);
  expect(await cardPosition()).toEqual(original);
  const tab = await context.newPage();
  await tab.goto("/");
  await saved(tab);
  await expect.poll(() => view(tab)).toEqual(before);
  await tab.close();
});

test("invalid stored viewport falls back safely without losing cards", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记内容" }).fill("保留数据");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await saved(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yua-canvas", 1);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("boards", "readwrite");
          tx.objectStore("boards").put(
            { x: Infinity, y: "bad", z: 99 },
            "view",
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await saved(page);
  expect(await view(page)).toEqual({ x: 65, y: 55, z: 1 });
  await expect(page.getByTestId("card")).toContainText("保留数据");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await saved(page);
  const expected = await view(page);
  await page.reload();
  await saved(page);
  expect(await view(page)).toEqual(expected);
});

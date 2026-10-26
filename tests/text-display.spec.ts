import { test, expect, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { textWidth80 } from "./helpers";

async function paste(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    document.querySelector(".canvas")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
  await expect(
    page.getByTestId("card").last().locator(".note-body"),
  ).toHaveText(text);
}
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
}
async function camera(page: Page) {
  return page
    .locator(".world")
    .evaluate((el) => getComputedStyle(el).transform);
}
async function download(page: Page, label: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("text wraps at 80 columns, adapts to content and only scrolls vertically beyond 20 rows", async ({
  page,
}) => {
  await ready(page);
  await paste(page, "A".repeat(161));
  const cards = page.getByTestId("card");
  expect(
    await cards
      .last()
      .evaluate((el) => parseFloat((el as HTMLElement).style.width)),
  ).toBe(await textWidth80(page));
  expect(
    await cards
      .last()
      .locator("p")
      .evaluate((el) => el.clientHeight),
  ).toBe(72);
  for (const lines of [1, 19, 20, 21]) {
    await paste(
      page,
      Array.from({ length: lines }, (_, i) => `第 ${i + 1} 行`).join("\n"),
    );
    const sizes = await cards
      .last()
      .locator(".note-body")
      .evaluate((el) => ({
        height: el.clientHeight,
        content: el.scrollHeight,
        width: el.clientWidth,
        contentWidth: el.scrollWidth,
      }));
    expect(
      await cards
        .last()
        .evaluate((el) => parseFloat((el as HTMLElement).style.height)),
    ).toBe(Math.min(lines, 20) * 24 + 26);
    expect(sizes.content > sizes.height).toBe(lines > 20);
    expect(sizes.contentWidth).toBeLessThanOrEqual(sizes.width);
  }
  const last = cards.last(),
    body = last.locator(".note-body"),
    before = await camera(page);
  const geometry = await last.evaluate(
    (el) => (el as HTMLElement).style.cssText,
  );
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.wheel(0, 120);
  await expect
    .poll(() => body.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await camera(page)).toBe(before);
  expect(await last.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
    geometry,
  );
  await body.evaluate((el) => {
    el.scrollTop = 0;
  });
  const gutter = await body.evaluate((el) => el.offsetWidth - el.clientWidth);
  if (gutter > 0) {
    await page.mouse.move(box.x + box.width - 3, box.y + 25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 3, box.y + 65, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() => body.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    expect(await last.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
      geometry,
    );
    expect(await camera(page)).toBe(before);
  }
  await last.dblclick({ position: { x: 100, y: 100 } });
  await page.getByRole("textbox", { name: "文本内容" }).fill("缩短后的内容");
  await page.keyboard.press("ControlOrMeta+Enter");
  expect(
    await last.evaluate((el) => parseFloat((el as HTMLElement).style.height)),
  ).toBe(50);
  expect(await body.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(
    true,
  );
});

test("scroll mode preserves original lines, fits short content and survives undo, copy, JSON and ZIP", async ({
  page,
}) => {
  await ready(page);
  const text = "https://example.com/" + "segment/".repeat(30);
  await paste(page, text);
  const card = page.getByTestId("card").first(),
    body = card.locator(".note-body");
  const wrapHeight = await card.evaluate((el) =>
    parseFloat((el as HTMLElement).style.height),
  );
  await card.hover();
  await card.getByRole("button", { name: "切换为滚动模式" }).click();
  await expect(body).toHaveClass(/text-scroll/);
  const sizes = await body.evaluate((el) => ({
    width: el.clientWidth,
    contentWidth: el.scrollWidth,
    height: el.clientHeight,
    contentHeight: el.scrollHeight,
  }));
  expect(sizes.contentWidth).toBeGreaterThan(sizes.width);
  expect(sizes.contentHeight).toBeLessThanOrEqual(sizes.height);
  expect(
    await card.evaluate((el) => parseFloat((el as HTMLElement).style.height)),
  ).toBeLessThan(wrapHeight);
  const before = await camera(page),
    box = (await body.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 25);
  await page.mouse.wheel(150, 0);
  await expect
    .poll(() => body.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  expect(await camera(page)).toBe(before);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(body).toHaveClass(/text-wrap/);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(body).toHaveClass(/text-scroll/);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(body).toHaveClass(/text-scroll/);
  await card.click({ position: { x: 100, y: 25 } });
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect(page.locator(".text-scroll")).toHaveCount(2);
  const json = JSON.parse((await download(page, "导出画布")).toString());
  expect(
    json.cards.every(
      (c: any) =>
        c.textMode === "scroll" && c.textAutoHeight && c.text === text,
    ),
  ).toBe(true);
  await page.keyboard.press("ControlOrMeta+a");
  const zip = await download(page, "批量下载"),
    files = unzipSync(zip);
  const metadata = JSON.parse(strFromU8(files["yua-canvas.metadata.json"]));
  expect(
    metadata.cards.every(
      (c: any) => c.textMode === "scroll" && c.textAutoHeight,
    ),
  ).toBe(true);
  await page.getByTestId("import").setInputFiles({
    name: "modes.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(page.locator(".text-scroll")).toHaveCount(4);
  await page.getByTestId("import").setInputFiles({
    name: "modes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect(page.locator(".text-scroll")).toHaveCount(2);
});

test("width resizing recalculates automatic height without vertical resize handles", async ({
  page,
}) => {
  await ready(page);
  await paste(page, "X".repeat(160));
  const card = page.getByTestId("card"),
    before = await card.evaluate((el) => ({
      width: parseFloat((el as HTMLElement).style.width),
      height: parseFloat((el as HTMLElement).style.height),
    }));
  await expect(card.getByTestId("card-resize-s")).toHaveCount(0);
  const handle = (await card.getByTestId("card-resize-e").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 300, handle.y + 10, {
    steps: 10,
  });
  await page.mouse.up();
  const after = await card.evaluate((el) => ({
    width: parseFloat((el as HTMLElement).style.width),
    height: parseFloat((el as HTMLElement).style.height),
  }));
  expect(after.width).toBeLessThan(before.width);
  expect(after.height).toBeGreaterThan(before.height);
  expect(
    await card
      .locator(".note-body")
      .evaluate((el) => el.scrollHeight <= el.clientHeight),
  ).toBe(true);
});

test("toolbar includes child canvas creation and empty search collapses only after focus leaves", async ({
  page,
}) => {
  await ready(page);
  const tools = page.locator(".toolbar > button");
  await expect(tools).toHaveCount(5);
  expect(
    await tools.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label")),
    ),
  ).toEqual(["添加任务", "上传图片", "上传文件", "导入目录", "创建子画布"]);
  await page.getByRole("button", { name: "展开搜索" }).click();
  const input = page.getByRole("textbox", { name: "搜索画布" });
  await expect(input).toBeFocused();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(input).toHaveCount(0);
  await page.getByRole("button", { name: "展开搜索" }).click();
  await input.fill("关键词");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(input).toHaveValue("关键词");
  await page.getByRole("button", { name: "清除搜索" }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await expect(input).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(input).toBeFocused();
  await input.fill("   ");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(input).toHaveCount(0);
  await page.screenshot({ path: "/tmp/yua-four-tools-search.png" });
});

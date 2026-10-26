import { openTextEditor } from "./helpers";
import { test, expect, type Page } from "@playwright/test";

async function saved(page: Page) {
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
}

test("sidebar and search start collapsed and search opens on click or shortcut", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".sidebar")).toHaveClass(/collapsed/);
  await expect(page.getByRole("textbox", { name: "搜索画布" })).toHaveCount(0);
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/collapsed/);
  await page.getByRole("button", { name: "收起侧栏" }).click();
  await page.getByRole("button", { name: "展开搜索" }).click();
  const input = page.getByRole("textbox", { name: "搜索画布" });
  await expect(input).toBeFocused();
  await input.fill("测试");
  await page.getByRole("button", { name: "收起搜索" }).click();
  await expect(input).toHaveCount(0);
  await page.locator(".canvas").click({ position: { x: 250, y: 150 } });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("测试");
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
});

test("autosave waits 600ms after the last interaction and persists only the latest content silently", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.goto("/");
  await saved(page);
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await page.evaluate(() => {
    const writes: unknown[] = [];
    (window as any).__writes = writes;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "boards" && key === "main")
        writes.push(structuredClone(value));
      return put.call(this, value, key!);
    };
  });
  const writes = () => page.evaluate(() => (window as any).__writes);
  await openTextEditor(page);
  await page.getByRole("textbox", { name: "文本内容" }).fill("自动保存内容");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "正在保存…",
  );
  await page.clock.runFor(500);
  expect(await writes()).toHaveLength(0);
  // Even an operation without a board edit restarts the pending countdown.
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await page.clock.runFor(599);
  expect(await writes()).toHaveLength(0);
  await page.keyboard.press("ArrowRight");
  await page.clock.runFor(599);
  expect(await writes()).toHaveLength(0);
  await page.clock.runFor(1);
  await saved(page);
  const result = await writes();
  expect(result).toHaveLength(1);
  expect(result[0].cards[0].text).toBe("自动保存内容");
  const x = await page
    .getByTestId("card")
    .evaluate((el) => parseFloat((el as HTMLElement).style.left));
  expect(result[0].cards[0].x).toBe(x);
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("card")).toContainText("自动保存内容");
});

const card = (id: string, kind: string, x: number, y: number) => ({
  id,
  kind,
  x,
  y,
  width: 220,
  height: 140,
  title: "",
  text: id,
  color: "#ffffff",
  ...(kind === "todo"
    ? { tasks: [{ id: "t", text: "任务", done: false }] }
    : {}),
});

test("minimap fits all elements and groups at any spread, ignores search filters and navigates", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "overview.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards: [
          card("远处笔记", "text", -50000, -30000),
          card("任务列表", "todo", 50000, 30000),
          {
            ...card("文件", "file", -10000, 10000),
            title: "readme.txt",
            blob: "data:text/plain;base64,aGVsbG8=",
          },
          {
            ...card("图像", "image", 10000, -10000),
            title: "pixel.png",
            blob: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          },
        ],
        groups: [
          {
            id: "g",
            name: "空分组",
            bounds: { x: 0, y: 0, width: 400, height: 300 },
          },
        ],
        connections: [
          {
            id: "c",
            from: { card: "远处笔记", side: "e" },
            to: { card: "任务列表", side: "w" },
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  const map = page.getByTestId("minimap");
  await expect(map.locator("[data-minimap-card]")).toHaveCount(4);
  await expect(map.locator("[data-minimap-card] image")).toHaveAttribute(
    "href",
    /^blob:/,
  );
  await expect(map.locator("[data-minimap-group]")).toHaveCount(1);
  await expect(map.locator("[data-minimap-connection]")).toHaveCount(1);
  const allFit = () =>
    map.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [
        ...el.querySelectorAll(
          "[data-minimap-card], [data-minimap-group], [data-minimap-connection]",
        ),
      ].every((node) => {
        const b = node.getBoundingClientRect();
        return (
          b.left >= r.left &&
          b.top >= r.top &&
          b.right <= r.right &&
          b.bottom <= r.bottom
        );
      });
    });
  expect(await allFit()).toBe(true);
  await page.getByRole("button", { name: "展开搜索" }).click();
  await page.getByRole("textbox", { name: "搜索画布" }).fill("远处笔记");
  await expect(page.getByTestId("card")).toHaveCount(1);
  await expect(map.locator("[data-minimap-card]")).toHaveCount(4);
  await page.getByRole("button", { name: "清除搜索" }).click();
  const far = map.locator('[data-minimap-card="任务列表"]');
  const b = await far.boundingBox();
  // At this scale a whole card is less than one pixel wide. Check the exact
  // clicked world coordinate rather than assuming pixel-perfect card centering.
  const click = {
    x: Math.round(b!.x + b!.width / 2),
    y: Math.round(b!.y + b!.height / 2),
  };
  const target = await map.getByTestId("minimap-world").evaluate((el, p) => {
    const v = new DOMPoint(p.x, p.y).matrixTransform(
      (el as SVGGElement).getScreenCTM()!.inverse(),
    );
    return { x: v.x, y: v.y };
  }, click);
  await page.mouse.click(click.x, click.y);
  const center = await page.locator(".world").evaluate((el) => {
    const matrix = new DOMMatrix(getComputedStyle(el).transform);
    const canvas = el.parentElement!;
    return {
      x: (canvas.clientWidth / 2 - matrix.e) / matrix.a,
      y: (canvas.clientHeight / 2 - matrix.f) / matrix.d,
    };
  });
  expect(center.x).toBeCloseTo(target.x, 0);
  expect(center.y).toBeCloseTo(target.y, 0);
  const before = +(await map
    .getByTestId("minimap-viewport")
    .getAttribute("width"))!;
  await page.getByRole("button", { name: "放大", exact: true }).click();
  expect(
    +(await map.getByTestId("minimap-viewport").getAttribute("width"))!,
  ).toBeLessThan(before);
  expect(await allFit()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await allFit()).toBe(true);
  const mobile = await map.boundingBox();
  expect(mobile!.x).toBeGreaterThanOrEqual(0);
  expect(mobile!.x + mobile!.width).toBeLessThan(390);
  await page.screenshot({ path: "/tmp/yua-overview-mobile.png" });
});

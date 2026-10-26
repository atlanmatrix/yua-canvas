import { test, expect, type Page, type Locator } from "@playwright/test";
async function download(page: Page, card: Locator, buttonName: string) {
  await card.hover();
  const action = card.getByRole("button", { name: buttonName, exact: true });
  await expect(action).toHaveCSS("opacity", "1");
  const pending = page.waitForEvent("download");
  await action.click();
  const d = await pending,
    s = await d.createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of s!) chunks.push(c);
  return { name: d.suggestedFilename(), bytes: Buffer.concat(chunks) };
}
test("file thumbnails show raw content and icon/name; hovered downloads preserve originals", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  const text =
    "# 新的迭代工作台：RUN 模块建立交付说明\n\n版本：1.1 / 对齐主干方案\n交付日期：2026-10-23\n\n## 先掌握这些与环境信息\n\n这里的内容直接来自文件，不执行任何脚本。\n\n```mermaid\nflowchart TB\n  A[任务] --> B[交付]\n```\n";
  const file = Buffer.from(text);
  await page.getByTestId("files").setInputFiles({
    name: "03-run.md",
    mimeType: "text/markdown",
    buffer: file,
  });
  const card = page.locator('.card[aria-label="03-run.md"]');
  await expect(card.locator(".file-content-thumbnail")).toHaveText(text);
  await expect(card.locator(".attachment-title svg")).toHaveCount(1);
  await expect(card.locator(".attachment-title")).toHaveText("03-run.md");
  await expect(card.locator(".card-top,footer")).toHaveCount(0);
  await page.locator(".canvas").click({ position: { x: 20, y: 150 } });
  await page.mouse.move(100, 100);
  await expect(card.getByRole("button", { name: "下载 03-run.md" })).toHaveCSS(
    "opacity",
    "0",
  );
  await card.screenshot({ path: "/tmp/yua-file-card.png" });
  const original = await download(page, card, "下载 03-run.md");
  expect(original.name).toBe("03-run.md");
  expect(original.bytes).toEqual(file);
  const image = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 90;
    c.getContext("2d")!.fillRect(0, 0, 160, 90);
    return Array.from(
      new Uint8Array(
        await (
          await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg"))
        ).arrayBuffer(),
      ),
    );
  });
  await page.getByTestId("images").setInputFiles({
    name: "摄影.原图.JPG",
    mimeType: "image/jpeg",
    buffer: Buffer.from(image),
  });
  const imageCard = page.locator('.card[aria-label="摄影.原图.JPG"]');
  await expect(imageCard).toHaveCount(1);
  await page.getByRole("button", { name: "适应所有内容" }).click();
  const photo = await download(page, imageCard, "下载 摄影.原图.JPG");
  expect(photo.name).toBe("摄影.原图.JPG");
  expect(photo.bytes).toEqual(Buffer.from(image));
  await page.evaluate(() =>
    navigator.clipboard.writeText("纯文本导出\n保留换行"),
  );
  await page.keyboard.press("ControlOrMeta+v");
  const note = page.getByTestId("card").filter({ hasText: "纯文本导出" });
  await expect(note).toHaveCount(1);
  await page.getByRole("button", { name: "适应所有内容" }).click();
  const plain = await download(page, note, "下载 文本");
  expect(plain.name).toMatch(
    /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}\.txt$/,
  );
  expect(plain.bytes.toString()).toBe("纯文本导出\n保留换行");
});
test("right-button drag pans without modifying elements, while a stationary right-click opens menus", async ({
  page,
}) => {
  await page.goto("/");
  const cards = [
    {
      id: "a",
      kind: "text",
      title: "",
      text: "组内",
      x: 100,
      y: 100,
      group: "g",
      color: "#ffffff",
    },
    {
      id: "b",
      kind: "text",
      title: "",
      text: "组外",
      x: 700,
      y: 400,
      color: "#ffffff",
    },
  ];
  await page.getByTestId("import").setInputFiles({
    name: "pan.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [
          {
            id: "g",
            name: "分组",
            bounds: { x: 0, y: 0, width: 500, height: 500 },
          },
        ],
        cards,
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.getByRole("button", { name: "关闭提示" }).click();
  const geometry = () =>
    page
      .locator(".card,.group-boundary")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.cssText));
  const original = await geometry();
  const transform = () =>
    page.locator(".world").evaluate((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { x: m.e, y: m.f };
    });
  const canvas = await page.locator(".canvas").boundingBox();
  const sources = [
    async () => ({ x: canvas!.x + canvas!.width - 60, y: 350 }),
    async () => {
      const b = await page.getByTestId("card").first().boundingBox();
      return { x: b!.x + 80, y: b!.y + 60 };
    },
    async () => {
      const b = await page
        .getByRole("button", { name: "拖动分组 分组" })
        .boundingBox();
      return { x: b!.x + b!.width - 40, y: b!.y + b!.height / 2 };
    },
  ];
  for (const [index, source] of sources.entries()) {
    const p = await source(),
      before = await transform();
    await page.mouse.move(p.x, p.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(p.x + 30, p.y - 20, { steps: 8 });
    await page.mouse.up({ button: "right" });
    const after = await transform();
    expect(after.x - before.x, `right drag source ${index}`).toBeCloseTo(30);
    expect(after.y - before.y).toBeCloseTo(-20);
    expect(await geometry()).toEqual(original);
    await expect(page.getByRole("menu")).toHaveCount(0);
  }
  await page.getByTestId("card").first().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "创建分组" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "拖动分组 分组" })
    .click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "解散分组" })).toBeVisible();
});

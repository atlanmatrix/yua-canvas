import { test, expect } from "@playwright/test";
test("notes, grouping, persistence, attachments and portable backup", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("已保存至本地")).toBeVisible();
  await page.getByRole("button", { name: "创建第一个灵感" }).click();
  await page.getByRole("textbox", { name: "笔记标题" }).fill("旅行计划");
  await page.getByRole("textbox", { name: "笔记内容" }).fill("周末去山里走走");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记标题" }).fill("装备清单");
  await page.getByRole("textbox", { name: "笔记内容" }).fill("相机、地图、水");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await page.locator(".canvas").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByText("已选 2 项")).toBeVisible();
  await page.getByRole("button", { name: "创建分组", exact: true }).click();
  await page.getByRole("textbox", { name: "分组名称" }).fill("周末出发");
  await page.getByRole("button", { name: "保存分组" }).click();
  await expect(page.locator(".group-row")).toContainText("周末出发");
  await expect(page.getByText("已保存至本地")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect(page.locator(".group-row")).toContainText("周末出发");
  await page
    .getByTestId("files")
    .setInputFiles({
      name: "hello.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Hello canvas"),
    });
  await expect(page.getByTestId("card")).toHaveCount(3);
  await page
    .getByTestId("images")
    .setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.locator(".thumbnail")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".thumbnail")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  const file = await pending;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString();
  const backup = JSON.parse(content);
  expect(backup.cards).toHaveLength(4);
  expect(backup.groups[0].name).toBe("周末出发");
  expect(
    backup.cards.find((c: { title: string }) => c.title === "hello.txt").blob,
  ).toContain("data:text/plain;base64,");
  await page.locator(".canvas").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await page
    .getByTestId("import")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(content),
    });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(4);
  await page
    .getByRole("button", { name: "查看 旅行计划", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("周末去山里走走");
  await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
  await page
    .getByRole("textbox", { name: "笔记内容" })
    .fill("更新后的旅行计划");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await expect(page.getByText("已保存至本地")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(4);
  await expect(page.getByText("更新后的旅行计划")).toBeVisible();
});
test("moving cards, searching, zooming and rejecting invalid imports", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "或者，先放两张示例笔记" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
  const card = page.getByTestId("card").first();
  const before = await card.boundingBox();
  await page.mouse.move(before!.x + 80, before!.y + 70);
  await page.mouse.down();
  await page.mouse.move(before!.x + 180, before!.y + 110, { steps: 6 });
  await page.mouse.up();
  const after = await card.boundingBox();
  expect(after!.x - before!.x).toBeCloseTo(100, 0);
  await page.getByRole("textbox", { name: "搜索画布" }).fill("不存在的内容");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await page.getByRole("button", { name: "查看全部内容" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "120%", exact: true }),
  ).toBeVisible();
  await page
    .getByTestId("import")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1,"cards":[{}],"groups":[]}'),
    });
  await expect(page.getByRole("status")).toContainText("卡片数据无效");
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.screenshot({ path: "/tmp/yua-canvas-board.png", fullPage: true });
});
test("mobile canvas remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "创建第一个灵感" }).click();
  await page.getByRole("textbox", { name: "笔记标题" }).fill("移动灵感");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.screenshot({ path: "/tmp/yua-canvas-mobile.png", fullPage: true });
});

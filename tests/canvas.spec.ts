import { test, expect } from "@playwright/test";
test("notes, grouping, persistence, attachments and portable backup", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
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
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect(page.locator(".group-row")).toContainText("周末出发");
  await page.getByTestId("files").setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Hello canvas"),
  });
  await expect(page.getByTestId("card")).toHaveCount(3);
  await page.getByTestId("images").setInputFiles({
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
  await page.getByTestId("import").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(4);
  await page
    .getByTestId("card")
    .filter({
      has: page.getByRole("heading", { name: "旅行计划", exact: true }),
    })
    .dblclick();
  await expect(page.getByRole("dialog")).toContainText("周末去山里走走");
  await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
  await page
    .getByRole("textbox", { name: "笔记内容" })
    .fill("更新后的旅行计划");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(4);
  await expect(page.getByText("更新后的旅行计划")).toBeVisible();
});
test("moving cards, searching, zooming and rejecting invalid imports", async ({
  page,
}) => {
  await page.goto("/");
  for (const title of ["第一张", "第二张"]) {
    await page.getByRole("button", { name: "添加笔记", exact: true }).click();
    await page.getByRole("textbox", { name: "笔记标题" }).fill(title);
    await page.getByRole("button", { name: "保存笔记" }).click();
  }
  await page.getByRole("button", { name: "适应所有内容" }).click();
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
  await page.getByTitle("重置缩放 (1)").click();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "120%", exact: true }),
  ).toBeVisible();
  await page.getByTestId("import").setInputFiles({
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
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记标题" }).fill("移动灵感");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.screenshot({ path: "/tmp/yua-canvas-mobile.png", fullPage: true });
});

test("native clipboard image paste creates one persistent image", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "移动画布", exact: true }).click();
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    canvas.getContext("2d")!.fillRect(0, 0, 1, 1);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("PNG encoding failed")),
        "image/png",
      ),
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    (document.activeElement as HTMLElement)?.blur();
  });
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "移动画布", exact: true }),
  ).toHaveClass(/chosen/);
  await expect
    .poll(() =>
      page
        .locator(".thumbnail")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator(".thumbnail")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1);
});

test("pasted files support batches, preserve editable fields and ignore modal pastes", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  // System clipboard support for arbitrary files varies by OS; exercise the
  // browser paste event with real File/DataTransfer objects for this path.
  await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(
      new File(["first attachment"], "first.txt", { type: "text/plain" }),
    );
    clipboardData.items.add(
      new File(["second attachment"], "second.md", { type: "text/markdown" }),
    );
    document.body.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect(page.locator(".attachment-title")).toHaveText([
    "first.txt",
    "second.md",
  ]);
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await page.evaluate(() => navigator.clipboard.writeText("正常粘贴文字"));
  await page.getByRole("textbox", { name: "笔记内容" }).focus();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByRole("textbox", { name: "笔记内容" })).toHaveValue(
    "正常粘贴文字",
  );
  await page.getByRole("textbox", { name: "笔记内容" }).evaluate((el) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(
      new File(["ignored"], "ignored.txt", { type: "text/plain" }),
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索画布" }).evaluate((el) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(
      new File(["ignored"], "search-ignored.txt", { type: "text/plain" }),
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.evaluate(() =>
    navigator.clipboard.writeText("普通文字不应变成附件"),
  );
  await page.locator(".canvas").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(2);
});

test("full-height canvas and keyboard editing shortcuts", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toHaveAttribute("data-state", "已保存至本地");
  const canvas = await page.locator(".canvas").boundingBox();
  expect(canvas!.y).toBe(0);
  expect(canvas!.height).toBe(page.viewportSize()!.height);
  await expect(
    page.locator(
      "main h1, main header, .canvas-bar, .empty-state, .tool-caption",
    ),
  ).toHaveCount(0);
  await page.keyboard.press("n");
  await page.getByRole("textbox", { name: "笔记标题" }).fill("快捷键笔记");
  await page
    .getByRole("textbox", { name: "笔记内容" })
    .fill("v h n 应当保持输入");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("card")).toHaveCount(1);
  const card = page.getByTestId("card").first();
  const before = await card.boundingBox();
  await page.keyboard.press("Escape");
  await card.click();
  await page.keyboard.press("Shift+ArrowRight");
  expect((await card.boundingBox())!.x - before!.x).toBeCloseTo(10, 0);
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+g");
  await page.getByRole("textbox", { name: "分组名称" }).fill("快捷分组");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".group-boundary")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+Shift+g");
  await expect(page.locator(".group-boundary")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("textbox", { name: "搜索画布" })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("+");
  await expect(
    page.getByRole("button", { name: "120%", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("1");
  await expect(
    page.getByRole("button", { name: "100%", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(0);
});

test("Markdown files open only on double-click and render safe GFM", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toHaveAttribute("data-state", "已保存至本地");
  const md =
    "# 项目记录\n\n**重点**与[文档](https://example.com)\n\n- [x] 完成\n\n| 项目 | 状态 |\n| --- | --- |\n| 画布 | 正常 |\n\n```js\nconst ready = true;\n```\n\n<script>window.__mdUnsafe = true</script>\n\n[危险](javascript:alert(1))";
  await page.getByTestId("files").setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(md),
  });
  const card = page.getByTestId("card");
  await card.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card.dblclick();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "项目记录" })).toBeVisible();
  await expect(dialog.locator("strong")).toHaveText("重点");
  await expect(dialog.locator("table")).toContainText("正常");
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  await expect(dialog.locator("pre code")).toContainText("const ready = true;");
  expect(await page.evaluate(() => Object.hasOwn(window, "__mdUnsafe"))).toBe(
    false,
  );
  await expect(dialog.getByRole("link", { name: "危险" })).not.toHaveAttribute(
    "href",
    /javascript:/,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByTestId("images").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "适应所有内容" }).click();
  const image = page.getByTestId("card").filter({ hasText: "pixel.png" });
  await image.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await image.dblclick();
  await expect(page.locator(".detail-image")).toBeVisible();
});

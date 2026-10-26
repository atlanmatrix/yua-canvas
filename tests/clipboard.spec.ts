import { test, expect, type Page, type BrowserContext } from "@playwright/test";
async function setup(page: Page, context: BrowserContext) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
}
async function note(page: Page, text: string) {
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记内容" }).fill(text);
  await page.getByRole("button", { name: "保存笔记" }).click();
}
test("selected notes copy plain text to the system clipboard and paste into an editor", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await note(page, "第一段\n第二行");
  for (const mod of ["Control", "Meta"]) {
    await page.keyboard.press(`${mod}+c`);
    await expect(page.getByRole("status")).toContainText("已复制");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "第一段\n第二行",
    );
  }
  await note(page, "另一段");
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toHaveText("已复制");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "第一段\n第二行\n\n另一段",
  );
  await page.evaluate(() => {
    const input = document.createElement("textarea");
    input.id = "external-editor";
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator("#external-editor")).toHaveValue(
    "第一段\n第二行\n\n另一段",
  );
  // Editing native text must retain the browser's own copy handling.
  await page.locator("#external-editor").fill("原生编辑器文本");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "原生编辑器文本",
  );
});
test("selected JPEG is copied as a decoded PNG and can paste as an image", async ({
  page,
  context,
}) => {
  await setup(page, context);
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 12;
    canvas.height = 8;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 12, 8);
    return Array.from(
      new Uint8Array(
        await (
          await new Promise<Blob>((r) =>
            canvas.toBlob((b) => r(b!), "image/jpeg"),
          )
        ).arrayBuffer(),
      ),
    );
  });
  await page.getByTestId("images").setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(bytes),
  });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制图片");
  const image = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const blob = await items[0].getType("image/png");
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  });
  expect(image).toEqual({ width: 12, height: 8 });
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator(".thumbnail")
        .last()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(12);
});
test("text attachments copy file contents and binary attachments offer the original download", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page.getByTestId("files").setInputFiles({
    name: "readme.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 文件内容\n\n正文"),
  });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制文件文本");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "# 文件内容\n\n正文",
  );
  await page.getByTestId("files").setInputFiles({
    name: "original.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 1, 2, 255]),
  });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText(
    "已复制，可在画布中粘贴；系统文件请下载原文件",
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "original.bin",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载原文件", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("original.bin");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  expect(Buffer.concat(chunks)).toEqual(Buffer.from([0, 1, 2, 255]));
});
test("clipboard denial shows failure instead of a copied notification", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await note(page, "复制失败测试");
  await page.evaluate(() => {
    navigator.clipboard.write = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText(
    "复制失败，请允许此网站访问剪贴板后重试",
  );
  await expect(page.getByRole("status")).not.toContainText("已复制");
});

import { openNoteEditor } from "./helpers";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
async function setup(page: Page, context: BrowserContext) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
}
async function note(page: Page, text: string) {
  await openNoteEditor(page);
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
  await expect(page.locator('.card[aria-label="photo.jpg"]')).toBeVisible();
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
  await expect(page.locator('.card[aria-label="readme.md"]')).toBeVisible();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制文件文本");
  await expect(page.getByRole("status")).toContainText("不能粘贴为系统文件");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "# 文件内容\n\n正文",
  );
  await page.getByTestId("files").setInputFiles({
    name: "original.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 1, 2, 255]),
  });
  await expect(page.locator('.card[aria-label="original.bin"]')).toBeVisible();
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

test("text attachments copy identical plain and rich content, and download original bytes", async ({
  page,
  context,
}) => {
  await setup(page, context);
  const body = '# 标题\r\n正文 <tag> & "引号"\r\n';
  const bytes = Buffer.from(body, "utf8");
  await page.getByTestId("files").setInputFiles({
    name: "源文件.md",
    mimeType: "text/markdown",
    buffer: bytes,
  });
  await expect(page.locator('.card[aria-label="源文件.md"]')).toBeVisible();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制文件文本");
  const formats = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const plain = await (await items[0].getType("text/plain")).text(),
      html = await (await items[0].getType("text/html")).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    return { plain, rich: doc.querySelector("[data-yua-copy]")!.textContent };
  });
  expect(formats.plain).toBe(body);
  expect(formats.rich).toBe(body.replaceAll("\r\n", "\n"));
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载原文件", exact: true }).click();
  const d = await event;
  expect(d.suggestedFilename()).toBe("源文件.md");
  const stream = await d.createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  expect(Buffer.concat(chunks)).toEqual(bytes);
});
test("UTF-16 text files copy readable content and retain their original encoding on download", async ({
  page,
  context,
}) => {
  await setup(page, context);
  const text = "中文 UTF-16\r\n第二行";
  const bytes = Buffer.concat([
    Buffer.from([255, 254]),
    Buffer.from(text, "utf16le"),
  ]);
  await page.getByTestId("files").setInputFiles({
    name: "utf16.txt",
    mimeType: "text/plain",
    buffer: bytes,
  });
  await expect(page.locator('.card[aria-label="utf16.txt"]')).toBeVisible();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制文件文本");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载原文件", exact: true }).click();
  const d = await event,
    stream = await d.createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  expect(d.suggestedFilename()).toBe("utf16.txt");
  expect(Buffer.concat(chunks)).toEqual(bytes);
});

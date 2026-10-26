import { test, expect, type Page } from "@playwright/test";
const saved = (page: Page) =>
  expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
async function download(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载原文件", exact: true }).click();
  const file = await pending,
    stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return { name: file.suggestedFilename(), bytes: Buffer.concat(chunks) };
}
const formats = [
  { name: "utf8", encode: (s: string) => Buffer.from(s, "utf8") },
  {
    name: "utf8-bom",
    encode: (s: string) =>
      Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(s, "utf8")]),
  },
  {
    name: "utf16-le",
    encode: (s: string) =>
      Buffer.concat([Buffer.from([255, 254]), Buffer.from(s, "utf16le")]),
  },
  {
    name: "utf16-be",
    encode: (s: string) =>
      Buffer.concat([
        Buffer.from([254, 255]),
        Buffer.from(s, "utf16le").swap16(),
      ]),
  },
];
for (const format of formats)
  test(`${format.name} text files edit in the detail dialog, preserve filename, BOM and CRLF, and undo without changing original bytes`, async ({
    page,
  }) => {
    await page.goto("/");
    await saved(page);
    const filename = `原始配置-${format.name}.env`,
      original = format.encode("原始文件\r\n第二行 😀\r\n");
    await page.getByTestId("files").setInputFiles({
      name: filename,
      mimeType: "application/octet-stream",
      buffer: original,
    });
    const card = page.getByTestId("card");
    await card.dblclick();
    await expect(page.getByRole("dialog", { name: "内容详情" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "保存文件", exact: true }),
    ).toBeDisabled();
    const initial = await download(page);
    expect(initial.name).toBe(filename);
    expect(initial.bytes).toEqual(original);
    await page.getByRole("button", { name: "编辑文件", exact: true }).click();
    const input = page.getByRole("textbox", { name: "文件内容" });
    await expect(input).toHaveValue("原始文件\n第二行 😀\n");
    await input.fill("修改后的文件\n新的一行 😀\n");
    await page.getByRole("button", { name: "保存文件", exact: true }).click();
    await saved(page);
    const edited = await download(page);
    expect(edited.name).toBe(filename);
    expect(edited.bytes).toEqual(
      format.encode("修改后的文件\r\n新的一行 😀\r\n"),
    );
    await page.getByRole("button", { name: "关闭详情" }).click();
    await expect(card.locator(".file-content-thumbnail")).toContainText(
      "修改后的文件",
    );
    await page.keyboard.press("ControlOrMeta+z");
    await saved(page);
    await card.dblclick();
    expect((await download(page)).bytes).toEqual(original);
    await page.getByRole("button", { name: "关闭详情" }).click();
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await saved(page);
    await page.reload();
    await card.dblclick();
    expect((await download(page)).bytes).toEqual(edited.bytes);
  });

test("Markdown keeps rendered preview, previews unsaved edits, cancels without saving and permits saving empty content", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const original = Buffer.from("# 原始标题\n\n原始正文\n");
  await page.getByTestId("files").setInputFiles({
    name: "文档.md",
    mimeType: "text/markdown",
    buffer: original,
  });
  await page.getByTestId("card").dblclick();
  await expect(page.getByRole("heading", { name: "原始标题" })).toBeVisible();
  await page.getByRole("button", { name: "编辑文件", exact: true }).click();
  await page
    .getByRole("textbox", { name: "文件内容" })
    .fill("# 修改标题\n\n**加粗正文**\n");
  await page.getByRole("button", { name: "预览文件", exact: true }).click();
  await expect(page.getByRole("heading", { name: "修改标题" })).toBeVisible();
  await expect(page.locator(".markdown strong")).toHaveText("加粗正文");
  expect((await download(page)).bytes).toEqual(original);
  await page.keyboard.press("Escape");
  await page.getByTestId("card").dblclick();
  await expect(page.getByRole("heading", { name: "原始标题" })).toBeVisible();
  await page.getByRole("button", { name: "编辑文件", exact: true }).click();
  await page.getByRole("textbox", { name: "文件内容" }).fill("");
  await page.keyboard.press("ControlOrMeta+Enter");
  await saved(page);
  expect((await download(page)).bytes).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/yua-text-file-editor-mobile.png" });
});

test("text file editing loads the complete attachment beyond the 1 MB preview limit and saves its full tail", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await saved(page);
  const original = "x".repeat(1024 * 1024 + 200) + "TAIL";
  await page.getByTestId("files").setInputFiles({
    name: "large.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(original),
  });
  await page.getByTestId("card").dblclick();
  await page.getByRole("button", { name: "编辑文件", exact: true }).click();
  const input = page.getByRole("textbox", { name: "文件内容" });
  expect(
    await input.evaluate((el: HTMLTextAreaElement) => el.value.length),
  ).toBe(original.length);
  await input.fill(original + "\n完整结尾");
  await page.keyboard.press("ControlOrMeta+Enter");
  await saved(page);
  expect((await download(page)).bytes.toString()).toBe(original + "\n完整结尾");
});

import { test, expect, type Page, type Download } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture.mjs";

const graph = "flowchart LR\n  A[输入] --> B[输出]";
const saved = (page: Page) =>
  expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
async function bytes(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function exportJson(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  return bytes(await pending);
}
async function paste(page: Page, source: string) {
  await page.evaluate((source) => {
    const data = new DataTransfer();
    data.setData("text/plain", source);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data }));
  }, source);
}
async function create(page: Page, name: string, x = 180, y = 180) {
  await page.locator(".canvas").click({ button: "right", position: { x, y } });
  await page.getByRole("menuitem", { name: "新建", exact: true }).hover();
  await page
    .getByRole("menu", { name: "新建组件" })
    .getByRole("menuitem", { name, exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await saved(page);
});

for (const source of [
  graph,
  "%% 交互\nsequenceDiagram\n  Alice->>Bob: Hello",
  `\`\`\`mermaid\n${graph}\n\`\`\``,
]) {
  test(`pasted Mermaid renders without chrome, edits in a dialog, undoes and persists: ${source.slice(0, 15)}`, async ({
    page,
  }) => {
    await paste(page, source);
    const card = page.locator(".card-mermaid");
    await expect(
      card.locator('.markdown-diagram[data-diagram-state="ready"] svg'),
    ).toHaveCount(1, { timeout: 20000 });
    await expect(
      card.locator(".card-top,.attachment-title,footer,pre,textarea"),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "适应所有内容" }).click();
    const bounds = await card.boundingBox();
    const svg = await card.locator(".markdown-diagram svg").boundingBox();
    expect(svg!.width).toBeLessThanOrEqual(bounds!.width);
    expect(svg!.height).toBeLessThanOrEqual(bounds!.height);
    await card.dblclick();
    const dialog = page.getByRole("dialog", { name: "编辑 Mermaid" });
    const editor = dialog.getByRole("textbox", { name: "Mermaid 代码" });
    await expect(editor).toHaveValue(source.startsWith("```") ? graph : source);
    await editor.fill("flowchart TB\n  X[修改后] --> Y[已完成]");
    await dialog.getByRole("button", { name: "保存图表" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      card.locator('.markdown-diagram[data-diagram-state="ready"]'),
    ).toContainText("修改后");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(
      card.locator('.markdown-diagram[data-diagram-state="ready"]'),
    ).not.toContainText("修改后");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(
      card.locator('.markdown-diagram[data-diagram-state="ready"]'),
    ).toContainText("修改后");
    await saved(page);
    await page.reload();
    await expect(
      card.locator('.markdown-diagram[data-diagram-state="ready"]'),
    ).toContainText("修改后");
  });
}

test("ordinary prose stays text and invalid diagram source remains editable", async ({
  page,
}) => {
  await paste(page, "flowchart is an ordinary word in this sentence");
  await expect(page.locator(".card-text")).toHaveCount(1);
  await paste(page, "```mermaid\nnot valid mermaid\n```");
  const card = page.locator(".card-mermaid");
  await expect(card.locator('[data-diagram-state="error"]')).toHaveCount(1);
  await expect(card.locator("pre")).toHaveCount(0);
  await page.getByRole("button", { name: "适应所有内容" }).click();
  await card.dblclick();
  await expect(page.getByRole("textbox", { name: "Mermaid 代码" })).toHaveValue(
    "not valid mermaid",
  );
  await page.getByRole("textbox", { name: "Mermaid 代码" }).fill(graph);
  await page.getByRole("button", { name: "保存图表" }).click();
  await expect(card.locator('[data-diagram-state="ready"] svg')).toHaveCount(1);
});

test("new files appear without a picker, edit on click, render Markdown and retain filenames", async ({
  page,
}) => {
  let chooserOpened = false;
  page.on("filechooser", () => {
    chooserOpened = true;
  });
  await create(page, "文件");
  const card = page.locator(".card-file");
  await expect(card).toHaveAttribute("aria-label", "未命名.txt");
  expect(chooserOpened).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card.click();
  await page.getByRole("textbox", { name: "文件名" }).fill("方案.md");
  const markdown = "# 画布上的文档\n\n- [x] 完成\n\n**直接渲染**";
  await page.getByRole("textbox", { name: "文件内容" }).fill(markdown);
  await page.getByRole("button", { name: "保存文件", exact: true }).click();
  await page.getByRole("button", { name: "关闭详情" }).click();
  await expect(
    card.getByRole("heading", { name: "画布上的文档" }),
  ).toBeVisible();
  await saved(page);
  const exported = JSON.parse((await exportJson(page)).toString());
  expect(exported.cards[0].title).toBe("方案.md");
  expect(exported.cards[0].mime).toBe("text/markdown");
  expect(exported.cards[0].editableFile).toBe(true);
  expect(
    Buffer.from(exported.cards[0].blob.split(",")[1], "base64").toString(),
  ).toBe(markdown);
  await page.reload();
  await expect(
    card.getByRole("heading", { name: "画布上的文档" }),
  ).toBeVisible();
  await card.hover();
  await card.locator(".connection-port").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = (await card.boundingBox())!;
  await page.mouse.move(before.x + 40, before.y + 40);
  await page.mouse.down();
  await page.mouse.move(before.x + 90, before.y + 80, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card.click();
  await expect(page.getByRole("textbox", { name: "文件内容" })).toHaveValue(
    markdown,
  );
  await page.getByRole("textbox", { name: "文件名" }).fill("无扩展名文件");
  await page.getByRole("button", { name: "保存文件", exact: true }).click();
  await page.getByRole("button", { name: "关闭详情" }).click();
  await card.click();
  await expect(page.getByRole("textbox", { name: "文件名" })).toHaveValue(
    "无扩展名文件",
  );
  await expect(page.getByRole("textbox", { name: "文件内容" })).toHaveValue(
    markdown,
  );
});

test("PDF renders its first page, shows hover controls, and remembers a different page across reloads", async ({
  page,
}) => {
  const original = pdfFixture();
  await page.getByTestId("files").setInputFiles({
    name: "pages.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  const card = page.locator(".pdf-file-card");
  await expect(card.locator('[data-pdf-page="1"]')).toHaveCount(1, {
    timeout: 20000,
  });
  await expect(
    card.locator(".card-top,.attachment-title,footer,iframe"),
  ).toHaveCount(0);
  await page.mouse.move(20, 300);
  await expect(card.locator(".pdf-page-controls")).toHaveCSS("opacity", "0");
  const first = await card
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await card.hover();
  await expect(card.locator(".pdf-page-controls")).toHaveCSS("opacity", "1");
  await expect(card.getByRole("button", { name: "上一页" })).toBeDisabled();
  await card.getByRole("button", { name: "下一页" }).click();
  await expect(card.locator('[data-pdf-page="2"]')).toHaveCount(1);
  expect(
    await card
      .locator("canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).not.toBe(first);
  await expect(card.getByRole("button", { name: "下一页" })).toBeDisabled();
  await saved(page);
  const data = JSON.parse((await exportJson(page)).toString());
  expect(data.cards[0].pdfPage).toBe(2);
  expect(Buffer.from(data.cards[0].blob.split(",")[1], "base64")).toEqual(
    original,
  );
  await page.reload();
  await expect(card.locator('[data-pdf-page="2"]')).toHaveCount(1);
  await card.hover();
  await card.getByRole("button", { name: "上一页" }).click();
  await expect(card.locator('[data-pdf-page="1"]')).toHaveCount(1);
  await saved(page);
  await page.reload();
  await expect(card.locator('[data-pdf-page="1"]')).toHaveCount(1);
});

test("JSON and ZIP round trips retain Mermaid, PDF pages, editable files and attachment bytes", async ({
  page,
}) => {
  const original = pdfFixture();
  const seed = {
    version: 1,
    groups: [],
    cards: [
      {
        id: "diagram",
        kind: "mermaid",
        title: "",
        text: graph,
        x: 100,
        y: 100,
        width: 300,
        height: 180,
        color: "#ffffff",
      },
      {
        id: "pdf",
        kind: "file",
        title: "pages.pdf",
        text: "",
        x: 500,
        y: 100,
        width: 240,
        height: 360,
        color: "#ffffff",
        mime: "application/pdf",
        pdfPage: 2,
        blob: "data:application/pdf;base64," + original.toString("base64"),
      },
      {
        id: "md",
        kind: "file",
        title: "created.md",
        text: "",
        x: 100,
        y: 400,
        width: 300,
        height: 180,
        color: "#ffffff",
        mime: "text/markdown",
        editableFile: true,
        blob:
          "data:text/markdown;base64," +
          Buffer.from("# 恢复的文档").toString("base64"),
      },
    ],
  };
  const load = async (buffer: Buffer) => {
    await page.getByTestId("import").setInputFiles({
      name: "documents.json",
      mimeType: "application/json",
      buffer,
    });
    await page.getByRole("button", { name: "确认替换" }).click();
    await page.getByRole("button", { name: "关闭提示" }).click();
  };
  await load(Buffer.from(JSON.stringify(seed)));
  await expect(page.locator('[data-pdf-page="2"]')).toHaveCount(1);
  await load(await exportJson(page));
  await expect(
    page.locator('.card-mermaid [data-diagram-state="ready"] svg'),
  ).toHaveCount(1);
  await expect(page.locator('[data-pdf-page="2"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "恢复的文档" })).toBeVisible();
  await page.locator(".canvas").click({ position: { x: 10, y: 200 } });
  await page.keyboard.press("ControlOrMeta+a");
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 10, y: 200 } });
  const pending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载", exact: true }).click();
  const zip = await bytes(await pending);
  await page.getByTestId("files").setInputFiles({
    name: "documents.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(page.locator(".card-mermaid")).toHaveCount(2);
  await expect(page.locator('[data-pdf-page="2"]')).toHaveCount(2);
  const data = JSON.parse((await exportJson(page)).toString());
  expect(
    data.cards.filter((c: any) => c.kind === "mermaid").map((c: any) => c.text),
  ).toEqual([graph, graph]);
  expect(data.cards.filter((c: any) => c.editableFile)).toHaveLength(2);
  for (const card of data.cards.filter((c: any) => c.pdfPage)) {
    expect(card.pdfPage).toBe(2);
    expect(Buffer.from(card.blob.split(",")[1], "base64")).toEqual(original);
  }
});

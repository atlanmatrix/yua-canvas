import { downloadSelectionMenu } from "./helpers";
import { openTextEditor } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
const META = "yua-canvas.metadata.json";
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const note = (id: string, x: number, y: number, text = id) => ({
  id,
  kind: "text",
  title: "",
  text,
  x,
  y,
  width: 180,
  height: 100,
  color: "#ffffff",
});
async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  if (name === "批量下载") await downloadSelectionMenu(page);
  else await page.getByRole("button", { name, exact: true }).click();
  const file = await pending;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return { name: file.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

test("multi-selection ZIP retains original bytes, avoids duplicate names and restores layout, groups, tasks and labeled links without overwriting", async ({
  page,
}) => {
  await page.goto("/");
  const env1 = Buffer.from("APP_ENV=production\r\n");
  const env2 = Buffer.concat([
    Buffer.from([255, 254]),
    Buffer.from("中文配置\r\n", "utf16le"),
  ]);
  const cards = [
    { ...note("note", 80, 100, "原始笔记\n保留换行\n"), group: "inner" },
    {
      ...note("file1", 340, 100),
      kind: "file",
      text: "",
      title: "配置.env",
      mime: "text/plain",
      blob: "data:text/plain;base64," + env1.toString("base64"),
      group: "outer",
    },
    {
      ...note("file2", 600, 100),
      kind: "file",
      text: "",
      title: "配置.env",
      mime: "text/plain",
      blob: "data:text/plain;base64," + env2.toString("base64"),
      group: "outer",
    },
    {
      ...note("image", 80, 350),
      kind: "image",
      text: "",
      title: "原始图片.PNG",
      mime: "image/png",
      blob: "data:image/png;base64," + pixel.toString("base64"),
      group: "outer",
    },
    {
      ...note("todo", 340, 350),
      kind: "todo",
      text: "",
      width: 260,
      height: 200,
      tasks: [{ id: "task", text: "任务第一行\n第二行", done: true }],
      group: "outer",
    },
    note("excluded", 930, 350, "未选中内容"),
  ];
  const groups = [
    {
      id: "outer",
      name: "外分组",
      bounds: { x: 20, y: 20, width: 820, height: 580 },
    },
    {
      id: "inner",
      name: "内分组",
      parent: "outer",
      bounds: { x: 50, y: 60, width: 240, height: 200 },
    },
  ];
  await page.getByTestId("import").setInputFiles({
    name: "board.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards,
        groups,
        connections: [
          {
            id: "link",
            from: { card: "note", side: "e" },
            to: { card: "file1", side: "w" },
            label: "参考资料",
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByRole("button", { name: "批量下载" })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+a");
  await page
    .locator('.card[data-card-id="excluded"]')
    .click({ modifiers: ["Shift"] });
  const zip = await download(page, "批量下载");
  expect(zip.name).toMatch(/\.zip$/);
  const entries = unzipSync(zip.bytes);
  const metadata = JSON.parse(strFromU8(entries[META]));
  expect(Object.keys(entries)).toHaveLength(6);
  expect(metadata.cards).toHaveLength(5);
  expect(metadata.groups).toHaveLength(2);
  expect(
    metadata.cards.every(
      (c: any) =>
        !Object.hasOwn(c, "text") &&
        !Object.hasOwn(c, "blob") &&
        !Object.hasOwn(c, "tasks"),
    ),
  ).toBe(true);
  expect(Buffer.from(entries["配置.env"])).toEqual(env1);
  expect(Buffer.from(entries["配置 (2).env"])).toEqual(env2);
  expect(Buffer.from(entries["原始图片.PNG"])).toEqual(pixel);
  const noteMeta = metadata.cards.find((c: any) => c.id === "note");
  expect(noteMeta.file).toMatch(/\.txt$/);
  expect(strFromU8(entries[noteMeta.file])).toBe(cards[0].text);
  const taskMeta = metadata.cards.find((c: any) => c.id === "todo");
  expect(JSON.parse(strFromU8(entries[taskMeta.file])).tasks).toEqual([
    { text: "任务第一行\n第二行", done: true },
  ]);
  expect(metadata.connections[0].label).toBe("参考资料");

  await page.getByTestId("import").setInputFiles({
    name: "restore.zip",
    mimeType: "application/zip",
    buffer: zip.bytes,
  });
  await expect(page.getByRole("button", { name: "确认替换" })).toHaveCount(0);
  await expect(page.getByTestId("card")).toHaveCount(11);
  const restored = JSON.parse(
    (await download(page, "导出画布")).bytes.toString(),
  );
  const imported = restored.cards.filter(
    (c: any) => !cards.some((original) => original.id === c.id),
  );
  expect(imported).toHaveLength(5);
  for (const [index, card] of imported.entries()) {
    const original = cards[index];
    expect([
      card.x,
      card.y,
      card.width,
      card.height,
      card.kind,
      card.title,
      card.text,
    ]).toEqual([
      original.x,
      original.y,
      original.width,
      original.height,
      original.kind,
      original.title,
      original.text,
    ]);
    if (original.blob) expect(card.blob).toBe(original.blob);
    expect(card.group).not.toBe(original.group);
  }
  expect(imported[4].tasks[0]).toMatchObject({
    text: "任务第一行\n第二行",
    done: true,
  });
  expect(imported[4].tasks[0].id).not.toBe("task");
  expect(restored.connections).toHaveLength(2);
  expect(restored.connections[1].label).toBe("参考资料");
  expect(restored.connections[1].from.card).toBe(imported[0].id);
  const newInner = restored.groups.find(
    (g: any) => g.id !== "inner" && g.name === "内分组",
  );
  expect(restored.groups.find((g: any) => g.id === newInner.parent).name).toBe(
    "外分组",
  );
  expect(newInner.parent).not.toBe("outer");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("card")).toHaveCount(6);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByTestId("card")).toHaveCount(11);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(11);
  await expect(page.locator(".connection-label")).toHaveCount(2);
});

test("ordinary ZIP uploads unpack nested files, infer image and Markdown types and preserve bytes", async ({
  page,
}) => {
  await page.goto("/");
  const raw = {
    "目录/说明.md": strToU8("# 压缩包内的 Markdown\n"),
    "目录/原图.png": pixel,
    "目录/.env": strToU8("TOKEN=local\n"),
    "__MACOSX/._file": strToU8("ignored"),
  };
  await page.getByTestId("files").setInputFiles({
    name: "files.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(raw)),
  });
  await expect(page.getByTestId("card")).toHaveCount(3);
  await expect(page.locator(".card-image .thumbnail")).toHaveCount(1);
  await expect(
    page.locator('.card[aria-label=".env"] .file-content-thumbnail'),
  ).toContainText("TOKEN=local");
  await page.locator('.card[aria-label="说明.md"]').dblclick();
  await expect(
    page.getByRole("heading", { name: "压缩包内的 Markdown" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const board = JSON.parse((await download(page, "导出画布")).bytes.toString());
  expect(board.cards.find((c: any) => c.title === "原图.png").blob).toBe(
    "data:image/png;base64," + pixel.toString("base64"),
  );
});

test("damaged archives and missing metadata files leave existing content untouched", async ({
  page,
}) => {
  await page.goto("/");
  await openTextEditor(page);
  await page.getByRole("textbox", { name: "文本内容" }).fill("保留内容");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.getByTestId("files").setInputFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not a zip"),
  });
  await expect(page.getByRole("status")).toContainText("ZIP 文件无效");
  await expect(page.getByTestId("card")).toHaveCount(1);
  const meta = {
    format: "yua-canvas",
    version: 1,
    cards: [{ ...note("missing", 0, 0), file: "missing.txt" }],
    groups: [],
  };
  await page.getByTestId("import").setInputFiles({
    name: "missing.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ [META]: strToU8(JSON.stringify(meta)) })),
  });
  await expect(page.getByRole("status")).toContainText("缺少元数据引用的文件");
  await expect(page.getByTestId("card")).toHaveCount(1);
  await expect(page.getByTestId("card")).toContainText("保留内容");
});

test("ZIP metadata preserves intentionally resized frames and ungrouped cards on import and reload", async ({
  page,
}) => {
  await page.goto("/");
  const metadata = {
    format: "yua-canvas",
    version: 1,
    cards: [
      { ...note("partial", 100, 50), file: "a.txt", name: "", group: "g" },
      { ...note("outside", 500, 50), file: "b.txt", name: "" },
    ],
    groups: [
      {
        id: "g",
        name: "固定边框",
        bounds: { x: 0, y: 0, width: 180, height: 120 },
      },
    ],
    connections: [],
  };
  const entries = {
    [META]: strToU8(JSON.stringify(metadata)),
    "a.txt": strToU8("部分越界"),
    "b.txt": strToU8("未分组"),
  };
  await page.getByTestId("files").setInputFiles({
    name: "layout.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(entries)),
  });
  await expect(page.getByTestId("card")).toHaveCount(2);
  const check = async () => {
    const frame = await page.locator(".group-boundary").evaluate((el) => ({
      width: parseFloat((el as HTMLElement).style.width),
      height: parseFloat((el as HTMLElement).style.height),
    }));
    expect(frame).toEqual({ width: 180, height: 120 });
    await expect(
      page.getByTestId("card").filter({ hasText: "部分越界" }),
    ).toHaveAttribute("data-group-name", "固定边框");
    await expect(
      page.getByTestId("card").filter({ hasText: "未分组" }),
    ).toHaveAttribute("data-group-name", "");
  };
  await check();
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await check();
});

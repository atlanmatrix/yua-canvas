import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Excel menu imports a workbook, previews its first sheet and preserves the original", async ({
  page,
}) => {
  const buffer = await readFile("tests/fixtures/名单.xlsx");
  await page.goto("/");
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 180, y: 180 } });
  await page.getByRole("menuitem", { name: "新建", exact: true }).hover();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Excel 表格" }).click();
  await (
    await chooser
  ).setFiles({ name: "名单.XLSX", mimeType: "application/zip", buffer });
  const card = page.locator(".card-file");
  await expect(card.getByRole("cell", { name: "00012" })).toBeVisible();
  await expect(
    card.getByRole("cell", { name: "0", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
  await page.reload();
  await expect(card.getByRole("cell", { name: "张三" })).toBeVisible();
  await card.dblclick();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("cell", { name: "工号" })).toBeVisible();
  await expect(dialog).not.toContainText("第二表");
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载工作簿" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("名单.XLSX");
  expect(await readFile((await download.path())!)).toEqual(buffer);
});

test("unreadable workbooks remain available as attachments", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("files").setInputFiles({
    name: "broken.xlsx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.locator(".card-file")).toContainText("无法预览此工作簿");
});

test("save edited and appended values, preserve other sheets and reload edits", async ({
  page,
}) => {
  const original = await readFile("tests/fixtures/名单.xlsx");
  await page.goto("/");
  await page
    .getByTestId("files")
    .setInputFiles({ name: "名单.xlsx", mimeType: "", buffer: original });
  const card = page.locator(".card-file");
  await expect(card.getByRole("cell", { name: "张三" })).toBeVisible();
  await card.dblclick();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "编辑表格" }).click();
  await dialog.getByRole("textbox", { name: "B2", exact: true }).fill("李四");
  await dialog.getByRole("textbox", { name: "C2", exact: true }).fill("42");
  await dialog.getByRole("textbox", { name: "A3", exact: true }).fill("00028");
  await dialog.getByRole("button", { name: "保存表格" }).click();
  await expect(dialog.getByRole("cell", { name: "李四" })).toBeVisible();
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载工作簿" }).click();
  const file = await pending;
  const { unzipSync } = await import("fflate");
  const changed = unzipSync(await readFile((await file.path())!));
  expect(changed["xl/worksheets/sheet2.xml"]).toEqual(
    unzipSync(original)["xl/worksheets/sheet2.xml"],
  );
  const { readSheet } = await import("read-excel-file/node");
  expect(await readSheet((await file.path()) as string)).toEqual([
    ["工号", "姓名", "金额"],
    ["00012", "李四", 42],
    ["00028", null, null],
  ]);
  await dialog.getByRole("button", { name: "编辑表格" }).click();
  await dialog.getByRole("textbox", { name: "B2", exact: true }).fill("丢弃");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog.getByRole("cell", { name: "李四" })).toBeVisible();
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
  await page.reload();
  await expect(card.getByRole("cell", { name: "00028" })).toBeVisible();
});

test("scroll the canvas worksheet on both axes without moving the card or camera", async ({
  page,
}) => {
  const { unzipSync, zipSync, strToU8, strFromU8 } = await import("fflate");
  const parts = unzipSync(await readFile("tests/fixtures/名单.xlsx"));
  const path = "xl/worksheets/sheet1.xml";
  parts[path] = strToU8(
    strFromU8(parts[path])
      .replace(
        "</sheetData>",
        '<row r="205"><c r="AN205" t="inlineStr"><is><t>远端</t></is></c></row></sheetData>',
      )
      .replace("A1:C2", "A1:AN205"),
  );
  await page.goto("/");
  await page.getByTestId("files").setInputFiles({
    name: "scroll.xlsx",
    mimeType: "",
    buffer: Buffer.from(zipSync(parts)),
  });
  const grid = page.locator(".card-file .xlsx-preview");
  await expect(grid.getByRole("cell", { name: "张三" })).toBeVisible();
  const camera = () =>
    page.locator(".world").evaluate((el) => getComputedStyle(el).transform);
  const start = await camera();
  const box = (await grid.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(500, 600);
  await expect
    .poll(() => grid.evaluate((el) => Math.min(el.scrollTop, el.scrollLeft)))
    .toBeGreaterThan(0);
  const position = await grid.evaluate((el) => el.scrollLeft);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 10, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => grid.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(position);
  await page.mouse.wheel(10000, 10000);
  await expect(grid.getByRole("cell", { name: "远端" })).toBeVisible();
  expect(await camera()).toBe(start);
  expect(await grid.boundingBox()).toEqual(box);
  await page.mouse.wheel(-10000, -10000);
  await expect(grid.getByRole("cell", { name: "张三" })).toBeVisible();
});

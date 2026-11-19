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
  await dialog.getByRole("button", { name: "下载原文件" }).click();
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

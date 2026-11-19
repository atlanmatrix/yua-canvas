import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";

for (const kind of ["docx", "pptx"] as const) {
  test(`${kind} imports from its menu, previews pictures, saves text and downloads an intact package`, async ({
    page,
  }) => {
    const word = kind === "docx";
    let original = await readFile("tests/fixtures/trip." + kind);
    if (!word) {
      // Presentation order is independent of slide filenames.
      const files = unzipSync(original);
      const pres = strFromU8(files["ppt/presentation.xml"]);
      files["ppt/presentation.xml"] = strToU8(
        pres.replace(/(<p:sldId [^>]+\/>)(<p:sldId [^>]+\/>)/, "$2$1"),
      );
      original = Buffer.from(zipSync(files));
    }
    await page.goto("/");
    await page
      .locator(".canvas")
      .click({ button: "right", position: { x: 160, y: 140 } });
    await page.getByRole("menuitem", { name: "新建", exact: true }).hover();
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("menuitem", {
        name: word ? "Word 文档" : "PPT 演示文稿",
        exact: true,
      })
      .click();
    const pick = await chooser;
    expect(await pick.element().getAttribute("accept")).toBe("." + kind);
    await pick.setFiles({
      name: "旅行." + kind.toUpperCase(),
      mimeType: "application/zip",
      buffer: original,
    });
    const card = page.locator(".card-file");
    await expect(card).toContainText(word ? "周一出发" : "苏州");
    await expect(card.getByRole("img", { name: "文档插图" })).toBeVisible();
    if (!word) {
      await card.getByRole("button", { name: "下一页" }).click();
      await expect(card).toContainText("上海");
      await expect(card.locator(".office-slide")).toBeVisible();
    }
    await card.dblclick();
    const dialog = page.getByRole("dialog");
    if (!word) {
      await expect(dialog).toContainText("上海");
      await dialog.getByRole("button", { name: "上一页" }).click();
    }
    await dialog.getByRole("button", { name: "编辑文字" }).click();
    const field = dialog.getByRole("textbox", {
      name: word ? "段落 2，文本 1" : "段落 1，文本 1",
    });
    await field.fill(word ? "周二出发\n上午集合" : "新苏州");
    if (!word) {
      await dialog.getByRole("button", { name: "下一页" }).click();
      await dialog.getByRole("textbox").first().fill("新上海");
      await dialog.getByRole("button", { name: "上一页" }).click();
      await expect(field).toHaveValue("新苏州");
    }
    await dialog.getByRole("button", { name: "保存文件" }).click();
    await expect(
      dialog.getByText(word ? "上午集合" : "新苏州", { exact: true }),
    ).toBeVisible();
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "下载文件" }).click();
    const downloaded = await pending;
    expect(downloaded.suggestedFilename()).toBe("旅行." + kind.toUpperCase());
    const entries = unzipSync(await readFile((await downloaded.path())!));
    const baseline = unzipSync(original);
    expect(Object.keys(entries).sort()).toEqual(Object.keys(baseline).sort());
    for (const part of Object.keys(entries)) {
      if (
        word
          ? part === "word/document.xml"
          : /^ppt\/slides\/slide\d+\.xml$/.test(part)
      )
        continue;
      expect(
        Buffer.compare(Buffer.from(entries[part]), Buffer.from(baseline[part])),
      ).toBe(0);
    }
    expect(
      word
        ? strFromU8(entries["word/document.xml"])
        : strFromU8(entries["ppt/slides/slide1.xml"]),
    ).toContain(word ? "上午集合" : "新上海");
    await dialog.getByRole("button", { name: "编辑文字" }).click();
    await dialog.getByRole("textbox").first().fill("取消的修改");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(dialog).not.toContainText("取消的修改");
    await expect(page.locator(".save-indicator")).toHaveAttribute(
      "data-state",
      "已保存至本地",
    );
    if (!word) {
      await dialog.getByRole("button", { name: "下一页" }).click();
      await expect(card).toContainText("新上海");
      await expect(page.locator(".save-indicator")).toHaveAttribute(
        "data-state",
        "已保存至本地",
      );
    }
    await page.reload();
    await expect(card).toContainText(word ? "上午集合" : "新上海");
  });
}
test("a damaged Word document can still be downloaded", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("files").setInputFiles({
    name: "bad.docx",
    mimeType: "",
    buffer: Buffer.from("bad"),
  });
  const card = page.locator(".card-file");
  await expect(card).toContainText("无法预览此文件");
  await card.dblclick();
  await expect(page.getByRole("button", { name: "下载文件" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "编辑文字" })).toHaveCount(0);
});

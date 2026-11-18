import { expect, test, type Page } from "@playwright/test";

async function gallery(page: Page) {
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.evaluate(async () => {
    const { saveBoard } = await import("/src/storage.ts");
    const { createLockProfile, lockCard } = await import("/src/encryption.ts");
    const image = (id: string, width = 160, height = 90) => ({
      id,
      kind: "image" as const,
      title: `${id}.svg`,
      text: "",
      x: 100,
      y: 100,
      width: 160,
      height: 90,
      color: "#ffffff",
      mime: "image/svg+xml",
      blob: new Blob(
        [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="steelblue"/></svg>`,
        ],
        { type: "image/svg+xml" },
      ),
    });
    const profile = await createLockProfile("gallery-password");
    await saveBoard({
      version: 1,
      lockProfile: profile,
      cards: [
        image("first"),
        { ...image("second", 1200, 2400), x: 320, width: 80, height: 160 },
        { ...image("third", 800, 400), x: 520 },
        { ...image("masked"), masked: true, y: 400 },
        { ...image("group-masked"), group: "hidden", y: 400 },
        await lockCard(
          { ...image("locked"), y: 400 },
          profile,
          "gallery-password",
        ),
        {
          id: "child",
          kind: "canvas",
          title: "子画布",
          text: "",
          x: 750,
          y: 100,
          color: "#ffffff",
          canvas: { version: 1, cards: [image("nested")], groups: [] },
        },
      ],
      groups: [{ id: "hidden", name: "隐藏分组", masked: true }],
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "适应所有内容" }).click();
  await page.locator('.card[aria-label="second.svg"]').dblclick();
  return page.getByRole("dialog", { name: "图片预览", exact: true });
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`fullscreen gallery switches images and keeps metadata opt-in at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const dialog = await gallery(page);
    await expect(dialog).toBeVisible();
    expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
    expect(await dialog.innerText()).toBe("");
    const thumbnails = dialog.getByRole("navigation", { name: "当前画布图片" });
    await expect(thumbnails.getByRole("button")).toHaveCount(3);
    const active = thumbnails.locator('[aria-current="true"]');
    await expect(active).toHaveAttribute("aria-label", "预览图片：second.svg");
    await dialog.getByRole("button", { name: "图片信息", exact: true }).click();
    const info = dialog.getByRole("complementary", { name: "图片信息" });
    await expect(info).toContainText("second.svg");
    await expect(info).toContainText("1200 × 2400");
    await expect(info).toContainText("image/svg+xml");
    await expect(info).toContainText("KB");
    const frame = await dialog.locator(".image-preview-stage").boundingBox();
    const picture = await dialog
      .locator(".image-preview-stage img")
      .boundingBox();
    expect(picture!.height).toBeLessThanOrEqual(frame!.height);
    expect(picture!.y + picture!.height).toBeLessThanOrEqual(
      frame!.y + frame!.height,
    );
    await page.keyboard.press("ArrowRight");
    await expect(active).toHaveAttribute("aria-label", "预览图片：third.svg");
    await expect(info).toContainText("800 × 400");
    await dialog.getByRole("button", { name: "下一张图片" }).click();
    await expect(active).toHaveAttribute("aria-label", "预览图片：first.svg");
    await page.keyboard.press("ArrowLeft");
    await expect(active).toHaveAttribute("aria-label", "预览图片：third.svg");
    await dialog.getByRole("button", { name: "上一张图片" }).click();
    await expect(active).toHaveAttribute("aria-label", "预览图片：second.svg");
    await thumbnails
      .getByRole("button", { name: "预览图片：first.svg", exact: true })
      .click();
    await expect(info).toContainText("first.svg");
    await expect(info).toContainText("160 × 90");
    await dialog.getByRole("button", { name: "图片信息", exact: true }).click();
    expect(await dialog.innerText()).toBe("");
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("card")).toHaveCount(7);
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.locator('.card[aria-label="first.svg"]').dblclick();
    expect(await dialog.innerText()).toBe("");
    await dialog.getByRole("button", { name: "关闭预览" }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test("single-image preview downloads the original and releases image URLs on close", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  const bytes = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="red"/></svg>',
  );
  await page
    .getByTestId("images")
    .setInputFiles({
      name: "original.svg",
      mimeType: "image/svg+xml",
      buffer: bytes,
    });
  await page.evaluate(() => {
    const revoke = URL.revokeObjectURL;
    (window as any).revokedPreviewUrls = [];
    URL.revokeObjectURL = (url) => {
      (window as any).revokedPreviewUrls.push(url);
      revoke(url);
    };
  });
  await page.getByTestId("card").dblclick();
  const dialog = page.getByRole("dialog", { name: "图片预览" });
  await expect(dialog.locator(".image-preview-stage img")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect(dialog.getByRole("button", { name: "上一张图片" })).toHaveCount(
    0,
  );
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(
    dialog.getByRole("navigation").getByRole("button"),
  ).toHaveAttribute("aria-current", "true");
  const urls = await dialog
    .locator("img")
    .evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载原文件" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("original.svg");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks)).toEqual(bytes);
  await dialog
    .locator(".image-preview-stage")
    .click({ position: { x: 5, y: 5 } });
  await expect(dialog).toHaveCount(0);
  const revoked = await page.evaluate(() => (window as any).revokedPreviewUrls);
  for (const url of urls) expect(revoked).toContain(url);
});

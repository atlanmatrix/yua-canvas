import { test, expect } from "@playwright/test";
import { openSettings, exportCanvas } from "./settings-helper.mjs";

test("settings keeps canvas commands isolated while open, dismisses with Escape or outside input, and restores focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("n");
  await page.getByRole("textbox", { name: "文本内容" }).fill("保留选中的节点");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.getByTestId("card").click();
  const trigger = page.getByRole("button", { name: "设置", exact: true });
  await expect(page.locator(".floating-actions button:visible")).toHaveCount(1);
  await expect(page.getByRole("slider")).toHaveCount(0);
  await openSettings(page);
  await expect(
    page.getByRole("dialog", { name: "设置", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".card.selected")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await openSettings(page);
  await page.mouse.click(400, 250);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "画笔", exact: true }).click();
  await openSettings(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "绘画工具栏" })).toBeVisible();
});

test("settings imports and exports the workspace, closes for the cloud dialog, and preserves background services", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "导入", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "settings-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          {
            id: "note",
            kind: "text",
            x: 100,
            y: 100,
            width: 240,
            height: 120,
            color: "#ffffff",
            title: "",
            text: "从设置导入的文本",
          },
        ],
      }),
    ),
  });
  await expect(page.locator(".settings-popover")).not.toBeVisible();
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await expect(page.getByTestId("card")).toContainText("从设置导入的文本");
  await openSettings(page);
  await expect(page.locator(".settings-save-status")).toContainText(
    "已保存至本地",
  );
  const downloading = page.waitForEvent("download");
  await exportCanvas(page);
  const stream = await (await downloading).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(
    JSON.stringify(JSON.parse(Buffer.concat(chunks).toString())),
  ).toContain("从设置导入的文本");
  await expect(page.locator(".settings-popover")).not.toBeVisible();
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享", exact: true }).click();
  await page.getByRole("menuitem", { name: "当前站点", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "云同步与分享", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".settings-popover")).not.toBeVisible();
  await page.getByRole("button", { name: "关闭云同步", exact: true }).click();
  await openSettings(page);
  await expect(
    page.getByRole("slider", { name: "语言", exact: true }),
  ).toBeVisible();
});

test("subcanvas navigation remains usable beside settings in both themes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "创建子画布", exact: true }).click();
  await page
    .getByRole("button", { name: "进入子画布 子画布", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "画布路径" })).toHaveText(
    "子画布",
  );
  await openSettings(page);
  await page.getByRole("slider", { name: "外观", exact: true }).press("Home");
  await page
    .getByRole("slider", { name: "外观", exact: true })
    .press("ArrowRight");
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await page.getByRole("button", { name: "返回父画布", exact: true }).click();
  await expect(page.locator(".card-canvas")).toHaveCount(1);
});

test.describe("mobile cloud menu", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test("a finger tap keeps the cloud submenu open and its controls usable", async ({
    page,
  }) => {
    await page.route("**/api/session", (r) =>
      r.fulfill({ json: { user: null } }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "设置", exact: true }).tap();
    const trigger = page.getByRole("button", {
      name: "云同步与分享",
      exact: true,
    });
    await trigger.tap();
    // Some mobile browsers dispatch pointerleave after the compatibility click.
    await trigger
      .locator("..")
      .dispatchEvent("pointerout", { pointerType: "touch" });
    const menu = page.getByRole("menu", { name: "同步服务器", exact: true });
    await page.waitForTimeout(400);
    await expect(menu).toBeVisible();
    const local = menu.getByRole("switch", {
      name: "自动同步：当前站点",
      exact: true,
    });
    await local.tap();
    await expect(local).toHaveAttribute("aria-checked", "true");
    await local.tap();
    await expect(local).toHaveAttribute("aria-checked", "false");
    await page.waitForTimeout(400);
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "当前站点", exact: true }).tap();
    await expect(
      page.getByRole("dialog", { name: "云同步与分享", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "关闭云同步" }).tap();
    await page.getByRole("button", { name: "设置", exact: true }).tap();
    await trigger.tap();
    await page.waitForTimeout(400);
    await menu.getByRole("menuitem", { name: "新增服务器" }).tap();
    await expect(
      page.getByRole("dialog", { name: "新增服务器" }),
    ).toBeVisible();
  });
});

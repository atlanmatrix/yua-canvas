import { expect, test, type Page } from "@playwright/test";
import { openSettings } from "./settings-helper.mjs";

async function create(page: Page) {
  await page.goto("/");
  await page.locator(".canvas").click({
    button: "right",
    position: { x: 140, y: 150 },
  });
  await page.getByRole("menuitem", { name: "新建图表", exact: true }).hover();
  await page.getByRole("menuitem", { name: "流程图", exact: true }).click();
  await page.locator(".card-flowchart").dblclick();
  const editor = page.getByRole("dialog", { name: "编辑流程图" });
  await expect(editor).toBeVisible();
  return editor;
}

test("edit nodes and directed connectors in a flowchart card, then reopen it after reload", async ({
  page,
}) => {
  const editor = await create(page);
  const node = (name: string) =>
    editor.locator(".flow-canvas").getByRole("button", { name, exact: true });
  const nodes = editor.locator("[data-flow-node]");
  const edges = editor.locator("[data-flow-edge]");
  await expect(nodes).toHaveCount(5);
  await expect(edges).toHaveCount(4);

  const stage = (await editor.locator(".flow-canvas").boundingBox())!;
  await editor
    .getByRole("complementary", { name: "图形库" })
    .getByRole("button", { name: "数据库" })
    .dragTo(editor.locator(".flow-canvas"), {
      targetPosition: { x: stage.width - 100, y: 105 },
    });
  await expect(nodes).toHaveCount(6);
  const field = editor.getByRole("textbox", { name: "节点文字" });
  await node("数据库").dblclick();
  await expect(field).toBeFocused();
  await field.fill("归档");
  await field.press("Enter");
  await expect(node("归档")).toBeVisible();

  const before = await node("归档").boundingBox();
  await node("归档").dragTo(editor.locator(".flow-canvas"), {
    targetPosition: { x: stage.width - 125, y: 165 },
  });
  const after = await node("归档").boundingBox();
  expect(after!.y - before!.y).toBeGreaterThan(30);
  const resize = node("归档").locator("[data-flow-resize]");
  await resize.dragTo(editor.locator(".flow-canvas"), {
    targetPosition: {
      x: after!.x + after!.width + 20 - stage.x,
      y: after!.y + after!.height + 16 - stage.y,
    },
  });
  expect((await node("归档").boundingBox())!.width).toBeGreaterThan(
    after!.width + 10,
  );

  await node("返回修改").hover();
  await node("返回修改").locator('[data-flow-port="e"]').dragTo(node("归档"));
  await expect(edges).toHaveCount(5);
  const label = editor.getByRole("textbox", { name: "连线标签" });
  await label.fill("待复查");
  await label.press("Enter");
  await expect(node("连线 待复查")).toBeVisible();

  await node("归档").click();
  await page.keyboard.press("Delete");
  await expect(nodes).toHaveCount(5);
  await expect(edges).toHaveCount(4);
  await editor.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(nodes).toHaveCount(6);
  await expect(edges).toHaveCount(5);
  await editor.getByRole("button", { name: "重做", exact: true }).click();
  await expect(nodes).toHaveCount(5);
  await editor.getByRole("button", { name: "撤销", exact: true }).click();
  await editor.getByRole("button", { name: "保存图表", exact: true }).click();

  const card = page.locator(".card-flowchart");
  await expect(card.locator(".flow-preview")).toContainText("待复查");
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
  await page.reload();
  await expect(card.locator(".flow-preview")).toContainText("待复查");
  await card.dblclick();
  await expect(node("归档")).toBeVisible();
  await editor.getByRole("button", { name: "连线", exact: true }).click();
  await node("归档").click();
  await expect(editor.locator(".flow-status").getByRole("status")).toHaveText(
    "选择连线终点",
  );
  await node("开始").click();
  await expect(edges).toHaveCount(6);
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await card.dblclick();
  await expect(edges).toHaveCount(5);
});

test("a flowchart survives a component ZIP export and import", async ({
  page,
}) => {
  const editor = await create(page);
  await editor.getByRole("button", { name: "文档", exact: true }).click();
  await editor.getByRole("textbox", { name: "节点文字" }).fill("审核记录");
  await editor.getByRole("button", { name: "保存图表", exact: true }).click();
  const card = page.locator(".card-flowchart");
  await expect(card.locator(".flow-preview")).toContainText("审核记录");
  await openSettings(page);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "组件压缩包", exact: true }).click();
  const archive = await download;
  await page.getByTestId("import").setInputFiles({
    name: archive.suggestedFilename(),
    mimeType: "application/zip",
    buffer: await readDownload(archive),
  });
  await expect(card).toHaveCount(2);
  await expect(card.last().locator(".flow-preview")).toContainText("审核记录");
  await card.last().dblclick();
  await expect(editor.locator("[data-flow-node]")).toHaveCount(6);
});

async function readDownload(download: import("@playwright/test").Download) {
  const buffers: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!)
    buffers.push(chunk);
  return Buffer.concat(buffers);
}

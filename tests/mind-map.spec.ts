import { test, expect, type Page } from "@playwright/test";

const nodes = (page: Page) => page.locator("[data-mind-node]");
const selected = (page: Page) =>
  page.locator("[data-mind-node][data-selected]");
const node = (page: Page, text: string) =>
  nodes(page).filter({
    has: page.locator(".mind-label", { hasText: new RegExp("^" + text + "$") }),
  });

async function rename(page: Page, name: string) {
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "节点文字" });
  await input.fill(name);
  await page.keyboard.press("Enter");
  await expect(selected(page)).toHaveText(name);
}
async function menu(page: Page, text: string, item: string) {
  await node(page, text).click({ button: "right" });
  await page
    .getByRole("menu")
    .getByRole(item.includes("复选框") ? "menuitemcheckbox" : "menuitem", {
      name: item,
    })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 180, y: 180 } });
  await page.getByRole("menuitem", { name: "新建", exact: true }).hover();
  await page.getByRole("menuitem", { name: "思维导图", exact: true }).click();
  await expect(selected(page)).toHaveText("root");
});
test("node creation, scoped keyboard navigation, editing and formatting", async ({
  page,
}) => {
  await expect(nodes(page)).toHaveCount(1);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.keyboard.press("Meta+Enter");
  await expect(nodes(page)).toHaveCount(1);
  await page.keyboard.press("Tab");
  await rename(page, "first");
  await page.keyboard.press("Control+Enter");
  await rename(page, "second");
  await page.keyboard.press("ArrowUp");
  await expect(selected(page)).toHaveText("first");
  await page.keyboard.press("ArrowLeft");
  await expect(selected(page)).toHaveText("root");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(selected(page)).toHaveText("second");
  await selected(page).dblclick();
  const input = page.getByRole("textbox", { name: "节点文字" });
  await input.fill("cancel");
  await page.keyboard.press("ArrowLeft");
  expect(
    await input.evaluate((el) => (el as HTMLInputElement).selectionStart),
  ).toBe(5);
  await page.keyboard.press("Escape");
  await expect(selected(page)).toHaveText("second");
  await page.getByRole("button", { name: "倾斜" }).click();
  await expect(node(page, "second").locator(".mind-label")).toHaveCSS(
    "font-style",
    "italic",
  );
  await expect(node(page, "first").locator(".mind-label")).toHaveCSS(
    "font-style",
    "normal",
  );
  await page.getByLabel("节点填充色").fill("#abbccd");
  await expect(node(page, "second")).toHaveCSS(
    "background-color",
    "rgb(171, 188, 205)",
  );
  await menu(page, "second", "创建子节点");
  await rename(page, "leaf");
  await menu(page, "root", "转为表格");
  const table = page.getByRole("table", { name: "思维导图表格" });
  await expect(table).toBeVisible();
  await expect(node(page, "root").locator("..")).toHaveAttribute(
    "rowspan",
    "2",
  );
  await expect(node(page, "first").locator("..")).toHaveAttribute(
    "colspan",
    "2",
  );
  const bounds = (await node(page, "root").boundingBox())!;
  expect(bounds.height).toBeGreaterThanOrEqual(
    (await table.boundingBox())!.height - 3,
  );
  await menu(page, "root", "转为思维导图");
  await expect(table).toHaveCount(0);
  await expect(node(page, "second").locator(".mind-label")).toHaveCSS(
    "font-style",
    "italic",
  );
  await expect(nodes(page)).toHaveCount(4);
  await expect(node(page, "second")).toHaveCSS(
    "background-color",
    "rgb(171, 188, 205)",
  );
  await node(page, "leaf").click();
  await page.keyboard.press("Delete");
  await expect(nodes(page)).toHaveCount(3);
  await expect(selected(page)).toHaveText("second");
  await page.keyboard.press("Control+z");
  await expect(nodes(page)).toHaveCount(4);
});

test("nested checkbox overrides restore earlier selections across views and reload", async ({
  page,
}) => {
  await page.keyboard.press("Tab");
  await rename(page, "branch");
  await page.keyboard.press("Tab");
  await rename(page, "A");
  await page.keyboard.press("Meta+Enter");
  await rename(page, "B");
  await menu(page, "root", "创建子节点");
  await rename(page, "C");
  await menu(page, "root", "启用复选框");
  const box = (label: string) =>
    page.getByRole("checkbox", { name: label, exact: true });
  await box("A").check();
  await expect(box("root")).toBeChecked({ indeterminate: true });
  await expect(box("branch")).toBeChecked({ indeterminate: true });
  await box("branch").click();
  await expect(box("B")).toBeChecked();
  await box("root").click();
  await expect(box("C")).toBeChecked();
  await menu(page, "root", "转为表格");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(box("root")).toBeChecked();
  await box("root").click();
  await expect(box("C")).not.toBeChecked();
  await expect(box("branch")).toBeChecked();
  await box("branch").click();
  await expect(box("A")).toBeChecked();
  await expect(box("B")).not.toBeChecked();
  await expect(box("root")).toBeChecked({ indeterminate: true });
  await menu(page, "root", "关闭复选框");
  await expect(box("root")).toHaveCount(0);
  await menu(page, "root", "启用复选框");
  await expect(box("A")).toBeChecked();
});

test("workspace JSON and ZIP restore the same styled and partially checked tree", async ({
  page,
}) => {
  await menu(page, "root", "创建子节点");
  await rename(page, "保留");
  await menu(page, "root", "启用复选框");
  await page.getByRole("checkbox", { name: "保留", exact: true }).check();
  await menu(page, "root", "创建子节点");
  await menu(page, "root", "转为表格");
  await page.getByLabel("节点边框色").fill("#123456");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const { readBoard, exportBoard, importBoard } =
      await import("/src/storage.ts");
    const { createArchive, readArchive } = await import("/src/archive.ts");
    const board = await readBoard();
    const raw = await exportBoard(board);
    const json = await importBoard(raw);
    const archive = await readArchive(
      new File([await createArchive(board)], "map.zip"),
      { x: 0, y: 0 },
    );
    const map = JSON.parse(board.cards[0].text);
    const invalid = JSON.parse(raw);
    map.root.children[0].id = map.root.id;
    invalid.cards[0].text = JSON.stringify(map);
    let rejected = false;
    try {
      await importBoard(JSON.stringify(invalid));
    } catch {
      rejected = true;
    }
    return {
      sameJSON: json.cards[0].text === board.cards[0].text,
      sameZIP: archive.cards[0].text === board.cards[0].text,
      rejected,
    };
  });
  expect(result).toEqual({ sameJSON: true, sameZIP: true, rejected: true });
});

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
  await expect(page.locator(".card-mindmap.selected")).toBeVisible();
  await expect(selected(page)).toHaveCount(0);
  await page.keyboard.press("Enter");
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
  await node(page, "root").dblclick();
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

test("map and table show every node on a transparent canvas without inner scrollbars", async ({
  page,
}) => {
  const card = page.locator(".card-mindmap");
  const checkFrame = async () => {
    await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(card).toHaveCSS("border-top-width", "0px");
    await expect(card).toHaveCSS("box-shadow", "none");
    await expect
      .poll(() =>
        card.evaluate((el) => {
          const frame = el.getBoundingClientRect();
          const visible = [...el.querySelectorAll("[data-mind-node]")].every(
            (node) => {
              const r = node.getBoundingClientRect();
              return (
                r.width > 0 &&
                r.left >= frame.left - 1 &&
                r.right <= frame.right + 1 &&
                r.top >= frame.top - 1 &&
                r.bottom <= frame.bottom + 1
              );
            },
          );
          const scroller = [
            el,
            ...el.querySelectorAll(
              ".component-viewport, .component-content, .component-content *",
            ),
          ].some((box) => {
            const style = getComputedStyle(box);
            return (
              (/auto|scroll/.test(style.overflowX) &&
                box.scrollWidth > box.clientWidth) ||
              (/auto|scroll/.test(style.overflowY) &&
                box.scrollHeight > box.clientHeight)
            );
          });
          return visible && !scroller;
        }),
      )
      .toBe(true);
  };
  await page.keyboard.press("Tab");
  await expect(nodes(page)).toHaveCount(2);
  await checkFrame();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(nodes(page)).toHaveCount(4);
  await menu(page, "root", "转为表格");
  await checkFrame();
  await card.dispatchEvent("contextmenu", { clientX: 350, clientY: 250 });
  await page
    .getByRole("menuitemradio", { name: "显示模式：中", exact: true })
    .click();
  await checkFrame();
  await node(page, "root").click();
  const handle = (await card.getByTestId("card-resize-se").boundingBox())!;
  const x = handle.x + handle.width / 2,
    y = handle.y + handle.height / 2;
  const before = (await card.boundingBox())!;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 100, y + 40, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await card.boundingBox())!.width)
    .toBeLessThan(before.width - 50);
  await checkFrame();
  await menu(page, "root", "转为思维导图");
  await checkFrame();
});

test("branch colors, curves and underline anchors follow the hierarchy across themes", async ({
  page,
}) => {
  await page.keyboard.press("Tab");
  await rename(page, "Plan");
  await page.keyboard.press("Control+Enter");
  await rename(page, "Review");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Tab");
  await rename(page, "Scope");
  await page.keyboard.press("Tab");
  await rename(page, "Deliverables");
  await selected(page).hover();
  await selected(page).getByRole("button", { name: "创建子节点" }).click();
  await rename(page, "Checklist");

  const links = page.locator(".mind-links path[data-to]");
  await expect(links).toHaveCount(5);
  await expect(page.locator(".mind-links [data-trunk]")).toHaveCount(2);
  await expect(node(page, "Plan")).toHaveCSS(
    "background-color",
    "rgb(37, 99, 235)",
  );
  await expect(node(page, "Review")).toHaveCSS(
    "background-color",
    "rgb(4, 120, 87)",
  );
  await expect(node(page, "Scope")).toHaveCSS(
    "background-color",
    "rgb(239, 246, 255)",
  );
  await expect(selected(page)).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(selected(page).locator(".mind-label")).toHaveCSS(
    "font-size",
    "12px",
  );

  const underline = node(page, "Deliverables");
  const id = await underline.getAttribute("data-mind-node");
  const incoming = links.and(page.locator(`[data-to="${id}"]`));
  const outgoing = links.and(page.locator(`[data-from="${id}"]`));
  const error = (path: SVGPathElement, end: boolean) => {
    const key = end ? path.dataset.to : path.dataset.from;
    const layout = path.closest(".mind-layout")!;
    const bounds = layout
      .querySelector(`[data-mind-node="${key}"]`)!
      .getBoundingClientRect();
    const anchor = path
      .getPointAtLength(end ? path.getTotalLength() : 0)
      .matrixTransform(path.getScreenCTM()!);
    return Math.max(
      Math.abs(anchor.x - (end ? bounds.left : bounds.right)),
      Math.abs(anchor.y - bounds.bottom),
    );
  };
  await expect.poll(() => incoming.evaluate(error, true)).toBeLessThan(2);
  await expect.poll(() => outgoing.evaluate(error, false)).toBeLessThan(2);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(node(page, "Plan")).toHaveCSS(
    "background-color",
    "rgb(88, 166, 255)",
  );
  await expect(incoming).toHaveAttribute("stroke", "#58a6ff");
});

test("space, letters and digits open inline editing with the original label selected", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", { name: "节点文字" });
  async function checkActivation(key: string, original: string) {
    const color = await selected(page)
      .locator(".mind-label")
      .evaluate((el) => getComputedStyle(el).color);
    await page.keyboard.press(key);
    await expect(editor, `editing after ${key}`).toBeFocused();
    await expect(editor).toHaveValue(original);
    expect(
      await editor.evaluate((el: HTMLInputElement) => [
        el.selectionStart,
        el.selectionEnd,
      ]),
    ).toEqual([0, original.length]);
    await expect(editor).toHaveCSS("color", color);
    await expect(editor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(editor).toHaveCSS("border-top-width", "0px");
    await expect(editor).toHaveCSS("border-radius", "0px");
  }
  for (const key of ["Space", "h", "Shift+A", "0", "Shift+Numpad3"]) {
    await checkActivation(key, "root");
    await page.keyboard.type("replace 123");
    await expect(editor).toHaveValue("replace 123");
    await page.keyboard.press("Escape");
    await expect(selected(page)).toHaveText("root");
  }
  await page.keyboard.press("Tab");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(selected(page)).toHaveCSS("background-color", "rgb(88, 166, 255)");
  await checkActivation("a", "新节点");
  await page.keyboard.type("Branch");
  await page.keyboard.press("Enter");
  await expect(selected(page)).toHaveText("Branch");
  await menu(page, "root", "转为表格");
  await node(page, "Branch").click();
  await checkActivation("7", "Branch");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type(" 2");
  await page.keyboard.press("Enter");
  await expect(selected(page)).toHaveText("Branch 2");
});

test("map selection exposes ports, activation enables local drags and editable canvas curves", async ({
  page,
}) => {
  const card = page.locator(".card-mindmap"),
    root = node(page, "root");
  await page.keyboard.press("Tab");
  await rename(page, "Branch");
  const child = node(page, "Branch");
  await page.keyboard.press("Escape");
  await expect(card).not.toHaveAttribute("data-mind-active", "true");
  await expect(card.locator(".connection-port")).toHaveCount(4);
  expect(
    await card.evaluate((el) => getComputedStyle(el, "::after").borderTopStyle),
  ).toBe("dashed");
  const rect = async (el: typeof card) => (await el.boundingBox())!;
  const original = await rect(card);
  async function drag(el: typeof card, dx: number, dy: number) {
    const b = await rect(el),
      x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 6 });
    await page.mouse.up();
  }
  await drag(child, 35, 28);
  expect((await rect(card)).x - original.x).toBeCloseTo(35, 0);
  await expect(selected(page)).toHaveCount(0);
  await child.dblclick();
  await expect(selected(page)).toHaveText("Branch");
  await expect(card.locator(".connection-port")).toHaveCount(0);
  const before = await rect(child),
    fixed = await rect(root);
  const path = card.locator(".mind-links [data-to]");
  const previous = await path.getAttribute("d");
  await drag(child, 56, 44);
  expect((await rect(child)).x - before.x).toBeCloseTo(56, 0);
  expect((await rect(child)).y - before.y).toBeCloseTo(44, 0);
  expect((await rect(root)).x).toBeCloseTo(fixed.x, 0);
  await expect(path).not.toHaveAttribute("d", previous!);
  const hit = card.locator(".mind-link-hit");
  const midpoint = await hit.evaluate((el: SVGPathElement) => {
    const p = el
      .getPointAtLength(el.getTotalLength() / 2)
      .matrixTransform(el.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.dblclick(midpoint.x, midpoint.y);
  const editor = page.getByRole("textbox", { name: "连线文字" });
  await expect(editor).toBeFocused();
  await editor.fill("依赖");
  await editor.press("Enter");
  const label = card.locator(".mind-edge-label");
  await expect(label).toHaveText("依赖");
  await label.dblclick();
  await editor.fill("取消");
  await editor.press("Escape");
  await expect(label).toHaveText("依赖");
  await page.keyboard.press("Escape");
  await expect(card.locator(".connection-port")).toHaveCount(4);
  await page.keyboard.press("Space");
  await expect(selected(page)).toHaveText("root");
  await expect(card.locator(".connection-port")).toHaveCount(0);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(label).toHaveText("依赖");
  await expect(path).not.toHaveAttribute("d", previous!);
  await expect(hit).toHaveCount(0);
  await child.click();
  await expect(card.locator(".connection-port").first()).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(selected(page)).toHaveCount(0);
  await root.dblclick();
  await label.dblclick();
  await editor.fill("点击空白保存");
  await page.mouse.click(900, 500);
  await expect(label).toHaveText("点击空白保存");
});

test("map and table retain the same node palette and custom colors in both themes", async ({
  page,
}) => {
  await page.keyboard.press("Tab");
  await rename(page, "One");
  await page.keyboard.press("Control+Enter");
  await rename(page, "Two");
  await page.keyboard.press("Tab");
  await rename(page, "Detail");
  await page.getByLabel("节点填充色").fill("#ddddee");
  await page.getByLabel("节点边框色").fill("#505062");
  await page.getByLabel("文字颜色", { exact: true }).fill("#202940");
  const colors = () =>
    nodes(page).evaluateAll((els) =>
      Object.fromEntries(
        els.map((el) => [
          el.getAttribute("data-mind-node"),
          [
            getComputedStyle(el).backgroundColor,
            getComputedStyle(el).borderTopColor,
            getComputedStyle(el.querySelector(".mind-label")!).color,
          ],
        ]),
      ),
    );
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(node(page, "One")).toHaveCSS(
      "background-color",
      colorScheme === "dark" ? "rgb(88, 166, 255)" : "rgb(37, 99, 235)",
    );
    const map = await colors();
    await menu(page, "root", "转为表格");
    expect(await colors()).toEqual(map);
    await menu(page, "root", "转为思维导图");
    expect(await colors()).toEqual(map);
  }
});

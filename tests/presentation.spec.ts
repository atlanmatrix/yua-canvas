import { test, expect, type Page } from "@playwright/test";
import { openTextEditor } from "./helpers";
const saved = (page: Page) =>
  expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
async function snapshot(page: Page) {
  await saved(page);
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("yua-canvas", 1);
      q.onsuccess = () => r(q.result);
    });
    return new Promise<any>((r) => {
      const q = db.transaction("boards").objectStore("boards").get("main");
      q.onsuccess = () => r(q.result);
    });
  });
}
async function seed(page: Page, groups: any[] = [], extra: any = {}) {
  await page.goto("/");
  await saved(page);
  await page.getByTestId("import").setInputFiles({
    name: "presentation.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards: [
          {
            id: "a",
            kind: "text",
            title: "笔记甲",
            text: "完整内容甲",
            x: 100,
            y: 140,
            width: 640,
            height: 400,
            color: "#ffffff",
            displayMode: "medium",
            group: groups.length ? "g" : undefined,
          },
          {
            id: "b",
            kind: "todo",
            title: "待办乙",
            text: "",
            tasks: [{ id: "t", text: "准备资料", done: false }],
            x: 470,
            y: 190,
            width: 240,
            height: 200,
            color: "#ffffff",
            displayMode: "medium",
            group: groups.length ? "g" : undefined,
          },
        ],
        groups,
        ...extra,
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await saved(page);
}
async function cardMenu(page: Page, id = "a") {
  await page
    .locator(`[data-card-id="${id}"]`)
    .dispatchEvent("contextmenu", { clientX: 400, clientY: 240 });
}
async function groupMenu(page: Page) {
  await page
    .locator(".group-title")
    .dispatchEvent("contextmenu", { clientX: 300, clientY: 150 });
}
async function mode(page: Page, label: string) {
  await page
    .getByRole("menuitemradio", { name: `显示模式：${label}`, exact: true })
    .click();
}
test("component sizes preserve natural dimensions, mask unmounts content, and remarks persist", async ({
  page,
}) => {
  await seed(page);
  const card = page.locator('[data-card-id="a"]');
  await expect(card).toHaveCSS("width", "320px");
  const scaled = await card
    .locator(".component-content")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  expect(scaled).toBeGreaterThan(0.49);
  expect(scaled).toBeLessThanOrEqual(0.5);
  await cardMenu(page);
  await mode(page, "小");
  await expect(card).toHaveCSS("width", "56px");
  await expect(card.locator(".note-body")).toHaveCount(0);
  await expect(card.locator(".component-type-icon")).toBeVisible();
  await cardMenu(page);
  await mode(page, "大");
  await expect(card).toHaveCSS("width", "640px");
  await expect(card.locator(".component-content")).toHaveCSS(
    "transform",
    "none",
  );
  await cardMenu(page);
  await page.getByRole("menuitem", { name: "备注", exact: true }).click();
  await page
    .getByRole("textbox", { name: "备注内容" })
    .fill("右侧备注\n第二行");
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(card.getByLabel("备注", { exact: true })).toContainText(
    "第二行",
  );
  await cardMenu(page);
  await page.getByRole("menuitem", { name: "遮罩", exact: true }).click();
  await expect(card.locator(".component-mask")).toBeVisible();
  await expect(card.locator(".note-body,.component-remark")).toHaveCount(0);
  await saved(page);
  await page.reload();
  await expect(card.locator(".component-mask")).toBeVisible();
  await cardMenu(page);
  await page.getByRole("menuitem", { name: "取消遮罩" }).click();
  await expect(card.locator(".note-body")).toContainText("完整内容甲");
  await expect(card.locator(".component-remark")).toContainText("右侧备注");
  const data = await snapshot(page);
  expect(data.cards[0]).toMatchObject({
    displayMode: "large",
    width: 640,
    height: 400,
    remark: "右侧备注\n第二行",
    masked: false,
  });
});
test("group list switches active content, persists and restores exact flat layout", async ({
  page,
}) => {
  await seed(page, [
    {
      id: "g",
      name: "资料组",
      bounds: { x: 60, y: 80, width: 740, height: 460 },
    },
  ]);
  const before = await snapshot(page);
  await groupMenu(page);
  await mode(page, "列表");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.locator(".group-list-detail")).toContainText("完整内容甲");
  await page
    .getByRole("navigation", { name: "分组组件列表" })
    .getByRole("button", { name: "待办乙" })
    .click();
  await expect(page.locator(".group-list-detail")).toContainText("准备资料");
  await page
    .getByRole("navigation", { name: "分组组件列表" })
    .getByRole("button", { name: "待办乙" })
    .click({ button: "right" });
  await expect(
    page.getByRole("menuitemradio", { name: "显示模式：小" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const task = page
    .locator(".group-list-detail")
    .getByRole("checkbox", { name: "准备资料" });
  await task.check();
  await expect(task).toBeChecked();
  await task.uncheck();
  await saved(page);
  await page.reload();
  await expect(page.locator(".group-list-detail")).toContainText("准备资料");
  await groupMenu(page);
  await page.getByRole("menuitem", { name: "遮罩", exact: true }).click();
  await expect(page.locator(".group-list")).toHaveCount(0);
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.locator(".group-boundary>.component-mask")).toBeVisible();
  await page
    .locator(".group-boundary>.component-mask")
    .click({ button: "right", position: { x: 20, y: 80 } });
  await page.getByRole("menuitem", { name: "取消遮罩" }).click();
  await groupMenu(page);
  await mode(page, "平铺");
  await expect(page.getByTestId("card")).toHaveCount(2);
  const after = await snapshot(page);
  expect(after.cards).toEqual(before.cards);
  expect(after.groups[0].bounds).toEqual(before.groups[0].bounds);
});
test("double-click text offers formatting, Escape restores it, format-only edits undo as one action", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await page.locator(".canvas").dblclick({ position: { x: 240, y: 220 } });
  const editor = page.getByRole("textbox", { name: "文本内容" });
  await editor.fill("格式化文字");
  const toolbar = page.getByRole("toolbar", { name: "文本格式" });
  await toolbar.getByRole("button", { name: "加粗", exact: true }).click();
  await toolbar.getByRole("button", { name: "倾斜" }).click();
  await toolbar.getByRole("button", { name: "下划线" }).click();
  await toolbar.getByRole("button", { name: "删除线" }).click();
  await toolbar.getByLabel("字体", { exact: true }).selectOption("Georgia");
  await toolbar.getByLabel("字号", { exact: true }).fill("24");
  await toolbar.getByLabel("文字颜色").fill("#dc2626");
  await toolbar.getByLabel("文本背景色").fill("#fef9c3");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Enter");
  const p = page.locator(".note-body p");
  await expect(p).toHaveCSS("font-weight", "700");
  await expect(p).toHaveCSS("font-size", "24px");
  await expect(p).toHaveCSS("font-style", "italic");
  await expect(p).toHaveCSS("color", "rgb(220, 38, 38)");
  await expect(p).toHaveCSS("text-decoration-line", "underline line-through");
  expect((await snapshot(page)).cards[0].displayMode).toBe("medium");
  await page.getByTestId("card").dblclick();
  await toolbar.getByRole("button", { name: "加粗", exact: true }).click();
  await editor.click();
  await page.keyboard.press("Escape");
  await expect(p).toHaveCSS("font-weight", "700");
  await page.getByTestId("card").dblclick();
  await toolbar.getByRole("button", { name: "加粗", exact: true }).click();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(p).toHaveCSS("font-weight", "400");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(p).toHaveCSS("font-weight", "700");
  await saved(page);
  await page.reload();
  await expect(p).toHaveCSS("font-size", "24px");
});
test("freehand smooths strokes, stays above cards, undoes per stroke and survives export/import", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("button", { name: "画笔", exact: true }).click();
  await page.getByLabel("画笔颜色").fill("#2563eb");
  await page.getByLabel("画笔粗细").fill("9");
  const canvas = await page.locator(".canvas").boundingBox();
  await page.mouse.move(canvas!.x + 180, canvas!.y + 200);
  await page.mouse.down();
  await page.mouse.move(canvas!.x + 240, canvas!.y + 260, { steps: 12 });
  await page.mouse.move(canvas!.x + 350, canvas!.y + 200, { steps: 12 });
  await page.mouse.up();
  const paths = page.locator(".paint-layer [data-stroke-id]");
  await expect(paths).toHaveCount(1);
  await expect(paths).toHaveAttribute("stroke", "#2563eb");
  await expect(paths).toHaveAttribute("stroke-width", "9");
  await expect(paths).toHaveAttribute("d", /Q/);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(paths).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(paths).toHaveCount(1);
  const before = await snapshot(page);
  await page.reload();
  await expect(paths).toHaveCount(1);
  expect((await snapshot(page)).strokes).toEqual(before.strokes);
  const json = await page.evaluate(async () => {
    const mod = await import("/src/storage.ts" as string);
    return mod.exportBoard(await mod.readBoard());
  });
  await page.getByTestId("import").setInputFiles({
    name: "paint.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(paths).toHaveCount(1);
  expect((await snapshot(page)).strokes).toEqual(before.strokes);
});
test("imports reject malformed presentation and paint data without replacing the board", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  for (const patch of [
    { strokes: [{ id: "s", width: 0, color: "#123456", points: [] }] },
    { cards: [{ ...before.cards[0], displayMode: "gigantic" }] },
    { groups: [{ id: "invalid", name: "invalid", displayMode: "wrong" }] },
    {
      cards: [{ ...before.cards[0], textStyle: { fontFamily: "url(unsafe)" } }],
    },
  ]) {
    await page.getByTestId("import").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ ...before, ...patch })),
    });
    await expect(page.getByRole("button", { name: "确认替换" })).toHaveCount(0);
    expect((await snapshot(page)).cards).toEqual(before.cards);
  }
});
test("every component type offers icon mode and masking; child canvases omit size controls", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const cards = [
    "text",
    "image",
    "file",
    "todo",
    "canvas",
    "miniature",
    "mermaid",
    "vscode",
    "iterm2",
  ].map((kind, i) => ({
    id: kind,
    kind,
    title: kind,
    text:
      kind === "vscode"
        ? "/Users/alice/project"
        : kind === "iterm2"
          ? "echo hello"
          : kind === "miniature"
            ? "https://example.com/scene/"
            : kind === "mermaid"
              ? "flowchart LR\nA-->B"
              : "内容",
    x: 80 + (i % 5) * 130,
    y: 120 + Math.floor(i / 5) * 180,
    width: 180,
    height: 140,
    color: "#ffffff",
    displayMode: kind === "canvas" ? undefined : "small",
    ...(kind === "image"
      ? {
          blob: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        }
      : kind === "file"
        ? { blob: "data:text/plain;base64,YWJj", mime: "text/plain" }
        : kind === "todo"
          ? { tasks: [{ id: "t", text: "准备资料", done: false }] }
          : kind === "canvas"
            ? { canvas: { version: 1, cards: [], groups: [] } }
            : {}),
  }));
  await page.getByTestId("import").setInputFiles({
    name: "kinds.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, cards, groups: [] })),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  for (const card of cards) {
    const root = page.locator(`[data-card-id="${card.id}"]`);
    if (card.kind !== "canvas")
      await expect(root.locator(".component-type-icon")).toBeVisible();
    await cardMenu(page, card.id);
    await expect(
      page.getByRole("group", { name: "显示模式", exact: true }),
    ).toHaveCount(card.kind === "canvas" ? 0 : 1);
    await page.getByRole("menuitem", { name: "遮罩", exact: true }).click();
    await expect(root.locator(".component-mask")).toBeVisible();
    await expect(
      root.locator(".component-viewport,.component-type-icon"),
    ).toHaveCount(0);
  }
  await saved(page);
  await page.reload();
  await expect(page.locator(".card>.component-mask")).toHaveCount(9);
});
test("shared boards retain masks, notes, list selection and brush strokes without exposing masked content", async ({
  page,
}) => {
  const text = (id: string, group?: string) => ({
    id,
    kind: "text",
    title: id,
    text: `secret-${id}`,
    x: 70,
    y: 100,
    width: 300,
    height: 100,
    color: "#ffffff",
    displayMode: "medium",
    group,
  });
  const board = {
    version: 1,
    cards: [
      { ...text("masked"), masked: true, remark: "private-note" },
      { ...text("small"), x: 500, displayMode: "small" },
      text("child", "masked-group"),
      { ...text("first", "list"), masked: true },
      text("second", "list"),
    ],
    groups: [
      {
        id: "masked-group",
        name: "masked group",
        masked: true,
        bounds: { x: 40, y: 300, width: 400, height: 260 },
      },
      {
        id: "list",
        name: "list",
        displayMode: "list",
        activeCard: "second",
        bounds: { x: 520, y: 300, width: 640, height: 360 },
      },
    ],
    strokes: [
      {
        id: "pen",
        color: "#ef4444",
        width: 5,
        points: [
          { x: 60, y: 60 },
          { x: 80, y: 80 },
          { x: 90, y: 60 },
        ],
      },
    ],
  };
  await page.route("**/api/shares/resolve", (route) =>
    route.fulfill({ json: { snapshot: board } }),
  );
  await page.goto("/#/s/" + "b".repeat(64));
  await expect(page.locator(".share-card>.component-mask")).toHaveCount(1);
  await expect(page.locator(".share-group>.component-mask")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("secret-masked");
  await expect(page.locator("body")).not.toContainText("private-note");
  await expect(page.locator("body")).not.toContainText("secret-child");
  await expect(page.locator(".share-card>.component-type-icon")).toHaveCount(1);
  await expect(page.locator(".group-list-detail")).toContainText(
    "secret-second",
  );
  await expect(page.locator(".share-paint [data-stroke-id]")).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "分组组件列表" })
    .getByRole("button", { name: "已遮罩" })
    .click();
  await expect(
    page.locator(".group-list-detail .component-mask"),
  ).toBeVisible();
  await expect(page.locator(".group-list-detail")).not.toContainText(
    "secret-first",
  );
});

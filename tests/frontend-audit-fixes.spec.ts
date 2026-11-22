import { expect, test, type Page } from "@playwright/test";
import { openSettings } from "./settings-helper.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const shotDir = process.env.VISUAL_QA_DIR || "";
async function snap(page: Page, name: string) {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: join(shotDir, `${name}.png`) });
}

async function importBoard(page: Page, data: unknown) {
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.getByTestId("import").setInputFiles({
    name: "audit.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  const closeToast = page.getByRole("button", { name: "关闭提示" });
  if (await closeToast.isVisible()) await closeToast.click();
}

test("Escape inside FlowchartEditor, MindMapEditor and TextFileEditor never destroys unsaved edits", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();

  // 1. FlowchartEditor: Esc cancels selection/mode without closing the editor
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 260, y: 200 } });
  await page.getByRole("menuitem", { name: "新建图表", exact: true }).hover();
  await page.getByRole("menuitem", { name: "流程图", exact: true }).click();
  await page.locator(".card-flowchart").dblclick();
  const flow = page.getByRole("dialog", { name: "编辑流程图" });
  await expect(flow).toBeVisible();
  await flow.getByRole("button", { name: "连线", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(flow).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(flow).toHaveCount(0);

  // 2. MindMapEditor: Esc closes node context menu without closing the editor, and roving tabindex returns to active node
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 880, y: 560 } });
  await page.getByRole("menuitem", { name: "新建图表", exact: true }).hover();
  await page.getByRole("menuitem", { name: "思维导图", exact: true }).click();
  await page.locator(".card-mindmap").dblclick();
  const mind = page.getByRole("dialog", { name: "编辑思维导图" });
  await expect(mind).toBeVisible();
  const rootNode = mind.locator("[data-mind-node]").first();
  await expect(rootNode).toHaveAttribute("tabindex", "0");
  await rootNode.click({ button: "right" });
  await expect(mind.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mind.getByRole("menu")).toHaveCount(0);
  await expect(mind).toBeVisible();
  await mind.getByRole("button", { name: "取消", exact: true }).click();
  await expect(mind).toHaveCount(0);

  // 3. TextFileEditor: Esc while renaming cancels rename without closing file detail modal
  await page.getByTestId("files").setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Title\n\nOriginal content"),
  });
  const fileCard = page.locator(".card-file").first();
  await expect(fileCard).toBeVisible();
  await fileCard.dblclick();
  const detail = page.getByRole("dialog", { name: "内容详情" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "文件名" }).click();
  const nameInput = detail.getByRole("textbox", { name: "文件名" });
  await nameInput.fill("changed.md");
  await page.keyboard.press("Escape");
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("button", { name: "文件名" })).toHaveText(
    "notes.md",
  );
  await detail.getByRole("button", { name: "关闭详情" }).click();
});

test("context menu ArrowDown moves past submenus, menu blocks Delete shortcut, and CloudPanel logout Tab cycles cleanly", async ({
  page,
}) => {
  await page.route("https://yua-worker.atlanmatrix.workers.dev/api/**", (r) => {
    if (r.request().url().endsWith("/shares"))
      return r.fulfill({ json: { shares: [] } });
    return r.fulfill({
      json: { user: { owner_id: "owner", name: "Audit User" } },
    });
  });

  await page.goto("/");
  await importBoard(page, {
    version: 1,
    groups: [],
    cards: [
      {
        id: "n1",
        kind: "text",
        title: "",
        text: "保留此卡片",
        x: 140,
        y: 140,
        width: 200,
        height: 80,
        color: "#ffffff",
      },
    ],
  });

  // Right-click canvas: ArrowDown from first submenu item moves to next item instead of opening submenu
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 520, y: 240 } });
  const menu = page.getByRole("menu").first();
  await expect(menu).toBeVisible();
  const firstItem = menu.locator("button:not(:disabled)").first();
  await firstItem.focus();
  await page.keyboard.press("ArrowDown");
  const secondItem = menu.locator("button:not(:disabled)").nth(1);
  await expect(secondItem).toBeFocused();
  await expect(page.locator(".submenu-layer:popover-open")).toHaveCount(0);

  // Select card, open menu, press Backspace/Delete -> card must NOT be deleted
  await page.keyboard.press("Escape");
  await page.locator('[data-card-id="n1"]').click();
  await page.locator('[data-card-id="n1"]').click({ button: "right" });
  await expect(page.getByRole("menu").first()).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-card-id="n1"]')).toHaveCount(1);
  await page.keyboard.press("Escape");

  // CloudPanel logout confirm dialog Tab cycling + Escape closes CloudPanel
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享", exact: true }).click();
  await page.getByRole("menuitem", { name: "Yua Cloud", exact: true }).click();
  const cloud = page.getByRole("dialog", { name: "云同步与分享", exact: true });
  await expect(cloud).toBeVisible();
  await cloud.getByRole("button", { name: "退出登录" }).click();
  const alert = page.getByRole("alertdialog", { name: "确认退出登录？" });
  const cancelBtn = alert.getByRole("button", { name: "取消", exact: true });
  const logoutBtn = alert.getByRole("button", {
    name: "退出登录",
    exact: true,
  });
  await expect(cancelBtn).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(logoutBtn).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancelBtn).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(logoutBtn).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(alert).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(cloud).toHaveCount(0);
});

test("inset focus rings stay intact, SVG connection hit stays outline-free, marquee layers above cards, and link icon responds to click", async ({
  page,
}) => {
  await page.goto("/");
  await importBoard(page, {
    version: 1,
    groups: [],
    cards: [
      {
        id: "a",
        kind: "text",
        title: "",
        text: "https://example.com/audit",
        x: 120,
        y: 160,
        width: 240,
        height: 42,
        color: "#ffffff",
      },
      {
        id: "b",
        kind: "text",
        title: "",
        text: "目标卡片",
        x: 480,
        y: 160,
        width: 180,
        height: 80,
        color: "#ffffff",
      },
    ],
    connections: [
      {
        id: "c1",
        from: { card: "a", side: "e" },
        to: { card: "b", side: "w" },
        label: "关联",
      },
    ],
  });

  // Keyboard focus inside bottom toolbar uses inset outline (-3px), not outer clipped ring
  await page.keyboard.press("Tab");
  const toolbarBtn = page.locator(".bottom-tools .toolbar button").first();
  await toolbarBtn.focus();
  await page.keyboard.press("ArrowRight");
  const focusedTool = page.locator(".bottom-tools .toolbar button:focus-visible");
  await expect(focusedTool).toHaveCSS("outline-offset", "-3px");
  await snap(page, "light-focus-inset");

  // SVG connection hit keeps outline: none when keyboard-focused
  const hit = page.locator(".connection-hit").first();
  await hit.focus();
  await expect(hit).toHaveCSS("outline-style", "none");

  // Link icon button opens menu on plain left-click
  const linkIcon = page.getByRole("button", { name: "链接选项" });
  await linkIcon.click();
  await expect(page.getByRole("menuitem", { name: "取消链接" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Marquee z-index layers above cards
  const box = (await page.locator(".canvas").boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 260, { steps: 5 });
  const marqueeZ = await page
    .locator(".marquee")
    .evaluate((el) => Number(getComputedStyle(el).zIndex));
  const cardZ = await page
    .locator('[data-card-id="a"]')
    .evaluate((el) => Number(getComputedStyle(el).zIndex));
  expect(marqueeZ).toBeGreaterThan(cardZ);
  await page.mouse.up();
});

test("dark mode, custom light cards, games, Mermaid, PinBar non-overlap, English i18n and ShareViewer visual QA", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("yua-preferences"))
      localStorage.setItem(
        "yua-preferences",
        JSON.stringify({ language: "zh", theme: "dark" }),
      );
  });
  await page.goto("/");
  await expect(
    page.locator('meta[name="theme-color"]'),
  ).toHaveAttribute("content", "#0b111e");

  const pinColors = [undefined, "info", "warn", "danger"] as const;
  await importBoard(page, {
    version: 1,
    groups: [],
    cards: [
      {
        id: "p0",
        kind: "text",
        title: "",
        text: "深色默认卡片文本",
        pin: "快捷定位 1",
        pinColor: pinColors[0],
        x: 60,
        y: 90,
        width: 220,
        height: 90,
        color: "#ffffff",
      },
      {
        id: "p1",
        kind: "file",
        title: "sample.ts",
        text: "",
        pin: "快捷定位 2",
        pinColor: pinColors[1],
        mime: "text/plain",
        blob:
          "data:text/plain;base64," +
          Buffer.from(
            "// comment\nconst count = 42;\nexport function greet(name: string) {\n  return `hello ${name}`;\n}\n",
          ).toString("base64"),
        x: 310,
        y: 90,
        width: 260,
        height: 150,
        color: "#fef9c3",
      },
      {
        id: "p2",
        kind: "mermaid",
        title: "Mermaid",
        text: "flowchart LR\n  A[深色主题] --> B[清晰可读]",
        pin: "快捷定位 3",
        pinColor: pinColors[2],
        x: 600,
        y: 90,
        width: 280,
        height: 150,
        color: "#ffffff",
      },
      {
        id: "p3",
        kind: "minesweeper",
        title: "扫雷",
        text: JSON.stringify({
          kind: "minesweeper",
          mines: [0, 5, 12, 20, 31, 40, 52, 60, 71, 80],
          flags: [0],
          open: [40],
        }),
        pin: "快捷定位 4",
        pinColor: pinColors[3],
        x: 60,
        y: 260,
        width: 260,
        height: 310,
        color: "#ffffff",
      },
      {
        id: "p4",
        kind: "2048",
        title: "2048",
        text: JSON.stringify({
          kind: "2048",
          tiles: [2, 4, 8, 16, 32, 64, 128, 256, 0, 0, 2, 4, 0, 0, 0, 0],
          score: 512,
        }),
        pin: "快捷定位 5",
        pinColor: pinColors[0],
        x: 340,
        y: 260,
        width: 260,
        height: 310,
        color: "#ffffff",
      },
      {
        id: "p5",
        kind: "file",
        title: "archive.bin",
        text: "",
        pin: "快捷定位 6",
        pinColor: pinColors[1],
        mime: "application/octet-stream",
        blob: "data:application/octet-stream;base64,AAECAw==",
        x: 620,
        y: 260,
        width: 220,
        height: 150,
        color: "#ffffff",
      },
      {
        id: "p6",
        kind: "text",
        title: "",
        text: "已遮罩内容",
        masked: true,
        pin: "快捷定位 7",
        pinColor: pinColors[2],
        x: 620,
        y: 430,
        width: 220,
        height: 110,
        color: "#ffffff",
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `p${i + 7}`,
        kind: "text",
        title: "",
        text: `附加节点 ${i + 7}`,
        pin: `快捷定位 ${i + 8}`,
        pinColor: pinColors[(i + 3) % 4],
        x: 920,
        y: 90 + i * 85,
        width: 160,
        height: 64,
        color: "#ffffff",
      })),
    ],
  });

  // Verify dark mode non-light file preview, dark masked card, and dark relax games
  await expect(page.locator('[data-card-id="p5"] .file-preview')).toHaveCSS(
    "background-color",
    "rgb(34, 48, 74)",
  );
  await expect(page.locator('[data-card-id="p6"]')).toHaveCSS(
    "background-color",
    "rgb(43, 48, 59)",
  );
  await expect(page.locator('[data-card-id="p4"] .tile-board')).toHaveCSS(
    "background-color",
    "rgb(39, 50, 68)",
  );
  // Custom light card in dark mode restores dark comment/syntax color
  await expect(
    page.locator('[data-card-id="p1"] [data-code-state="ready"]'),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-card-id="p1"] .hljs-comment')).toHaveCSS(
    "color",
    "rgb(100, 116, 139)",
  );
  // Wait for Mermaid diagram to render in dark mode
  await expect(
    page.locator('[data-card-id="p2"] .markdown-diagram svg'),
  ).toBeVisible();
  await snap(page, "dark-desktop-canvas");

  // Verify PinBar does NOT overlap zoom-controls / help-button on landscape 844x390 and narrow 320x568
  const overlaps = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) =>
    a.x < b.x + b.width - 0.5 &&
    a.x + a.width > b.x + 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    a.y + a.height > b.y + 0.5;
  for (const vp of [
    { width: 844, height: 390, name: "dark-landscape-844x390" },
    { width: 320, height: 568, name: "dark-phone-320x568" },
  ]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const pinBox = (await page.locator(".pin-bar").boundingBox())!;
    const zoomBox = (await page.locator(".zoom-controls").boundingBox())!;
    const helpBox = (await page.locator(".help-button").boundingBox())!;
    expect(overlaps(pinBox, zoomBox)).toBe(false);
    expect(overlaps(pinBox, helpBox)).toBe(false);
    await snap(page, vp.name);
  }

  // English dark mode: 3D view uses translated labels & ? does not open HelpDialog behind 3D view
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    localStorage.setItem(
      "yua-preferences",
      JSON.stringify({ language: "en", theme: "dark" }),
    );
  });
  await page.reload();
  await page.locator(".minimap-layer-view").click({ force: true });
  const stage3d = page.getByTestId("canvas3d-stage");
  await expect(stage3d).toBeVisible();
  await expect(page.locator(".canvas3d-layer-title").first()).toContainText(
    "Root canvas",
  );
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Help" })).toHaveCount(0);
  await snap(page, "dark-en-3d");
  await page.keyboard.press("Escape");
  await expect(stage3d).toHaveCount(0);

  // ShareViewer dark mode: connection label is light-colored, zoom steps +-20%, percentage button resets to 100%
  await page.route("**/api/shares/resolve", (r) =>
    r.fulfill({
      json: {
        snapshot: {
          version: 1,
          groups: [],
          cards: [
            {
              id: "s1",
              kind: "text",
              title: "",
              text: "Share A",
              x: 80,
              y: 120,
              width: 180,
              height: 80,
              color: "#ffffff",
            },
            {
              id: "s2",
              kind: "text",
              title: "",
              text: "Share B",
              x: 420,
              y: 120,
              width: 180,
              height: 80,
              color: "#ffffff",
            },
          ],
          connections: [
            {
              id: "sc1",
              from: { card: "s1", side: "e" },
              to: { card: "s2", side: "w" },
              label: "Visible Link",
            },
          ],
        },
      },
    }),
  );
  await page.goto("/#/s/" + "b".repeat(64));
  await expect(page.getByText("Share A")).toBeVisible();
  await expect(page.locator(".share-connections text")).toHaveCSS(
    "fill",
    "rgb(248, 250, 252)",
  );
  const pctBtn = page.locator(".share-zoom .zoom-percentage");
  await expect(pctBtn).toHaveText("100%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(pctBtn).toHaveText("120%");
  await pctBtn.click();
  await expect(pctBtn).toHaveText("100%");
  await snap(page, "dark-en-share");
});

test("touch tap selects and double-tap opens a scrollable Markdown card without breaking scroll", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 430, height: 860 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await importBoard(page, {
    version: 1,
    groups: [],
    cards: [
      {
        id: "md1",
        kind: "file",
        title: "long.md",
        text: "",
        mime: "text/markdown",
        blob:
          "data:text/markdown;base64," +
          Buffer.from(
            Array.from({ length: 40 }, (_, i) => `## Section ${i + 1}\n\nParagraph content ${i + 1}\n`).join("\n"),
          ).toString("base64"),
        x: 40,
        y: 100,
        width: 340,
        height: 280,
        color: "#ffffff",
      },
    ],
  });
  const card = page.locator('[data-card-id="md1"]');
  const preview = card.locator(".markdown-file-preview");
  await expect(preview).toBeVisible();
  const box = (await preview.boundingBox())!;
  // Stationary tap selects the scrollable card
  await page.touchscreen.tap(box.x + 80, box.y + 80);
  await expect(card).toHaveClass(/selected/);
  // Double-tap opens detail modal
  await page.touchscreen.tap(box.x + 80, box.y + 80);
  await expect(page.getByRole("dialog", { name: "内容详情" })).toBeVisible();
  await context.close();
});

import { test, expect, type Page } from "@playwright/test";
import { mockMiniature } from "./miniature-fixture";

const note = (id: string, x = 80, y = 100) => ({
  id,
  kind: "text",
  title: "",
  text: id,
  x,
  y,
  width: 200,
  height: 140,
  color: "#ffffff",
});
const scene = "https://atlanmatrix.github.io/codex-playground/city/";
const fixture = () => ({
  version: 1,
  id: "root",
  groups: [],
  cards: [
    note("根文本"),
    {
      ...note("project", 400),
      kind: "canvas",
      title: "项目",
      canvas: {
        version: 1,
        id: "project-board",
        groups: [
          {
            id: "g",
            name: "资料组",
            bounds: { x: 50, y: 50, width: 900, height: 650 },
          },
        ],
        cards: [
          { ...note("深层文本", 1600, 1200), text: "深层文本内容" },
          {
            ...note("todo", 100, 100),
            kind: "todo",
            title: "任务列表",
            tasks: [{ id: "task", text: "待办内容", done: false }],
          },
          {
            ...note("file", 400, 100),
            kind: "file",
            title: "readme.txt",
            text: "",
            blob: "data:text/plain;base64,SGVsbG8gM0Q=",
          },
          {
            ...note("image", 700, 100),
            kind: "image",
            title: "pixel.png",
            text: "",
            blob: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          },
          {
            ...note("miniature", 100, 400),
            kind: "miniature",
            title: "城市场景",
            text: scene,
          },
          {
            ...note("nested", 400, 400),
            kind: "canvas",
            title: "下一层",
            canvas: {
              version: 1,
              id: "nested-board",
              groups: [],
              cards: [note("孙级文本")],
            },
          },
        ],
        connections: [
          {
            id: "link",
            from: { card: "todo", side: "e", task: "task" },
            to: { card: "file", side: "w" },
            label: "相关资料",
          },
        ],
      },
    },
    {
      ...note("sibling", 700),
      kind: "canvas",
      title: "另一个项目",
      canvas: {
        version: 1,
        id: "sibling-board",
        groups: [],
        cards: [note("同级内容")],
      },
    },
  ],
});

async function setup(page: Page, target?: string) {
  await mockMiniature(page);
  const data: any = fixture();
  if (target) {
    data.cards = data.cards.slice(0, 2);
    const child = data.cards[1].canvas;
    child.cards = child.cards.filter((card: any) => card.id === target);
    child.groups = [];
    child.connections = [];
  }
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.getByTestId("import").setInputFiles({
    name: "hierarchy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(target ? 2 : 3);
}
async function open(page: Page) {
  await page.getByTestId("minimap").click({ button: "right" });
  await page.getByRole("menuitem", { name: "分层视图", exact: true }).click();
  await expect(page.getByRole("region", { name: "3D 画布预览" })).toBeVisible();
  await expect(page).toHaveURL(/#\/3d$/);
}
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    // @ts-expect-error Vite source module for browser integration tests.
    const { readBoard, exportBoard } = await import("/src/storage.ts");
    return JSON.parse(await exportBoard(await readBoard()));
  });
}
async function saved(page: Page) {
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
}

test("minimap context menu opens an exploded hierarchy with static components, groups and links", async ({
  page,
}) => {
  await setup(page);
  const beforeView = await page.locator(".world").getAttribute("style");
  await page.getByTestId("minimap").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "分层视图" })).toBeVisible();
  expect(await page.locator(".world").getAttribute("style")).toBe(beforeView);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByTestId("minimap").focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "分层视图" }).click();
  await expect(page.locator(".canvas3d-layer")).toHaveCount(4);
  expect(
    await page
      .locator(".canvas3d-layer")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-depth"))),
  ).toEqual(["0", "1", "2", "1"]);
  await expect(page.locator(".canvas3d-component")).toHaveCount(11);
  await expect(page.locator(".canvas3d-group")).toHaveCount(1);
  await expect(page.locator(".canvas3d-hierarchy-link")).toHaveCount(3);
  await expect(page.locator(".canvas3d-connections text")).toHaveText(
    "相关资料",
  );
  await expect(
    page.locator(".canvas3d-connections marker path").first(),
  ).toHaveCSS("fill", "rgb(148, 163, 184)");
  await expect(page.locator(".canvas3d-page iframe")).toHaveCount(0);
  await expect(page.locator(".app")).toHaveAttribute("inert", "");
  await page.screenshot({ path: "/tmp/yua-canvas3d-hierarchy.png" });
  await page.getByRole("button", { name: "退出预览", exact: true }).click();
  await expect(page.locator(".canvas3d-page")).toHaveCount(0);
  expect(await page.locator(".world").getAttribute("style")).toBe(beforeView);
});

test("hovering the minimap reveals a layer button that opens 3D without panning", async ({
  page,
}) => {
  await setup(page);
  await page.mouse.move(1200, 400);
  const trigger = page.getByRole("button", { name: "分层视图", exact: true });
  await expect(trigger).toBeHidden();
  const beforeView = await page.locator(".world").getAttribute("style");
  await page.getByTestId("minimap").hover();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("region", { name: "3D 画布预览" })).toBeVisible();
  await expect(page).toHaveURL(/#\/3d$/);
  await page.getByRole("button", { name: "退出预览", exact: true }).click();
  expect(await page.locator(".world").getAttribute("style")).toBe(beforeView);
  await page.mouse.move(1200, 400);
  await expect(trigger).toBeHidden();
  await page.getByTestId("minimap").focus();
  await expect(trigger).toBeVisible();
});

test("orbit follows mouse axes, clamps pitch to 180 degrees, and keeps only two top-right actions", async ({
  page,
}) => {
  await setup(page);
  await saved(page);
  const original = await snapshot(page);
  await open(page);
  await expect(page.locator(".canvas3d-page button")).toHaveCount(2);
  await expect(
    page.locator(
      ".canvas3d-sidebar,.canvas3d-tools,.canvas3d-hint, .canvas3d-header",
    ),
  ).toHaveCount(0);
  const actions = (await page.locator(".canvas3d-actions").boundingBox())!;
  expect(actions.x + actions.width).toBeGreaterThan(1200);
  expect(actions.y).toBeLessThan(30);
  const sceneView = page.getByTestId("canvas3d-scene"),
    initial = await sceneView.getAttribute("style");
  const root = page.locator('[data-depth="0"]'),
    child = page.locator('[data-depth="1"]').first(),
    grandchild = page.locator('[data-depth="2"]');
  const center = async (node: typeof root) => {
    const box = (await node.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const originalCenter = await center(root);
  expect(originalCenter.y).toBeLessThan((await center(child)).y);
  expect((await center(child)).y).toBeLessThan((await center(grandchild)).y);
  expect(
    await child.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).m43,
    ),
  ).toBe(-220);
  await page.mouse.move(40, 60);
  await page.mouse.down();
  await page.mouse.move(120, 60, { steps: 8 });
  await page.mouse.up();
  expect(Number(await sceneView.getAttribute("data-yaw"))).toBeGreaterThan(-18);
  expect((await center(root)).x).toBeGreaterThan(originalCenter.x);
  await page.getByRole("button", { name: "重置 3D 视角" }).click();
  await page.mouse.move(40, 60);
  await page.mouse.down();
  await page.mouse.move(40, 140, { steps: 8 });
  await page.mouse.up();
  expect(Number(await sceneView.getAttribute("data-pitch"))).toBeLessThan(48);
  expect((await center(root)).y).toBeGreaterThan(originalCenter.y);
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(40, 60);
    await page.mouse.down();
    await page.mouse.move(40, 660, { steps: 5 });
    await page.mouse.up();
  }
  await expect(sceneView).toHaveAttribute("data-pitch", "-90");
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(40, 660);
    await page.mouse.down();
    await page.mouse.move(40, 60, { steps: 5 });
    await page.mouse.up();
  }
  await expect(sceneView).toHaveAttribute("data-pitch", "90");
  await page.mouse.wheel(0, -250);
  await expect(sceneView).not.toHaveAttribute("data-zoom", "1");
  await page.getByRole("button", { name: "重置 3D 视角" }).click();
  await expect(sceneView).toHaveAttribute("style", initial!);
  await page.mouse.move(40, 60);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(70, 90, { steps: 5 });
  await page.mouse.up({ button: "right" });
  expect(await sceneView.getAttribute("style")).toContain(
    "translate3d(30px, 30px",
  );
  await page.keyboard.press("n");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas3d-page")).toHaveCount(0);
  expect(await snapshot(page)).toEqual(original);
});

for (const id of ["深层文本", "todo", "file", "image", "miniature", "nested"]) {
  test(`double click ${id} navigates to its canvas and invokes its normal action`, async ({
    page,
  }) => {
    await setup(page, id);
    await open(page);
    await page.locator(`[data-3d-card="${id}"]`).dblclick();
    await expect(page.locator(".canvas3d-page")).toHaveCount(0);
    await expect(page.locator(".canvas-navigation")).toHaveText(
      id === "nested" ? "下一层" : "项目",
    );
    if (id === "深层文本") {
      await expect(page.getByRole("textbox", { name: "文本内容" })).toHaveValue(
        "深层文本内容",
      );
      await expect(
        page.getByRole("textbox", { name: "文本内容" }),
      ).toBeInViewport();
    } else if (id === "todo")
      await expect(
        page.getByRole("textbox", { name: "任务内容 1" }),
      ).toHaveValue("待办内容");
    else if (id === "miniature")
      await expect(
        page.locator('.miniature[data-active="true"]'),
      ).toBeVisible();
    else if (id === "nested")
      await expect(page.locator('[data-card-id="孙级文本"]')).toBeVisible();
    else await expect(page.getByRole("dialog")).toBeVisible();
    if (id === "file")
      await expect(page.locator(".detail-content")).toContainText("Hello 3D");
    if (id === "image")
      await expect(page.locator(".detail-image")).toBeVisible();
  });
}

test("direct route reloads from local storage, browser Back and keyboard component activation work", async ({
  page,
}) => {
  await setup(page);
  await saved(page);
  await open(page);
  await page.goBack();
  await expect(page.locator(".canvas3d-page")).toHaveCount(0);
  await page.goForward();
  await expect(page.locator(".canvas3d-layer")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".canvas3d-layer")).toHaveCount(4);
  const component = page.locator('[data-3d-card="同级内容"]');
  await component.focus();
  await component.press("Enter");
  await expect(page.locator(".canvas-navigation")).toHaveText("另一个项目");
  await expect(page.getByRole("textbox", { name: "文本内容" })).toHaveValue(
    "同级内容",
  );
});

test("empty mobile preview supports keyboard rotation and leaves native canvas editing intact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/3d");
  await expect(page.locator(".canvas3d-layer")).toHaveCount(1);
  await expect(page.locator(".canvas3d-page button")).toHaveCount(2);
  const sceneView = page.getByTestId("canvas3d-scene"),
    before = await sceneView.getAttribute("style");
  await page.keyboard.press("ArrowLeft");
  expect(await sceneView.getAttribute("style")).not.toBe(before);
  await page.keyboard.press("+");
  await expect(sceneView).toHaveAttribute("data-zoom", "1.2");
  await page.screenshot({ path: "/tmp/yua-canvas3d-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  await expect(page.getByRole("textbox", { name: "文本内容" })).toBeVisible();
});

test("two-finger zoom and pan, cancellation and suspended scene iframes work", async ({
  page,
  context,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "进入子画布 项目", exact: true })
    .click();
  await expect(page.locator(".miniature-cover")).toBeVisible();
  await page
    .locator(".miniature-model")
    .dblclick({ position: { x: 100, y: 100 } });
  await expect(page.locator(".miniature-frame")).toHaveCount(1);
  await open(page);
  await expect(page.locator("iframe")).toHaveCount(0);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const points = (delta: number) => [
    { x: 300 - delta, y: 300, id: 1 },
    { x: 500 + delta, y: 300 + delta, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(0),
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: points(40),
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByTestId("canvas3d-scene")).not.toHaveAttribute(
    "data-zoom",
    "1",
  );
  const sceneView = page.getByTestId("canvas3d-scene");
  const before = await sceneView.getAttribute("style");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.move(900, 500);
  expect(await sceneView.getAttribute("style")).toBe(before);
  await page.getByRole("button", { name: "退出预览", exact: true }).click();
  await expect(page.locator(".miniature-cover")).toBeVisible();
  await expect(page.locator(".miniature-frame")).toHaveCount(0);
  await expect(page.locator(".canvas-navigation")).toHaveText("项目");
});

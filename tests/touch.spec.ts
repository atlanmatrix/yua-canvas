import { test, expect, type Page } from "@playwright/test";
test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 1000, height: 820 },
});
const camera = (page: Page, selector = ".world") =>
  page.locator(selector).evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, z: m.a };
  });
async function setup(page: Page, agent = false, group = false) {
  await page.goto("/");
  const state = {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    protocol: "responses",
    instructions: "",
    messages: Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `消息 ${i}\n这是用于验证触屏滚动的对话内容。\n内容不会触发画布平移。`,
    })),
  };
  await page.getByTestId("import").setInputFiles({
    name: "touch.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: group
          ? [
              {
                id: "g",
                name: "触屏分组",
                bounds: { x: 30, y: 30, width: 800, height: 220 },
              },
            ]
          : [],
        cards: agent
          ? [
              {
                id: "agent",
                kind: "agent",
                title: "Agent",
                text: JSON.stringify(state),
                x: 100,
                y: 80,
                width: 400,
                height: 560,
                displayMode: "large",
                color: "#ffffff",
              },
            ]
          : [
              {
                id: "a",
                group: group ? "g" : undefined,
                kind: "text",
                title: "",
                text: "触屏节点",
                x: 100,
                y: 100,
                width: 180,
                height: 80,
                color: "#ffffff",
              },
              {
                id: "b",
                group: group ? "g" : undefined,
                kind: "text",
                title: "",
                text: "目标节点",
                x: 600,
                y: 100,
                width: 180,
                height: 80,
                color: "#ffffff",
              },
            ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
}
async function touches(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  return {
    send: (
      type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
      points: { id: number; x: number; y: number }[],
    ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points }),
    close: () => cdp.detach(),
  };
}
const layout = (page: Page) =>
  page.locator(".card").evaluateAll((els) =>
    els.map((el) => ({
      id: (el as HTMLElement).dataset.cardId,
      left: (el as HTMLElement).style.left,
      top: (el as HTMLElement).style.top,
    })),
  );

test("one finger pans empty canvas, two fingers zoom around their midpoint, and releasing one finger never jumps or moves nodes", async ({
  page,
}) => {
  await setup(page);
  const touch = await touches(page),
    original = await layout(page),
    before = await camera(page);
  await touch.send("touchStart", [{ id: 1, x: 30, y: 300 }]);
  await touch.send("touchMove", [{ id: 1, x: 80, y: 340 }]);
  await touch.send("touchEnd", []);
  const pan = await camera(page);
  expect(pan.x).toBeCloseTo(before.x + 50, 1);
  expect(pan.y).toBeCloseTo(before.y + 40, 1);
  await expect(page.locator(".marquee")).toHaveCount(0);
  expect(await layout(page)).toEqual(original);
  const a = { id: 1, x: 300, y: 560 },
    b = { id: 2, x: 500, y: 560 };
  await touch.send("touchStart", [a]);
  await touch.send("touchStart", [a, b]);
  await touch.send("touchMove", [
    { ...a, x: 250, y: 530 },
    { ...b, x: 550, y: 530 },
  ]);
  const zoom = await camera(page);
  expect(zoom.z).toBeCloseTo(pan.z * 1.5, 3);
  expect((400 - zoom.x) / zoom.z).toBeCloseTo((400 - pan.x) / pan.z, 2);
  expect((530 - zoom.y) / zoom.z).toBeCloseTo((560 - pan.y) / pan.z, 2);
  await touch.send("touchEnd", [{ ...b, x: 550, y: 530 }]);
  await touch.send("touchMove", [{ ...b, x: 600, y: 590 }]);
  expect(await camera(page)).toEqual(zoom);
  await touch.send("touchEnd", []);
  expect(await camera(page)).toEqual(zoom);
  expect(await layout(page)).toEqual(original);
  await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  expect((await camera(page)).z).toBeCloseTo(zoom.z, 3);
  await touch.close();
});

test("touch drags a node, double-tap edits once, long-press opens node and background menus, and Agent is creatable without a mouse", async ({
  page,
}) => {
  await setup(page);
  const touch = await touches(page),
    card = page.locator('.card[data-card-id="a"]');
  let r = (await card.boundingBox())!;
  const start = { id: 1, x: r.x + 50, y: r.y + 25 },
    before = await layout(page),
    z = (await camera(page)).z;
  await touch.send("touchStart", [start]);
  await touch.send("touchMove", [
    { ...start, x: start.x + 40, y: start.y + 30 },
  ]);
  await touch.send("touchEnd", []);
  const moved = (await layout(page))[0];
  expect(parseFloat(moved.left)).toBeCloseTo(
    parseFloat(before[0].left) + 40 / z,
    1,
  );
  r = (await card.boundingBox())!;
  await page.touchscreen.tap(r.x + 45, r.y + 25);
  await page.touchscreen.tap(r.x + 45, r.y + 25);
  await expect(page.getByRole("textbox", { name: "文本内容" })).toHaveCount(1);
  await page.getByRole("textbox", { name: "文本内容" }).fill("触屏已编辑");
  await page.touchscreen.tap(30, 270);
  await expect(page.getByRole("textbox", { name: "文本内容" })).toHaveCount(0);
  r = (await card.boundingBox())!;
  await touch.send("touchStart", [{ id: 1, x: r.x + 45, y: r.y + 25 }]);
  await expect(
    page.getByRole("menuitem", { name: "下载", exact: true }),
  ).toBeVisible();
  await touch.send("touchEnd", []);
  await page.touchscreen.tap(30, 270);
  await touch.send("touchStart", [{ id: 1, x: 30, y: 270 }]);
  await expect(
    page.getByRole("menuitem", { name: "新建", exact: true }),
  ).toBeVisible();
  await touch.send("touchEnd", []);
  await page.getByRole("menuitem", { name: "新建", exact: true }).tap();
  await page.getByRole("menuitem", { name: "Agent", exact: true }).tap();
  await expect(page.locator(".card-agent")).toHaveCount(1);
  await expect(page.locator(".card-agent .port-e")).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "配置 Agent", exact: true }).tap();
  await page.getByLabel("API Key", { exact: true }).fill("fake-touch-key");
  await page.getByRole("button", { name: "保存配置", exact: true }).tap();
  await expect(
    page.getByRole("textbox", { name: "发送给 Agent" }),
  ).toBeVisible();
  await touch.close();
});

test("double-tapping empty canvas creates exactly one text and touch ports make magnetic connections", async ({
  page,
}) => {
  await setup(page);
  await page.touchscreen.tap(30, 270);
  await page.touchscreen.tap(30, 270);
  await expect(page.getByRole("textbox", { name: "文本内容" })).toHaveCount(1);
  await expect(page.locator(".card")).toHaveCount(3);
  await page.getByRole("textbox", { name: "文本内容" }).fill("新触屏文本");
  await page.touchscreen.tap(30, 600);
  const a = (await page
      .locator('.card[data-card-id="a"] .port-e')
      .boundingBox())!,
    b = (await page.locator('.card[data-card-id="b"] .port-w').boundingBox())!;
  expect(a.width).toBeGreaterThanOrEqual(28);
  const touch = await touches(page);
  await touch.send("touchStart", [
    { id: 1, x: a.x + a.width / 2, y: a.y + a.height / 2 },
  ]);
  await touch.send("touchMove", [
    { id: 1, x: b.x + b.width / 2 - 30, y: b.y + b.height / 2 },
  ]);
  await expect(page.locator(".target-active")).toHaveCount(1);
  await touch.send("touchEnd", []);
  await expect(page.locator(".connection-path:not(.draft)")).toHaveCount(1);
  await touch.close();
});

test("touch scrolls Agent history and settings without moving the canvas, inputs remain focusable, and pinch cancels paint", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await setup(page, true);
  const touch = await touches(page),
    before = await camera(page),
    original = await layout(page);
  const log = page.getByRole("log", { name: "对话记录" }),
    r = (await log.boundingBox())!;
  await log.evaluate((el) => {
    el.scrollTop = 0;
  });
  const start = { id: 1, x: r.x + r.width / 2, y: r.y + r.height * 0.8 };
  await touch.send("touchStart", [start]);
  await touch.send("touchMove", [{ ...start, y: start.y - 100 }]);
  await touch.send("touchEnd", []);
  expect(await log.evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
  expect(await camera(page)).toEqual(before);
  expect(await layout(page)).toEqual(original);
  await page.getByRole("textbox", { name: "发送给 Agent" }).tap();
  await expect(
    page.getByRole("textbox", { name: "发送给 Agent" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Agent 设置", exact: true }).tap();
  await page.getByLabel("API Key", { exact: true }).tap();
  await expect(page.getByLabel("API Key", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "返回", exact: true }).tap();
  await page.getByRole("button", { name: "画笔", exact: true }).tap();
  const a = { id: 1, x: 30, y: 280 },
    b = { id: 2, x: 130, y: 280 };
  await touch.send("touchStart", [a]);
  await touch.send("touchMove", [{ ...a, y: 300 }]);
  await touch.send("touchStart", [{ ...a, y: 300 }, b]);
  await touch.send("touchMove", [
    { ...a, x: 20, y: 320 },
    { ...b, x: 150, y: 300 },
  ]);
  await touch.send("touchEnd", []);
  await expect(page.locator(".paint-strokes path")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/yua-touch-agent.png" });
  await touch.close();
});

test("touch cancellation clears pending menus and pinch state; read-only shares support two-finger zoom", async ({
  page,
}) => {
  await setup(page);
  const touch = await touches(page);
  await touch.send("touchStart", [{ id: 1, x: 30, y: 270 }]);
  await touch.send("touchCancel", []);
  await page.waitForTimeout(600);
  await expect(page.getByRole("menu")).toHaveCount(0);
  const a = { id: 1, x: 300, y: 560 },
    b = { id: 2, x: 500, y: 560 };
  await touch.send("touchStart", [a]);
  await touch.send("touchStart", [a, b]);
  await touch.send("touchCancel", []);
  const before = await camera(page);
  await touch.send("touchStart", [a]);
  await touch.send("touchMove", [{ ...a, x: 320, y: 580 }]);
  await touch.send("touchEnd", []);
  expect((await camera(page)).x).toBeCloseTo(before.x + 20, 1);
  await touch.close();
  await page.route("**/api/shares/resolve", (route) =>
    route.fulfill({
      json: {
        snapshot: {
          version: 1,
          cards: [
            {
              id: "read",
              kind: "text",
              title: "",
              text: "只读触屏",
              x: 100,
              y: 100,
              color: "#ffffff",
            },
          ],
          groups: [],
        },
      },
    }),
  );
  await page.goto("/#/s/" + "a".repeat(64));
  await expect(page.getByText("只读触屏")).toBeVisible();
  const share = await touches(page),
    initial = await camera(page, ".share-world");
  await share.send("touchStart", [a]);
  await share.send("touchStart", [a, b]);
  await share.send("touchMove", [
    { ...a, x: 250 },
    { ...b, x: 550 },
  ]);
  await share.send("touchEnd", []);
  expect((await camera(page, ".share-world")).z).toBeCloseTo(
    initial.z * 1.5,
    2,
  );
  await share.close();
});

test("small finger jitter preserves node position during long-press, and a second finger switches node dragging to viewport zoom", async ({
  page,
}) => {
  await setup(page);
  const touch = await touches(page),
    original = await layout(page);
  const r = (await page.locator('.card[data-card-id="a"]').boundingBox())!,
    a = { id: 1, x: r.x + 50, y: r.y + 30 };
  await touch.send("touchStart", [a]);
  await touch.send("touchMove", [{ ...a, x: a.x + 3, y: a.y + 2 }]);
  await expect(
    page.getByRole("menuitem", { name: "下载", exact: true }),
  ).toBeVisible();
  await touch.send("touchEnd", []);
  expect(await layout(page)).toEqual(original);
  await page.touchscreen.tap(30, 270);
  const before = await camera(page),
    b = { id: 2, x: a.x + 160, y: a.y };
  await touch.send("touchStart", [a]);
  await touch.send("touchStart", [a, b]);
  await touch.send("touchMove", [
    { ...a, x: a.x - 30 },
    { ...b, x: b.x + 30 },
  ]);
  await touch.send("touchEnd", []);
  expect((await camera(page)).z).toBeGreaterThan(before.z);
  expect(await layout(page)).toEqual(original);
  await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
  await touch.close();
});

test("long-press on a group title opens its menu without dragging its children", async ({
  page,
}) => {
  await setup(page, false, true);
  const before = await layout(page),
    title = page.getByRole("button", {
      name: "拖动分组 触屏分组",
      exact: true,
    });
  const r = (await title.boundingBox())!,
    touch = await touches(page);
  await touch.send("touchStart", [
    { id: 1, x: r.x + 60, y: r.y + r.height / 2 },
  ]);
  await expect(
    page.getByRole("menuitem", { name: "解散分组", exact: true }),
  ).toBeVisible();
  await touch.send("touchEnd", []);
  expect(await layout(page)).toEqual(before);
  await touch.close();
});

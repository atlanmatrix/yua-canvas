import { test, expect, type Page } from "@playwright/test";
const camera = (page: Page, selector = ".world") =>
  page.locator(selector).evaluate((node) => {
    const m = new DOMMatrix(getComputedStyle(node).transform);
    return { x: m.e, y: m.f, z: m.a };
  });
const directions = [
  [-160, 0],
  [160, 0],
  [0, -160],
  [0, 160],
];
async function wheel(
  page: Page,
  selector: string,
  dx: number,
  dy: number,
  ctrlKey = false,
) {
  return page.locator(selector).evaluate(
    (node, args) => {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: args.dx,
        deltaY: args.dy,
        ctrlKey: args.ctrlKey,
        clientX: 700,
        clientY: 500,
      });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { dx, dy, ctrlKey },
  );
}

test("all four trackpad directions cancel browser defaults while panning and explicit browser Back remains usable", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (/passive.*preventDefault|preventDefault.*passive/i.test(m.text()))
      warnings.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    history.pushState(null, "", "?history=first");
    history.pushState(null, "", "?history=second");
  });
  for (const [dx, dy] of directions) {
    const before = await camera(page);
    expect(await wheel(page, ".canvas", dx, dy)).toBe(true);
    await expect
      .poll(() => camera(page))
      .toEqual({ ...before, x: before.x - dx, y: before.y - dy });
    await expect(page).toHaveURL(/history=second$/);
  }
  for (const selector of ["html", "body", ".canvas"])
    await expect(page.locator(selector)).toHaveCSS(
      "overscroll-behavior",
      "none",
    );
  const before = await camera(page);
  expect(await wheel(page, ".canvas", 0, -80, true)).toBe(true);
  await expect
    .poll(async () => (await camera(page)).z)
    .toBeGreaterThan(before.z);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({
    x: 0,
    y: 0,
  });
  expect(warnings).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/history=first$/);
});

test("native nested content scrolls in both axes and blocks overscroll at all four edges without moving the camera", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.locator(".canvas").evaluate((canvas) => {
    const scroll = document.createElement("div");
    scroll.setAttribute("data-testid", "scroll-content");
    scroll.style.cssText =
      "position:absolute;left:120px;top:140px;width:280px;height:180px;overflow:auto;background:white";
    const content = document.createElement("div");
    content.style.cssText = "width:1400px;height:1200px";
    content.textContent = "Native scrollable document";
    scroll.append(content);
    canvas.append(scroll);
  });
  const content = page.getByTestId("scroll-content"),
    before = await camera(page);
  await content.hover();
  await page.mouse.wheel(80, 100);
  await expect
    .poll(() => content.evaluate((n) => n.scrollTop))
    .toBeGreaterThan(0);
  await expect
    .poll(() => content.evaluate((n) => n.scrollLeft))
    .toBeGreaterThan(0);
  expect(await camera(page)).toEqual(before);
  for (const [dx, dy] of directions) {
    await content.evaluate(
      (node, args) => {
        node.scrollLeft = args.dx > 0 ? node.scrollWidth : 0;
        node.scrollTop = args.dy > 0 ? node.scrollHeight : 0;
      },
      { dx, dy },
    );
    expect(await wheel(page, '[data-testid="scroll-content"]', dx, dy)).toBe(
      true,
    );
    expect(await camera(page)).toEqual(before);
  }
  expect(
    await wheel(page, '[data-testid="scroll-content"]', 0, -40, true),
  ).toBe(true);
  await expect
    .poll(async () => (await camera(page)).z)
    .toBeGreaterThan(before.z);
});

test("Agent history keeps native vertical scrolling and traps exhausted trackpad gestures", async ({
  page,
}) => {
  await page.goto("/");
  const state = {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    protocol: "responses",
    instructions: "",
    messages: Array.from({ length: 24 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `消息 ${i}\n用于检查内部滚动。\n保留画布位置。`,
    })),
  };
  await page
    .getByTestId("import")
    .setInputFiles({
      name: "agent-scroll.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          groups: [],
          cards: [
            {
              id: "agent",
              kind: "agent",
              title: "Agent",
              text: JSON.stringify(state),
              x: 100,
              y: 80,
              width: 400,
              height: 500,
              displayMode: "large",
              color: "#ffffff",
            },
          ],
        }),
      ),
    });
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  const history = page.locator(".agent-messages");
  await expect(history).toBeVisible();
  await history.evaluate((n) => (n.scrollTop = 0));
  const before = await camera(page);
  await history.hover();
  await page.mouse.wheel(0, 100);
  await expect
    .poll(() => history.evaluate((n) => n.scrollTop))
    .toBeGreaterThan(0);
  expect(await camera(page)).toEqual(before);
  await history.evaluate((n) => (n.scrollTop = n.scrollHeight));
  expect(await wheel(page, ".agent-messages", 0, 120)).toBe(true);
  expect(await wheel(page, ".agent-messages", 160, 0)).toBe(true);
  expect(await camera(page)).toEqual(before);
});

test("read-only shared canvas installs the guard after asynchronous loading", async ({
  page,
}) => {
  await page.route("**/api/shares/resolve", (route) =>
    route.fulfill({
      json: {
        snapshot: {
          version: 1,
          groups: [],
          cards: [
            {
              id: "note",
              kind: "text",
              title: "",
              text: "Shared",
              x: 100,
              y: 100,
              width: 200,
              height: 100,
              color: "#ffffff",
            },
          ],
        },
      },
    }),
  );
  await page.goto("/#/s/" + "a".repeat(64));
  await expect(page.locator(".share-surface")).toBeVisible();
  for (const [dx, dy] of directions) {
    const before = await camera(page, ".share-world");
    expect(await wheel(page, ".share-surface", dx, dy)).toBe(true);
    await expect
      .poll(() => camera(page, ".share-world"))
      .toEqual({ ...before, x: before.x - dx, y: before.y - dy });
  }
  await expect(page.locator(".share-surface")).toHaveCSS(
    "overscroll-behavior",
    "none",
  );
  const before = await camera(page, ".share-world");
  expect(await wheel(page, ".share-surface", 0, -60, true)).toBe(true);
  await expect
    .poll(async () => (await camera(page, ".share-world")).z)
    .toBeGreaterThan(before.z);
});

test("3D canvas also cancels horizontal and vertical browser gestures", async ({
  page,
}) => {
  await page.goto("/#/3d");
  await expect(page.locator(".canvas3d-stage")).toBeVisible();
  for (const [dx, dy] of directions)
    expect(await wheel(page, ".canvas3d-stage", dx, dy)).toBe(true);
  await expect(page.locator(".canvas3d-stage")).toHaveCSS(
    "overscroll-behavior",
    "none",
  );
  await expect(page).toHaveURL(/#\/3d$/);
});

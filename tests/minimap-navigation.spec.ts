import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "map.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards: [
          {
            id: "a",
            kind: "text",
            title: "",
            text: "起点",
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            color: "#ffffff",
            group: "g",
          },
          {
            id: "b",
            kind: "text",
            title: "",
            text: "终点",
            x: 1000,
            y: 600,
            width: 200,
            height: 100,
            color: "#ffffff",
          },
        ],
        groups: [
          {
            id: "g",
            name: "分组",
            bounds: { x: -50, y: -50, width: 350, height: 250 },
          },
          {
            id: "empty",
            name: "空分组",
            bounds: { x: -300, y: 500, width: 200, height: 160 },
          },
        ],
        connections: [
          {
            id: "c",
            from: { card: "a", side: "e" },
            to: { card: "b", side: "w" },
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await page.getByRole("button", { name: "关闭提示" }).click();
}
async function camera(page: Page) {
  return page.locator(".world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform),
      canvas = el.parentElement!;
    return {
      x: m.e,
      y: m.f,
      z: m.a,
      centerX: (canvas.clientWidth / 2 - m.e) / m.a,
      centerY: (canvas.clientHeight / 2 - m.f) / m.d,
    };
  });
}
async function inverse(page: Page) {
  return page.getByTestId("minimap-world").evaluate((el) => {
    const m = (el as SVGGElement).getScreenCTM()!.inverse();
    return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
  });
}
async function expectAt(
  page: Page,
  matrix: Awaited<ReturnType<typeof inverse>>,
  point: { x: number; y: number },
) {
  const current = await camera(page);
  expect(current.centerX).toBeCloseTo(
    matrix.a * point.x + matrix.c * point.y + matrix.e,
    1,
  );
  expect(current.centerY).toBeCloseTo(
    matrix.b * point.x + matrix.d * point.y + matrix.f,
    1,
  );
}

test("dragging the overview pans continuously, retains element geometry and selection, stops on release and persists", async ({
  page,
}) => {
  await setup(page);
  await page.locator('.card[data-card-id="a"]').click();
  const map = page.getByTestId("minimap"),
    r = (await map.boundingBox())!;
  const matrix = await inverse(page),
    zoom = (await camera(page)).z;
  const geometry = () =>
    page
      .locator(".card,.group-boundary")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.cssText));
  const original = await geometry();
  const start = {
    x: Math.round(r.x + r.width * 0.3),
    y: Math.round(r.y + r.height * 0.35),
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expectAt(page, matrix, start);
  await expect(map).toHaveClass(/dragging/);
  await expect(page.locator(".canvas")).toHaveCSS("cursor", "grabbing");
  const to = {
    x: Math.round(r.x + r.width * 0.75),
    y: Math.round(r.y + r.height * 0.65),
  };
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expectAt(page, matrix, to);
  expect((await camera(page)).z).toBe(zoom);
  await expect(page.locator(".card.selected")).toHaveCount(1);
  expect(await geometry()).toEqual(original);
  // Capture also keeps the drag coherent if the pointer leaves the overview.
  const outside = {
    x: Math.round(r.x + r.width + 30),
    y: Math.round(r.y - 15),
  };
  await page.mouse.move(outside.x, outside.y, { steps: 5 });
  await expectAt(page, matrix, outside);
  await page.mouse.up();
  const after = await camera(page);
  await expect(map).not.toHaveClass(/dragging/);
  await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
  await page.mouse.move(to.x, to.y);
  expect(await camera(page)).toEqual(after);
  expect(await geometry()).toEqual(original);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect.poll(() => camera(page)).toEqual(after);
});

test("the gray canvas frame matches the full overview area across zoom, filters and resizes without intercepting input", async ({
  page,
}) => {
  await setup(page);
  const frame = page.getByTestId("minimap-boundary");
  const bounds = () =>
    frame.evaluate((el) => {
      return {
        x: parseFloat(el.getAttribute("x")!),
        y: parseFloat(el.getAttribute("y")!),
        width: parseFloat(el.getAttribute("width")!),
        height: parseFloat(el.getAttribute("height")!),
      };
    });
  const match = async () => {
    const actual = await bounds();
    const expected = await page.getByTestId("minimap-world").evaluate((el) => {
      const m = (el as SVGGElement).transform.baseVal.consolidate()!.matrix;
      return {
        x: -m.e / m.a,
        y: -m.f / m.d,
        width: 200 / m.a,
        height: 132 / m.d,
      };
    });
    for (const key of ["x", "y", "width", "height"] as const)
      expect(actual[key]).toBeCloseTo(expected[key], 2);
    await expect(frame).toHaveAttribute("vector-effect", "non-scaling-stroke");
    await expect(frame).toHaveCSS("stroke-width", "1px");
  };
  await expect(frame).toHaveCSS("stroke", "rgb(209, 213, 219)");
  await expect(frame).toHaveCSS("pointer-events", "none");
  await match();
  const initial = await bounds();
  await expect(page.getByTestId("card")).toHaveCount(2);
  expect(await bounds()).toEqual(initial);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await match();
  expect(await bounds()).toEqual(initial);
  await page.setViewportSize({ width: 390, height: 844 });
  await match();
  // The frame is only a projection guide and does not block empty-canvas input.
  await page.keyboard.press("-");
  await page.keyboard.press("-");
  await page.getByTestId("minimap").focus();
  await page.keyboard.press("Enter");
  await match();
  await page.screenshot({ path: "/tmp/yua-minimap-boundary-mobile.png" });
});

test("empty-board drags keep the initial mapping and release on cancellation, escape or blur", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  const map = page.getByTestId("minimap");
  await expect(page.getByTestId("minimap-boundary")).toHaveCount(0);
  for (const cancel of ["escape", "blur", "pointercancel", "lostcapture"]) {
    const r = (await map.boundingBox())!,
      matrix = await inverse(page);
    const start = { x: Math.round(r.x + 30), y: Math.round(r.y + 30) };
    const end = { x: Math.round(r.x + 90), y: Math.round(r.y + 60) };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await expectAt(page, matrix, end);
    if (cancel === "escape") await page.keyboard.press("Escape");
    if (cancel === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (cancel === "pointercancel")
      await map.dispatchEvent("pointercancel", { pointerId: 1 });
    if (cancel === "lostcapture") {
      await map.evaluate((el) => el.releasePointerCapture(1));
      // Chromium delivers pending capture loss before the next pointer event.
      await page.mouse.move(start.x, start.y);
    }
    await expect(map).not.toHaveClass(/dragging/);
    await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
    const stopped = await camera(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.up();
    expect(await camera(page)).toEqual(stopped);
  }
  await map.focus();
  const before = await camera(page);
  await page.keyboard.press("Space");
  expect((await camera(page)).centerX).toBeCloseTo(before.centerX, 1);
  expect((await camera(page)).centerY).toBeCloseTo(before.centerY, 1);
  await expect(page.getByTestId("card")).toHaveCount(0);
});

test.describe("touch overview", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test("touch dragging tracks the corresponding location without a release jump", async ({
    page,
  }) => {
    await setup(page);
    const map = page.getByTestId("minimap"),
      r = (await map.boundingBox())!,
      matrix = await inverse(page);
    const start = { x: Math.round(r.x + 25), y: Math.round(r.y + 25) },
      end = { x: Math.round(r.x + 95), y: Math.round(r.y + 55) };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    await expectAt(page, matrix, start);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [end],
    });
    await expectAt(page, matrix, end);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expectAt(page, matrix, end);
    await expect(map).not.toHaveClass(/dragging/);
    await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
    await cdp.detach();
  });
});

import { test, expect, type Page } from "@playwright/test";

const animationDuration = 1600;
const near = { x: 100, y: 180, width: 180, height: 100 };
const close = { ...near, x: 180 };
const middle = { ...near, x: 400 };
const edge = { ...near, x: 600 };
const peer = { x: -500, y: -300, width: 180, height: 100 };
const far = { x: 4200, y: 2600, width: 1400, height: 900 };
const group = { x: 3000, y: -1800, width: 900, height: 1000 };
async function setup(page: Page) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "animated-pins.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards: [
          ...[
            { id: "near", bounds: near },
            { id: "close", bounds: close },
            { id: "middle", bounds: middle },
            { id: "edge", bounds: edge },
            { id: "peer", bounds: peer },
            { id: "far", bounds: far },
          ].map(({ id, bounds }) => ({
            id,
            kind: "text",
            title: "",
            text: id,
            color: "#ffffff",
            pin: id,
            ...bounds,
          })),
          {
            id: "child",
            kind: "canvas",
            title: "子画布",
            text: "",
            x: 500,
            y: 200,
            width: 240,
            height: 180,
            color: "#ffffff",
            canvas: { version: 1, id: "child-board", cards: [], groups: [] },
          },
        ],
        groups: [{ id: "group", name: "分组", pin: "group", bounds: group }],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
}
const pin = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Pin 定位" }).getByRole("button", {
    name,
    exact: true,
  });
const view = (page: Page) =>
  page.locator(".world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, z: m.a };
  });
async function target(page: Page, bounds: typeof near) {
  const r = (await page.locator(".canvas").boundingBox())!;
  const z = Math.max(
    0.2,
    Math.min(
      1.2,
      (r.width - 120) / bounds.width,
      (r.height - 170) / bounds.height,
    ),
  );
  return {
    x: r.width / 2 - (bounds.x + bounds.width / 2) * z,
    y: r.height / 2 - (bounds.y + bounds.height / 2) * z,
    z,
  };
}
async function expectView(
  page: Page,
  expected: Awaited<ReturnType<typeof view>>,
) {
  const actual = await view(page);
  expect(actual.x).toBeCloseTo(expected.x, 2);
  expect(actual.y).toBeCloseTo(expected.y, 2);
  expect(actual.z).toBeCloseTo(expected.z, 4);
}

test("pins pan and zoom together with easing, retain content geometry and save the final view", async ({
  page,
}) => {
  await setup(page);
  await pin(page, "near").click();
  await page.clock.runFor(animationDuration + 50);
  const geometry = () =>
    page
      .getByTestId("card")
      .evaluateAll((cards) =>
        cards.map((c) => (c as HTMLElement).style.cssText),
      );
  const original = await geometry();
  const from = await view(page);
  const to = await target(page, far);
  const area = (await page.locator(".canvas").boundingBox())!;
  const center = (v: typeof from) => ({
    x: (area.width / 2 - v.x) / v.z,
    y: (area.height / 2 - v.y) / v.z,
  });
  const fromCenter = center(from),
    toCenter = center(to);
  await pin(page, "far").click();
  await expectView(page, from);
  const progress: number[] = [0];
  for (let i = 0; i < 8; i++) {
    await page.clock.runFor(200);
    const current = await view(page);
    const c = center(current);
    const p = (c.x - fromCenter.x) / (toCenter.x - fromCenter.x);
    expect(p).toBeGreaterThan(progress.at(-1)!);
    expect((c.y - fromCenter.y) / (toCenter.y - fromCenter.y)).toBeCloseTo(
      p,
      3,
    );
    expect(current.z).toBeGreaterThanOrEqual(0.2);
    progress.push(p);
  }
  // Movement accelerates out of the start and slows down before arriving.
  expect(progress[1]).toBeLessThan(0.1);
  expect(progress[4] - progress[3]).toBeGreaterThan(progress[1]);
  expect(progress[8] - progress[7]).toBeLessThan(0.1);
  await page.clock.runFor(32);
  await expectView(page, to);
  expect(await geometry()).toEqual(original);
  await page.clock.runFor(650);
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
  await page.reload();
  await expect.poll(async () => (await view(page)).z).toBeCloseTo(to.z, 4);
  await expectView(page, to);
});

test("visible pins use shorter transitions and smaller pullbacks for shorter distances", async ({
  page,
}) => {
  await setup(page);
  const results: { elapsed: number; minimumZoom: number }[] = [];
  for (const [name, bounds] of [
    ["close", close],
    ["middle", middle],
  ] as const) {
    await pin(page, "near").click();
    await page.clock.runFor(animationDuration + 50);
    const area = (await page.locator(".canvas").boundingBox())!;
    const box = (await page.locator(`[data-card-id="${name}"]`).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(area.x);
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
    const to = await target(page, bounds);
    let minimumZoom = (await view(page)).z;
    await pin(page, name).click();
    let elapsed = 0;
    for (; elapsed < animationDuration;) {
      await page.clock.runFor(40);
      elapsed += 40;
      const current = await view(page);
      minimumZoom = Math.min(minimumZoom, current.z);
      if (
        Math.abs(current.x - to.x) < 0.005 &&
        Math.abs(current.y - to.y) < 0.005 &&
        Math.abs(current.z - to.z) < 0.0001
      )
        break;
    }
    await expectView(page, to);
    expect(elapsed).toBeGreaterThanOrEqual(400);
    expect(elapsed).toBeLessThanOrEqual(1040);
    expect(minimumZoom).toBeLessThan(to.z);
    results.push({ elapsed, minimumZoom });
  }
  expect(results[0].elapsed).toBeLessThan(results[1].elapsed);
  expect(results[0].minimumZoom).toBeGreaterThan(results[1].minimumZoom);
});

test("a target clipped by the viewport still uses the full 1600ms transition", async ({
  page,
}) => {
  await setup(page);
  await pin(page, "near").click();
  await page.clock.runFor(animationDuration + 50);
  const area = (await page.locator(".canvas").boundingBox())!;
  const box = (await page.locator('[data-card-id="edge"]').boundingBox())!;
  expect(box.x + box.width / 2).toBeLessThan(area.x + area.width);
  expect(box.x + box.width).toBeGreaterThan(area.x + area.width);
  const to = await target(page, edge);
  await pin(page, "edge").click();
  await page.clock.runFor(1000);
  expect(Math.abs((await view(page)).x - to.x)).toBeGreaterThan(1);
  await page.clock.runFor(650);
  await expectView(page, to);
});

for (const [name, bounds] of [
  ["peer", peer],
  ["far", far],
] as const) {
  test(`pin ${name} eases out about 20% below both endpoint scales before zooming in`, async ({
    page,
  }) => {
    await setup(page);
    await pin(page, "near").click();
    await page.clock.runFor(animationDuration + 50);
    const from = await view(page);
    const to = await target(page, bounds);
    const minimum = Math.min(from.z, to.z) * 0.8;
    await pin(page, name).click();
    await expectView(page, from);
    await page.clock.runFor(200);
    const early = await view(page);
    const earlyProgress = (from.z - early.z) / (from.z - minimum);
    expect(earlyProgress).toBeGreaterThan(0);
    expect(earlyProgress).toBeLessThan(0.3);
    await page.clock.runFor(440);
    const pulledBack = await view(page);
    expect(pulledBack.z).toBeCloseTo(minimum, 2);
    await page.clock.runFor(320);
    const returning = await view(page);
    expect(returning.z).toBeGreaterThan(pulledBack.z);
    expect(returning.z).toBeLessThan(to.z);
    await page.clock.runFor(320);
    expect((await view(page)).z).toBeGreaterThan(returning.z);
    await page.clock.runFor(370);
    await expectView(page, to);
  });
}

test("a second pin continues from the current view and groups finish centered", async ({
  page,
}) => {
  await setup(page);
  await pin(page, "far").click();
  await page.clock.runFor(640);
  const intermediate = await view(page);
  await pin(page, "near").click();
  await expectView(page, intermediate);
  await page.clock.runFor(animationDuration + 50);
  await expectView(page, await target(page, near));
  await pin(page, "group").click();
  await page.clock.runFor(animationDuration + 50);
  await expectView(page, await target(page, group));
  await expect(page.locator(".group-selected")).toHaveCount(1);
  await expect(page.locator(".card.selected")).toHaveCount(0);
});

test("double-click renaming stops the transition and persists the new name", async ({
  page,
}) => {
  await setup(page);
  const from = await view(page);
  await pin(page, "far").dblclick();
  const editor = page.getByRole("textbox", { name: "Pin 名称" });
  await editor.fill("远处的新名称");
  await page.clock.runFor(animationDuration + 50);
  await expectView(page, from);
  await expect(editor).toHaveValue("远处的新名称");
  await editor.press("Enter");
  await expect(pin(page, "远处的新名称")).toBeVisible();
  await page.clock.runFor(650);
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
  await page.reload();
  await expect(pin(page, "远处的新名称")).toBeVisible();
});

test("manual pan, wheel, minimap and Escape cancel an in-progress pin transition", async ({
  page,
}) => {
  await setup(page);
  for (const action of ["pan", "wheel", "minimap", "escape"]) {
    await pin(page, "far").click();
    await page.clock.runFor(400);
    const before = await view(page);
    if (action === "pan") {
      await page.mouse.move(900, 450);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(950, 490, { steps: 4 });
      await page.mouse.up({ button: "right" });
    } else if (action === "wheel") {
      await page
        .locator(".canvas")
        .dispatchEvent("wheel", { deltaX: 40, deltaY: 60 });
    } else if (action === "minimap") {
      await page.getByTestId("minimap").click({ position: { x: 80, y: 60 } });
    } else {
      await page.keyboard.press("Escape");
    }
    const interrupted = await view(page);
    if (action === "escape") expect(interrupted).toEqual(before);
    else expect(interrupted).not.toEqual(before);
    await page.clock.runFor(animationDuration + 50);
    await expectView(page, interrupted);
  }
});

test("switching canvases stops the old animation and retains each canvas's view", async ({
  page,
}) => {
  await setup(page);
  await pin(page, "far").click();
  await page.clock.runFor(400);
  const rootView = await view(page);
  await page
    .getByRole("navigation", { name: "画布层级" })
    .getByRole("button", { name: "第 2 层：子画布", exact: true })
    .click();
  await page.clock.runFor(animationDuration + 50);
  await expectView(page, { x: 65, y: 55, z: 1 });
  await page.getByRole("button", { name: "返回父画布", exact: true }).click();
  await expectView(page, rootView);
});

test("reduced motion locates pins immediately", async ({ page }) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await pin(page, "far").click();
  const to = await target(page, far);
  await expectView(page, to);
  await page.clock.runFor(animationDuration + 50);
  await expectView(page, to);
});

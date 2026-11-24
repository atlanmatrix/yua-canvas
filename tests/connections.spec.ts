import { openSettings, exportCanvas } from "./settings-helper.mjs";
import { test, expect, type Page, type Locator } from "@playwright/test";
const card = (id: string, x: number, y: number) => ({
  id,
  kind: "text",
  text: id,
  title: "",
  x,
  y,
  width: 180,
  height: 80,
  color: "#ffffff",
});
async function setup(page: Page, targetY = 100) {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "links.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        groups: [],
        cards: [
          card("来源", 100, 100),
          card("目标", 600, targetY),
          {
            id: "todo",
            kind: "todo",
            title: "",
            text: "",
            x: 100,
            y: 330,
            width: 280,
            height: 300,
            color: "#ffffff",
            tasks: [
              { id: "t1", text: "第一项", done: false },
              {
                id: "t2",
                text: "第二项很长的任务文本，需要换行后仍然让连接点位于这一行在边框上的正确位置",
                done: true,
              },
            ],
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.getByTestId("card")).toHaveCount(3);
}
async function connect(page: Page, from: Locator, to: Locator) {
  await from.locator("..").hover();
  const a = await from.boundingBox(),
    b = await to.boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
}
async function backup(page: Page) {
  const e = page.waitForEvent("download");
  await openSettings(page);
  await exportCanvas(page);
  const d = await e,
    s = await d.createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of s!) chunks.push(c);
  return Buffer.concat(chunks);
}

test("connection styles support elbows and all arrowhead modes, with arrows scaling on the canvas", async ({
  page,
}) => {
  await setup(page, 240);
  const source = page.locator('.card[data-card-id="来源"]');
  const target = page.locator('.card[data-card-id="目标"]');
  await connect(page, source.locator(".port-e"), target.locator(".port-w"));
  const path = page.locator(".connection-path:not(.draft)");
  const hit = page.locator(".connection-hit");
  const menuItem = (name: string) =>
    page.getByRole("menuitemradio", { name, exact: true });
  const midpoint = () =>
    hit.evaluate((el: SVGPathElement) => {
      const { x, y } = el
        .getPointAtLength(el.getTotalLength() / 2)
        .matrixTransform(el.getScreenCTM()!);
      return { x, y };
    });
  const { x, y } = await midpoint();
  await page.mouse.click(x, y, { button: "right" });
  await expect(menuItem("曲线")).toHaveAttribute("aria-checked", "true");
  await expect(menuItem("单向箭头")).toHaveAttribute("aria-checked", "true");
  await menuItem("折线").click();
  await expect(path).toHaveAttribute("d", /^M .* L .* L .* L /);
  await expect(hit).toHaveAttribute("d", (await path.getAttribute("d"))!);
  await expect(hit).toBeFocused();
  await hit.press("Shift+F10");
  await menuItem("无箭头").click();
  await expect(path).not.toHaveAttribute("marker-start");
  await expect(path).not.toHaveAttribute("marker-end");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(path).toHaveAttribute("marker-end", /canvas-connection-arrow/);
  await hit.press("Shift+F10");
  await menuItem("双向箭头").click();
  await expect(path).toHaveAttribute("marker-start", /canvas-connection-arrow/);
  await expect(path).toHaveAttribute("marker-end", /canvas-connection-arrow/);

  // Measure the marker actually painted by Chromium, excluding the connection stroke.
  await page.addStyleTag({
    content: ".connection-layer marker path { fill: #ff00ff; }",
  });
  const arrowWidth = async () => {
    const end = await path.evaluate((el: SVGPathElement) => {
      const { x, y } = el
        .getPointAtLength(el.getTotalLength())
        .matrixTransform(el.getScreenCTM()!);
      return { x, y };
    });
    const shot = await page.screenshot({
      clip: {
        x: Math.round(end.x) - 14,
        y: Math.round(end.y) - 8,
        width: 14,
        height: 16,
      },
    });
    return page.evaluate(async (png) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      const columns = new Set<number>();
      for (let i = 0; i < data.length; i += 4)
        if (data[i] > 210 && data[i + 1] < 90 && data[i + 2] > 210)
          columns.add((i / 4) % img.width);
      return columns.size;
    }, shot.toString("base64"));
  };
  const scale = () =>
    hit.evaluate((el: SVGPathElement) => el.getScreenCTM()!.a);
  const initialScale = await scale();
  const initialWidth = await arrowWidth();
  expect(initialWidth).toBeGreaterThanOrEqual(8);
  await page.mouse.move(x, y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, Math.log(2) / 0.006);
  await page.keyboard.up("Control");
  await expect.poll(scale).toBeLessThan(initialScale * 0.6);
  const zoomRatio = (await scale()) / initialScale;
  const zoomedWidth = await arrowWidth();
  expect(zoomedWidth).toBeGreaterThan(0);
  expect(Math.abs(zoomedWidth - initialWidth * zoomRatio)).toBeLessThanOrEqual(
    1.5,
  );

  const bytes = await backup(page);
  expect(JSON.parse(bytes.toString()).connections[0]).toMatchObject({
    routing: "elbow",
    arrowheads: "both",
  });
  await page.getByTestId("import").setInputFiles({
    name: "styled-links.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(path).toHaveAttribute("d", /^M .* L /);
  await expect(path).toHaveAttribute("marker-start", /canvas-connection-arrow/);
  await expect(path).toHaveAttribute("marker-end", /canvas-connection-arrow/);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [await midpoint()],
  });
  await expect(menuItem("折线")).toHaveAttribute("aria-checked", "true");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await menuItem("曲线").click();
  await expect(path).toHaveAttribute("d", /^M .* C /);
});

test("border plus ports create persistent curves which follow moves and can be deleted or undone", async ({
  page,
}) => {
  await setup(page);
  const source = page.locator('.card[data-card-id="来源"]'),
    target = page.locator('.card[data-card-id="目标"]');
  await page.mouse.move(5, 5);
  await expect(source.locator(".port-e")).toHaveCSS("opacity", "0");
  await source.hover();
  await expect(source.locator(".port-e")).toHaveCSS("opacity", "1");
  await connect(page, source.locator(".port-e"), target.locator(".port-w"));
  const path = page.locator(".connection-path:not(.draft)");
  await expect(path).toHaveCount(1);
  expect(await path.getAttribute("d")).toMatch(/^M .* C /);
  const original = await path.getAttribute("d");
  const bounds = (await source.boundingBox())!;
  await page.mouse.move(bounds.x + 28, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 28, bounds.y + 55, { steps: 4 });
  await page.mouse.up();
  await expect(path).not.toHaveAttribute("d", original!);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(path).toHaveCount(1);
  const bytes = await backup(page);
  const b = JSON.parse(bytes.toString());
  expect(b.connections[0].from).toEqual({ card: "来源", side: "e" });
  expect(b.connections[0].to).toEqual({ card: "目标", side: "w" });
  await page.getByTestId("import").setInputFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(path).toHaveCount(1);
  const hit = page.locator(".connection-hit");
  const midpoint = await hit.evaluate((el) => {
    const p = el as SVGPathElement;
    const point = p
      .getPointAtLength(p.getTotalLength() / 2)
      .matrixTransform(p.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(midpoint.x, midpoint.y);
  await page.keyboard.press("Delete");
  await expect(path).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(path).toHaveCount(1);
});
test("each Todo task has a border endpoint, links survive copies and task removal prunes only its links", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  const todo = page.locator(".card-todo"),
    target = page.locator('.card[data-card-id="目标"]');
  for (const task of ["t1", "t2"]) {
    const port = todo.locator(`[data-port-task="${task}"][data-port-side="e"]`);
    await todo.hover();
    const b = await todo.boundingBox(),
      row = await todo.locator(`[data-task-id="${task}"]`).boundingBox(),
      p = await port.boundingBox();
    expect(p!.x + p!.width / 2).toBeCloseTo(b!.x + b!.width, 0);
    expect(p!.y + p!.height / 2).toBeCloseTo(row!.y + row!.height / 2, 0);
    await connect(page, port, target.locator(".port-w"));
  }
  await expect(page.locator(".connection-path:not(.draft)")).toHaveCount(2);
  let b = JSON.parse((await backup(page)).toString());
  expect(
    b.connections.map((c: { from: { task: string } }) => c.from.task).sort(),
  ).toEqual(["t1", "t2"]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator(".connection-path:not(.draft)")).toHaveCount(4);
  b = JSON.parse((await backup(page)).toString());
  for (const connection of b.connections) {
    expect(
      b.cards.some(
        (c: { id: string; tasks?: { id: string }[] }) =>
          c.id === connection.from.card &&
          c.tasks?.some((t) => t.id === connection.from.task),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".connection-path:not(.draft)")).toHaveCount(2);
  await page.getByRole("button", { name: "适应所有内容" }).click();
  await todo.locator(".card-top").dblclick();
  await page.getByRole("button", { name: "删除任务 1" }).click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".connection-path:not(.draft)")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".connection-path:not(.draft)")).toHaveCount(2);
});
test("canceled connections create no edges and canvases accept connections", async ({
  page,
}) => {
  await setup(page);
  const source = page.locator('.card[data-card-id="来源"]');
  await source.hover();
  const port = await source.locator(".port-e").boundingBox();
  await page.mouse.move(port!.x + 9, port!.y + 9);
  await page.mouse.down();
  await page.mouse.move(port!.x + 100, port!.y + 100);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".connection-path")).toHaveCount(0);
  await page.getByRole("button", { name: "创建子画布", exact: true }).click();
  const target = page.locator(".card-canvas");
  await connect(page, source.locator(".port-e"), target.locator(".port-w"));
  await expect(page.locator(".connection-path")).toHaveCount(1);
});

test("nearby target ports activate blue, snap on release and labels edit, cancel, undo and persist", async ({
  page,
}) => {
  await setup(page);
  const source = page.locator('.card[data-card-id="来源"]');
  const target = page.locator('.card[data-card-id="目标"] .port-w');
  await source.hover();
  const a = await source.locator(".port-e").boundingBox(),
    b = await target.boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2 - 20, b!.y + b!.height / 2, {
    steps: 10,
  });
  await expect(target).toHaveClass(/target-active/);
  await expect(target).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await page.mouse.move(b!.x - 80, b!.y - 80);
  await expect(target).not.toHaveClass(/target-active/);
  await page.mouse.move(b!.x + b!.width / 2 - 20, b!.y + b!.height / 2);
  await page.mouse.up();
  await expect(page.locator(".connection-hit")).toHaveCount(1);
  await expect(page.locator(".target-active")).toHaveCount(0);
  const midpoint = await page.locator(".connection-hit").evaluate((el) => {
    const path = el as SVGPathElement;
    const p = path
      .getPointAtLength(path.getTotalLength() / 2)
      .matrixTransform(path.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.dblclick(midpoint.x, midpoint.y);
  const input = page.getByRole("textbox", { name: "连线文字" });
  await expect(input).toBeFocused();
  await input.fill("参考关系");
  await page.keyboard.press("Enter");
  const label = page.locator(".connection-label");
  await expect(label).toHaveText("参考关系");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(label).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(label).toHaveText("参考关系");
  await label.dblclick();
  await input.fill("取消修改");
  await page.keyboard.press("Escape");
  await expect(label).toHaveText("参考关系");
  await label.dblclick();
  await input.fill("更新后的关系");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(label).toHaveText("更新后的关系");
  const backupBoard = JSON.parse((await backup(page)).toString());
  expect(backupBoard.connections[0].label).toBe("更新后的关系");
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(label).toHaveText("更新后的关系");
  await label.dblclick();
  await input.fill("");
  await page.keyboard.press("Enter");
  await expect(label).toHaveCount(0);
});

test("Todo target highlights the nearest individual task border port at reduced zoom", async ({
  page,
}) => {
  await setup(page);
  await page.keyboard.press("-");
  const source = page.locator('.card[data-card-id="目标"]');
  const target = page.locator(
    '.card-todo [data-port-task="t2"][data-port-side="e"]',
  );
  await source.hover();
  const a = await source.locator(".port-w").boundingBox(),
    b = await target.boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2 + 18, b!.y + b!.height / 2, {
    steps: 15,
  });
  await expect(target).toHaveClass(/target-active/);
  await expect(page.locator(".target-active")).toHaveCount(1);
  await page.mouse.up();
  const board = JSON.parse((await backup(page)).toString());
  expect(board.connections[0].to.task).toBe("t2");
  expect(board.connections[0].to.card).toBe("todo");
});

test("connections and drafts use canvas-sized arrows, and the minimap has its own marker", async ({
  page,
}) => {
  await setup(page);
  const source = page.locator('.card[data-card-id="来源"]'),
    target = page.locator('.card[data-card-id="目标"]');
  await source.hover();
  const a = await source.locator(".port-e").boundingBox(),
    b = await target.locator(".port-w").boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x - 20, b!.y + b!.height / 2, { steps: 10 });
  await expect(page.locator(".connection-path.draft")).toHaveAttribute(
    "marker-end",
    "url(#canvas-connection-arrow)",
  );
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
  await page.mouse.up();
  await page.mouse.move(1200, 400);
  const path = page.locator(".connection-path:not(.draft)");
  await expect(path).toHaveAttribute(
    "marker-end",
    "url(#canvas-connection-arrow)",
  );
  const marker = page.locator("#canvas-connection-arrow");
  await expect(marker).toHaveAttribute("orient", "auto-start-reverse");
  await expect(marker).toHaveAttribute("markerUnits", "userSpaceOnUse");
  await expect(marker).toHaveAttribute("refX", "10");
  const end = await path.evaluate((el) => {
    const p = el as SVGPathElement,
      v = p.getPointAtLength(p.getTotalLength());
    return { x: v.x, y: v.y };
  });
  expect(end).toEqual({ x: 600, y: 140 });
  await expect(page.locator(".minimap-connection")).toHaveAttribute(
    "marker-end",
    "url(#minimap-connection-arrow)",
  );
  for (const key of ["-", "+", "+"]) {
    await page.keyboard.press(key);
    await expect(marker).toHaveAttribute("markerWidth", "10");
  }
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(path).toHaveAttribute(
    "marker-end",
    "url(#canvas-connection-arrow)",
  );
  await page.screenshot({ path: "/tmp/yua-arrow-connection.png" });
});

test("connection editors stay above overlapping cards while zooming", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "overlap.json",
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
            x: 100,
            y: 100,
            width: 160,
            height: 100,
            color: "#ffffff",
          },
          {
            id: "b",
            kind: "todo",
            title: "",
            text: "",
            x: 320,
            y: 100,
            width: 220,
            height: 220,
            color: "#ffffff",
            tasks: [{ id: "t", text: "目标任务", done: false }],
          },
        ],
        groups: [
          {
            id: "g",
            name: "分组标题",
            bounds: { x: 300, y: 400, width: 180, height: 120 },
          },
        ],
        connections: [
          {
            id: "link",
            from: { card: "a", side: "e" },
            to: { card: "b", side: "w" },
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.getByRole("button", { name: "关闭提示" }).click();
  const zoom = await page
    .locator(".world")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  const geometry = () =>
    page
      .locator(".card,.group-boundary")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.cssText));
  const original = await geometry();
  const hit = (x: number, y: number) =>
    page.locator(".world").evaluate(
      (el, p) => {
        const matrix = el.getBoundingClientRect(),
          m = new DOMMatrix(getComputedStyle(el).transform);
        const node = document.elementFromPoint(
          matrix.x + p.x * m.a,
          matrix.y + p.y * m.d,
        );
        return {
          editor: node?.matches(".connection-label-editor"),
          card: node?.closest<HTMLElement>(".card")?.dataset.cardId,
          group: node?.closest<HTMLElement>(".group-boundary")?.dataset.groupId,
        };
      },
      { x, y },
    );
  expect((await hit(210, 180)).card).toBe("a");
  expect((await hit(350, 180)).card).toBe("b");
  const midpoint = await page.locator(".connection-hit").evaluate((el) => {
    const path = el as SVGPathElement,
      p = path
        .getPointAtLength(path.getTotalLength() / 2)
        .matrixTransform(path.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.dblclick(midpoint.x, midpoint.y);
  const input = page.getByRole("textbox", { name: "连线文字" });
  await expect(input).toBeFocused();
  for (const x of [210, 305, 350])
    expect((await hit(x, 180)).editor).toBe(true);
  await input.fill("连线层级修复");
  await input.click({ position: { x: 10, y: 16 } });
  await expect(input).toBeFocused();
  expect(await geometry()).toEqual(original);
  await page.mouse.move(1000, 400);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -35);
  await page.keyboard.up("Control");
  await expect
    .poll(() =>
      page
        .locator(".world")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
    )
    .toBeGreaterThan(zoom);
  await expect(input).toBeFocused();
  for (const x of [210, 305, 350])
    expect((await hit(x, 180)).editor).toBe(true);
  await page.screenshot({ path: "/tmp/yua-connection-editor-overlay.png" });
  await page.keyboard.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(page.locator(".connection-label")).toHaveText("连线层级修复");
  expect((await hit(210, 180)).card).toBe("a");
  expect(await geometry()).toEqual(original);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".connection-label")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator(".connection-label")).toHaveText("连线层级修复");
});

test("magnetic capture pulls the socket, retains it near the edge, and releases to a fixed saved anchor", async ({
  page,
}) => {
  await setup(page);
  const source = page.locator('.card[data-card-id="来源"]');
  const target = page.locator('.card[data-card-id="目标"] .port-w');
  const other = page.locator(".card-todo");
  await source.hover();
  const a = await source.locator(".port-e").boundingBox();
  const b = await target.boundingBox();
  const x = b!.x + b!.width / 2,
    y = b!.y + b!.height / 2;
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(x - 45, y + 8, { steps: 8 });
  await expect(target).toHaveClass(/target-active/);
  await expect(page.locator(".magnetic-draft")).toHaveClass(/is-captured/);
  await expect(other).toHaveCSS("opacity", "0.48");
  await expect
    .poll(async () => {
      const box = await target.boundingBox();
      return box!.x + box!.width / 2;
    })
    .toBeLessThan(x - 1);
  await page.screenshot({ path: "/tmp/yua-magnetic-connection.png" });
  // The larger release radius prevents flicker at the capture boundary.
  await page.mouse.move(x - 64, y);
  await expect(target).toHaveClass(/target-active/);
  await page.mouse.move(x - 85, y);
  await expect(target).not.toHaveClass(/target-active/);
  await page.mouse.move(x - 64, y);
  await expect(target).not.toHaveClass(/target-active/);
  await page.mouse.move(x - 45, y);
  await expect(target).toHaveClass(/target-active/);
  await page.mouse.up();
  await expect(page.locator(".magnetic-draft")).toHaveCount(0);
  await expect(other).toHaveCSS("opacity", "1");
  const saved = JSON.parse((await backup(page)).toString());
  expect(saved.connections[0].to).toEqual({ card: "目标", side: "w" });
  await expect
    .poll(async () => {
      const box = await target.boundingBox();
      return Math.abs(box!.x + box!.width / 2 - x);
    })
    .toBeLessThan(1);
  const end = await page
    .locator(".connection-path:not(.draft)")
    .evaluate((el) => {
      const path = el as SVGPathElement;
      const end = path.getPointAtLength(path.getTotalLength());
      return { x: end.x, y: end.y };
    });
  expect(end).toEqual({ x: 600, y: 140 });
});

test("drag either endpoint to another card or TODO socket, preserve identity and cancel or undo a reconnection", async ({
  page,
}) => {
  await setup(page);
  await connect(
    page,
    page.getByRole("button", { name: "连接 来源 e", exact: true }),
    page.getByRole("button", { name: "连接 目标 w", exact: true }),
  );
  const path = page.locator(".connection-hit");
  const mid = await path.evaluate((el) => {
    const p = el as SVGPathElement;
    const m = p
      .getPointAtLength(p.getTotalLength() / 2)
      .matrixTransform(p.getScreenCTM()!);
    return { x: m.x, y: m.y };
  });
  await page.mouse.dblclick(mid.x, mid.y);
  const editor = page.getByRole("textbox", { name: "连线文字" });
  await editor.fill("关联");
  await editor.press("Enter");
  const original = await path.getAttribute("d");
  const id = await path.locator("..").getAttribute("data-connection-id");
  async function dragEnd(
    name: string,
    target: { x: number; y: number },
    cancel = false,
  ) {
    const button = page.getByRole("button", { name });
    const p = (await button.boundingBox())!;
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
  }
  await dragEnd("拖动连线终点", { x: 1060, y: 350 });
  await expect(path).toHaveAttribute("d", original!);
  const socket = (await page
    .locator('[data-port-task="t2"][data-port-side="e"]')
    .boundingBox())!;
  const point = {
    x: socket.x + socket.width / 2,
    y: socket.y + socket.height / 2,
  };
  await dragEnd("拖动连线起点", point, true);
  await expect(path).toHaveAttribute("d", original!);
  await page.getByText("关联", { exact: true }).click();
  await dragEnd("拖动连线起点", point);
  await expect(path).not.toHaveAttribute("d", original!);
  const card = (await page.locator('[data-card-id="来源"]').boundingBox())!;
  await dragEnd("拖动连线终点", { x: card.x + card.width / 2, y: card.y + 8 });
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  const links = await page.evaluate(
    async () =>
      (await (await import("/src/storage.ts")).readBoard())!.connections,
  );
  expect(links).toEqual([
    {
      id,
      label: "关联",
      from: { card: "todo", side: "e", task: "t2" },
      to: { card: "来源", side: "n" },
    },
  ]);
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(path).toHaveAttribute("d", original!);
});

test("keyboard ports create, cancel and reconnect without changing the line hit width", async ({
  page,
}) => {
  await setup(page);
  const port = page.locator('[data-card-id="来源"] .port-e');
  const sourcePorts = page.locator('[data-card-id="来源"] .connection-port');
  await expect(
    page.locator('[data-card-id="来源"] .connection-port[tabindex="0"]'),
  ).toHaveCount(1);
  await sourcePorts.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(port).toBeFocused();
  await page.keyboard.press("Space");
  const picker = page.getByRole("dialog", { name: "选择连线目标" });
  await expect(picker.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(port).toBeFocused();
  await expect(page.locator(".connection-hit")).toHaveCount(0);

  await page.keyboard.press("Enter");
  await picker.getByRole("combobox").selectOption({ label: "连接 目标 w" });
  await picker
    .getByRole("button", { name: "连接", exact: true })
    .press("Enter");
  const line = page.locator(".connection-hit");
  await line.focus();
  await expect(line).toHaveCSS("stroke-width", "14px");
  await expect(page.locator(".connection-path")).toHaveCSS(
    "stroke-width",
    "3.5px",
  );
  await line.press("F2");
  const label = page.getByRole("textbox", { name: "连线文字" });
  await label.fill("keyboard");
  await label.press("Enter");
  await expect(line).toBeFocused();
  await line.press("Enter");
  const end = page.getByRole("button", { name: "拖动连线终点" });
  await end.press("Enter");
  await picker
    .getByRole("combobox")
    .selectOption({ label: "连接任务 第一项 e" });
  const initial = await line.getAttribute("d");
  await picker
    .getByRole("button", { name: "连接", exact: true })
    .press("Enter");
  await expect(line).not.toHaveAttribute("d", initial!);
  await expect(line).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(line).toHaveAttribute("d", initial!);
});

test("selecting a connection uses a path halo without a rectangular outline, and its context menu supports label editing, reversing, and deleting", async ({
  page,
}) => {
  await setup(page, 240);
  const source = page.locator('.card[data-card-id="来源"]');
  const target = page.locator('.card[data-card-id="目标"]');
  await connect(page, source.locator(".port-e"), target.locator(".port-w"));
  const hit = page.locator(".connection-hit");
  const halo = page.locator(".connection-halo");
  const path = page.locator(".connection-path:not(.draft)");
  const midpoint = () =>
    hit.evaluate((el: SVGPathElement) => {
      const { x, y } = el
        .getPointAtLength(el.getTotalLength() / 2)
        .matrixTransform(el.getScreenCTM()!);
      return { x, y };
    });

  // Mouse-clicking the line selects it with a path-following halo and no bounding-box outline.
  const pt = await midpoint();
  await page.mouse.click(pt.x, pt.y);
  await expect(path).toHaveClass(/selected/);
  await expect(halo).toHaveClass(/selected/);
  await expect(hit).toHaveCSS("outline-style", "none");

  // Right-click menu exposes segmented controls with horizontal arrow navigation and actions.
  await page.mouse.click(pt.x, pt.y, { button: "right" });
  const curveOption = page.getByRole("menuitemradio", {
    name: "曲线",
    exact: true,
  });
  const elbowOption = page.getByRole("menuitemradio", {
    name: "折线",
    exact: true,
  });
  await expect(curveOption).toHaveAttribute("aria-checked", "true");
  await expect(curveOption).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await curveOption.focus();
  await page.keyboard.press("ArrowRight");
  await expect(elbowOption).toBeFocused();

  // Add a label from the context menu.
  await page.getByRole("menuitem", { name: "添加文字" }).click();
  const labelInput = page.getByRole("textbox", { name: "连线文字" });
  await expect(labelInput).toBeFocused();
  await labelInput.fill("同步数据");
  await labelInput.press("Enter");
  const label = page.locator(".connection-label");
  await expect(label).toHaveText("同步数据");
  await expect(label).toHaveClass(/selected/);

  // Reopen menu by right-clicking the label: label action switches to "编辑文字" and reversing swaps endpoints.
  await label.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "编辑文字" })).toBeVisible();
  await page.getByRole("menuitem", { name: "反转方向", exact: true }).click();
  await expect(hit).toBeFocused();
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  const reversed = await page.evaluate(
    async () =>
      (await (await import("/src/storage.ts")).readBoard())!.connections![0],
  );
  expect(reversed.from).toEqual({ card: "目标", side: "w" });
  expect(reversed.to).toEqual({ card: "来源", side: "e" });
  expect(reversed.label).toBe("同步数据");

  // Undo restores original direction.
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (await import("/src/storage.ts")).readBoard())?.connections?.[0]
            ?.from.card,
      ),
    )
    .toBe("来源");

  // Delete connection from context menu and undo.
  await hit.press("Shift+F10");
  await page.getByRole("menuitem", { name: "删除" }).click();
  await expect(path).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(path).toHaveCount(1);
});

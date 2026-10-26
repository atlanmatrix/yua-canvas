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
async function setup(page: Page) {
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
          card("目标", 600, 100),
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
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  const d = await e,
    s = await d.createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of s!) chunks.push(c);
  return Buffer.concat(chunks);
}
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
  await source.click();
  await page.keyboard.press("Shift+ArrowDown");
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
  await page.getByRole("button", { name: "保存任务" }).click();
  await expect(page.locator(".connection-path:not(.draft)")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".connection-path:not(.draft)")).toHaveCount(2);
});
test("canceled connections and drops onto groups create no edges", async ({
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
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+g");
  await page.getByRole("textbox", { name: "分组名称" }).fill("不可连接分组");
  await page.getByRole("button", { name: "保存分组" }).click();
  await page.getByRole("button", { name: "适应所有内容" }).click();
  await connect(
    page,
    source.locator(".port-e"),
    page.getByRole("button", { name: "拖动分组 不可连接分组" }),
  );
  await expect(page.locator(".connection-path")).toHaveCount(0);
  await expect(page.locator(".group-boundary .connection-port")).toHaveCount(0);
});

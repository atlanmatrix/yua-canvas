import { test, expect, type Page } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture.mjs";
const saved = (p: Page) =>
  expect(p.locator('.save-indicator[data-state="已保存至本地"]')).toBeVisible();
const file = (id: string, text: string, x = 80, y = 100) => ({
  id,
  kind: "file",
  title: id + ".md",
  mime: "text/markdown",
  blob: "data:text/markdown;base64," + Buffer.from(text).toString("base64"),
  text: "",
  x,
  y,
  width: 360,
  height: 260,
  color: "#ffffff",
  displayMode: "large",
});
const pdf = (id: string, x = 80, y = 100) => ({
  ...file(id, "", x, y),
  title: id + ".pdf",
  mime: "application/pdf",
  blob: "data:application/pdf;base64," + pdfFixture().toString("base64"),
  height: 480,
});
async function seed(p: Page, cards: any[]) {
  await p.goto("/");
  await saved(p);
  await p.evaluate(
    async (raw) => {
      const mod = await import("/src/storage.ts" as string);
      const board = await mod.importBoard(raw);
      await mod.saveBoard(
        board,
        { x: 30, y: 20, z: 1 },
        { path: [], views: { perf: { x: 30, y: 20, z: 1 } } },
      );
    },
    JSON.stringify({ version: 1, id: "perf", cards, groups: [] }),
  );
  await p.reload();
  await saved(p);
}
async function metrics(p: Page) {
  return p.evaluate(async () => {
    const mod = await import("/src/previewCache.ts" as string);
    return {
      ...mod.previewMetrics,
      pdfRunning: mod.pdfQueue.running,
      pdfQueued: mod.pdfQueue.waiting,
    };
  });
}
async function wheel(p: Page, x: number, y = 0) {
  await p.locator(".canvas").dispatchEvent("wheel", {
    deltaX: x,
    deltaY: y,
    clientX: 1000,
    clientY: 600,
  });
}

test("144 document cards retain geometry and selection while only nearby previews load; camera motion never rerenders cards", async ({
  page,
}) => {
  const cards = [
    ...Array.from({ length: 120 }, (_, i) =>
      file(
        "note-" + i,
        `# Document ${i}\n\nVisible content ${i}`,
        (i % 10) * 500,
        Math.floor(i / 10) * 420,
      ),
    ),
    ...Array.from({ length: 24 }, (_, i) => pdf("pdf-" + i, 8000 + i * 420, 0)),
  ];
  await seed(page, cards);
  await expect(page.getByTestId("card")).toHaveCount(144);
  await expect(page.locator(".markdown-file-preview")).not.toHaveCount(0);
  await expect
    .poll(async () => (await metrics(page)).textReads)
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      page.locator('.preview-boundary[data-preview-state="active"]').count(),
    )
    .toBeLessThanOrEqual(16);
  const before = await metrics(page);
  expect(before.pdfLoads).toBe(0);
  expect(before.textReads).toBeLessThan(20);
  const geometry = await page
    .getByTestId("card")
    .evaluateAll((els) =>
      els.map((el) => [
        (el as HTMLElement).style.left,
        (el as HTMLElement).style.top,
        (el as HTMLElement).style.width,
        (el as HTMLElement).style.height,
      ]),
    );
  await wheel(page, 25, 10);
  await saved(page);
  const after = await metrics(page);
  expect(after.cardRenders).toBe(before.cardRenders);
  expect(after.markdownParses).toBe(before.markdownParses);
  expect(after.pdfLoads).toBe(0);
  expect(
    await page
      .getByTestId("card")
      .evaluateAll((els) =>
        els.map((el) => [
          (el as HTMLElement).style.left,
          (el as HTMLElement).style.top,
          (el as HTMLElement).style.width,
          (el as HTMLElement).style.height,
        ]),
      ),
  ).toEqual(geometry);
  await page.locator(".canvas").click({ position: { x: 10, y: 10 } });
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.locator(".card.selected")).toHaveCount(144);
  expect((await metrics(page)).pdfLoads).toBe(0);
  console.log(
    JSON.stringify({
      scenario: "144 documents",
      activePreviews: await page
        .locator('.preview-boundary[data-preview-state="active"]')
        .count(),
      textReads: after.textReads,
      pdfLoads: after.pdfLoads,
      cardRendersDuringPan: after.cardRenders - before.cardRenders,
    }),
  );
});
test("PDF pages reuse memory and persistent bitmaps after panning and reload, preserving saved page and source bytes", async ({
  page,
}) => {
  await seed(page, [pdf("first"), pdf("far", 4000)]);
  const first = page.locator('[data-card-id="first"]');
  await expect(first.locator('[data-pdf-page="1"]')).toHaveCount(1, {
    timeout: 20000,
  });
  await first.hover();
  await first.getByRole("button", { name: "下一页" }).click();
  await expect(first.locator('[data-pdf-page="2"]')).toHaveCount(1);
  const initial = await metrics(page);
  expect(initial.pdfRenders).toBe(2);
  await wheel(page, 4000);
  const far = page.locator('[data-card-id="far"]');
  await expect(far.locator('[data-pdf-page="1"]')).toHaveCount(1, {
    timeout: 20000,
  });
  await expect(first.locator(".pdf-preview")).toHaveCount(0);
  expect((await metrics(page)).pdfRenders).toBe(2);
  await wheel(page, -4000);
  await expect(first.locator('[data-pdf-page="2"]')).toHaveCount(1);
  expect((await metrics(page)).pdfRenders).toBe(2);
  await saved(page);
  await page.reload();
  await expect(first.locator('[data-pdf-page="2"]')).toHaveCount(1, {
    timeout: 20000,
  });
  const reloaded = await metrics(page);
  expect(reloaded.pdfRenders).toBe(0);
  expect(reloaded.pdfLoads).toBe(0);
  expect(reloaded.pdfDiskHits).toBeGreaterThan(0);
  const source = await page.evaluate(async () => {
    const mod = await import("/src/storage.ts" as string);
    const board = await mod.readBoard();
    return {
      page: board.cards[0].pdfPage,
      bytes: [...new Uint8Array(await board.cards[0].blob.arrayBuffer())],
    };
  });
  expect(source.page).toBe(2);
  expect(Buffer.from(source.bytes)).toEqual(pdfFixture());
});
test("long Markdown virtualizes blocks without reparsing on scroll and preserves references and file edits", async ({
  page,
}) => {
  const text =
    Array.from(
      { length: 300 },
      (_, i) => `## Section ${i}\n\nParagraph ${i} with [reference][shared].\n`,
    ).join("\n") + "\n[shared]: https://example.com/reference\n";
  await seed(page, [file("long", text)]);
  const card = page.locator('[data-card-id="long"]'),
    scroll = card.locator(".markdown-file-preview");
  await expect(
    card.getByRole("heading", { name: "Section 0", exact: true }),
  ).toBeVisible();
  await expect(card.locator(".markdown-chunk")).toHaveCount(75);
  expect(await card.locator("h2").count()).toBeLessThan(40);
  await expect(
    card.getByRole("link", { name: "reference" }).first(),
  ).toHaveAttribute("href", "https://example.com/reference");
  const before = await metrics(page);
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    card.getByRole("heading", { name: "Section 299", exact: true }),
  ).toBeVisible();
  expect((await metrics(page)).markdownParses).toBe(before.markdownParses);
  expect(await card.locator("h2").count()).toBeLessThan(40);
  await card.dblclick({ position: { x: 20, y: 20 } });
  const dialog = page.getByRole("dialog", { name: "内容详情" });
  await dialog.getByRole("button", { name: "编辑文件", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "文件内容" })
    .fill("# Replacement\n\nFresh content");
  await dialog.getByRole("button", { name: "保存文件", exact: true }).click();
  await dialog.getByRole("button", { name: "关闭详情" }).click();
  await expect(
    card.getByRole("heading", { name: "Replacement", exact: true }),
  ).toBeVisible();
  await expect(card.locator(".markdown-chunk")).toHaveCount(0);
  await expect(card).not.toContainText("Section 299");
});
test("render queues cancel pending work, deduplicate shared PDF requests and enforce cache budgets", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const result = await page.evaluate(async (base64) => {
    const mod = await import("/src/previewCache.ts" as string),
      pdf = await import("/src/pdfPreviewCache.ts" as string);
    const queue = new mod.PreviewQueue(2);
    let running = 0,
      maximum = 0;
    const started: number[] = [],
      releases: (() => void)[] = [];
    const work = (n: number) =>
      queue.run(
        () =>
          new Promise<void>((resolve) => {
            started.push(n);
            running++;
            maximum = Math.max(maximum, running);
            releases.push(() => {
              running--;
              resolve();
            });
          }),
      );
    const a = work(1),
      b = work(2);
    const controller = new AbortController();
    const canceled = queue
      .run(async () => {
        started.push(3);
      }, controller.signal)
      .catch((e: Error) => e.name);
    controller.abort();
    await Promise.resolve();
    releases.forEach((fn) => fn());
    await Promise.all([a, b]);
    const lru = new mod.PreviewCache(16, 2);
    lru.set("a", "A", 8);
    lru.set("b", "B", 8);
    lru.get("a");
    lru.set("c", "C", 8);
    const cache = {
      bytes: lru.usedBytes,
      entries: lru.size,
      evicted: lru.get("b"),
      kept: lru.get("a"),
    };
    const blob = new Blob(
      [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
      { type: "application/pdf" },
    );
    const first = new AbortController(),
      second = new AbortController();
    const one = pdf
      .requestPdfPreview(blob, 1, 256, 512, first.signal)
      .catch((e: Error) => e.name);
    const two = pdf.requestPdfPreview(blob, 1, 256, 512, second.signal);
    first.abort();
    const [cancelledRequest, bitmap] = await Promise.all([one, two]);
    return {
      maximum,
      started,
      canceled: await canceled,
      cache,
      cancelledRequest,
      page: bitmap.page,
      stats: pdf.pdfPreviewStats(),
    };
  }, pdfFixture().toString("base64"));
  expect(result.maximum).toBe(2);
  expect(result.started).toEqual([1, 2]);
  expect(result.canceled).toBe("AbortError");
  expect(result.cache).toMatchObject({ bytes: 16, entries: 2, kept: "A" });
  expect(result.cache.evicted).toBeUndefined();
  expect(result.cancelledRequest).toBe("AbortError");
  expect(result.page).toBe(1);
  expect(result.stats.pdfRenders).toBe(1);
  expect(result.stats.running).toBeLessThanOrEqual(2);
});
test("cached Mermaid layouts keep unique SVG IDs and avoid rerendering on camera movement", async ({
  page,
}) => {
  const cards = Array.from({ length: 30 }, (_, i) => ({
    id: "graph-" + i,
    kind: "mermaid",
    title: "",
    text: "flowchart LR\nA[Start]-->B[Finish]",
    x: i * 420,
    y: 100,
    width: 320,
    height: 220,
    color: "#ffffff",
    displayMode: "large",
  }));
  await seed(page, cards);
  await expect(
    page.locator('.markdown-diagram[data-diagram-state="ready"]'),
  ).not.toHaveCount(0, { timeout: 20000 });
  await expect.poll(async () => (await metrics(page)).diagramRenders).toBe(1);
  await saved(page);
  const ids = await page
    .locator(".markdown-diagram svg[id]")
    .evaluateAll((els) => els.map((el) => el.id));
  expect(ids.length).toBeGreaterThan(1);
  expect(new Set(ids).size).toBe(ids.length);
  const before = await metrics(page);
  await wheel(page, 20);
  await saved(page);
  const after = await metrics(page);
  expect(after.diagramRenders).toBe(before.diagramRenders);
  expect(after.cardRenders).toBe(before.cardRenders);
  await wheel(page, 4000);
  await expect(
    page.locator(
      '[data-card-id="graph-10"] .markdown-diagram[data-diagram-state="ready"]',
    ),
  ).toHaveCount(1);
  expect((await metrics(page)).diagramRenders).toBe(1);
});
test("failed disposable cache storage never prevents PDF preview or local workspace saves", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      if (this.name === "yua-preview-cache")
        throw new DOMException("Cache quota", "QuotaExceededError");
      return transaction.apply(this, args);
    };
  });
  await seed(page, [pdf("uncached")]);
  await expect(page.locator('[data-pdf-page="1"]')).toHaveCount(1, {
    timeout: 20000,
  });
  await saved(page);
  expect((await metrics(page)).pdfRenders).toBe(1);
  await page.reload();
  await expect(page.locator('[data-pdf-page="1"]')).toHaveCount(1, {
    timeout: 20000,
  });
  await saved(page);
});
test("zoomed-out documents stay lightweight until hovered or zoomed back in", async ({
  page,
}) => {
  await seed(page, [file("detail", "# Detailed preview\n\nFull text")]);
  const card = page.locator('[data-card-id="detail"]');
  await expect(
    card.getByRole("heading", { name: "Detailed preview" }),
  ).toBeVisible();
  const initial = await metrics(page);
  for (let i = 0; i < 9; i++) await page.keyboard.press("-");
  await expect(card.locator(".markdown-file-preview")).toHaveCount(0);
  await expect(card.locator('[data-preview-state="suspended"]')).toHaveCount(1);
  await card.hover();
  await expect(
    card.getByRole("heading", { name: "Detailed preview" }),
  ).toBeVisible();
  expect((await metrics(page)).markdownParses).toBe(initial.markdownParses);
  await page.mouse.move(10, 10);
  await page.keyboard.press("1");
  await expect(
    card.getByRole("heading", { name: "Detailed preview" }),
  ).toBeVisible();
  expect((await metrics(page)).textReads).toBe(initial.textReads);
});
test("PDF bitmap keys distinguish different contents even when filenames and page numbers match", async ({
  page,
}) => {
  const changed = Buffer.from(
    pdfFixture().toString().replace("Page 1", "Other1"),
  );
  await seed(page, [
    { ...pdf("original", 30), title: "same.pdf" },
    {
      ...pdf("changed", 500),
      title: "same.pdf",
      blob: "data:application/pdf;base64," + changed.toString("base64"),
    },
  ]);
  await expect(page.locator('[data-pdf-page="1"]')).toHaveCount(2, {
    timeout: 20000,
  });
  const images = await page
    .locator(".pdf-preview canvas")
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLCanvasElement).toDataURL()),
    );
  expect(images[0]).not.toBe(images[1]);
  expect((await metrics(page)).pdfRenders).toBe(2);
  await saved(page);
  await page.reload();
  await expect(page.locator('[data-pdf-page="1"]')).toHaveCount(2, {
    timeout: 20000,
  });
  expect((await metrics(page)).pdfRenders).toBe(0);
});

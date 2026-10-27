import { test, expect, type Page } from "@playwright/test";
import { openTextEditor } from "./helpers";

async function seed(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser source modules.
    const { saveBoard } = await import("/src/storage.ts");
    const note = (id: string, x = 80, y = 100) => ({
      id,
      kind: "text",
      title: "",
      text: `${id}\n原始内容`,
      x,
      y,
      width: 200,
      height: 120,
      color: "#ffffff",
      textMode: "scroll",
      textAutoHeight: false,
    });
    const deep = {
      version: 1,
      id: "deep",
      parentCreated: false,
      groups: [],
      cards: [
        {
          ...note("deep-file"),
          kind: "file",
          title: "binary.dat",
          text: "",
          mime: "text/plain",
          blob: new File(
            [new Uint8Array([0, 1, 255, 128, 13, 10])],
            "原始.dat",
            {
              type: "application/octet-stream",
              lastModified: 123456,
            },
          ),
          pin: "深层附件",
        },
        {
          ...note("empty", 350),
          kind: "file",
          title: "empty.bin",
          text: "",
          blob: new Blob([]),
        },
      ],
    };
    const board = {
      version: 1,
      id: "root",
      parentCreated: true,
      groups: [
        {
          id: "outer",
          name: "根分组",
          pin: "根组",
          color: "#dbeafe",
          bounds: { x: 40, y: 40, width: 850, height: 600 },
        },
        {
          id: "inner",
          name: "长名称".repeat(80),
          color: "#dcfce7",
          bounds: { x: 60, y: 70, width: 240, height: 180 },
          parent: "outer",
        },
        {
          id: "empty-group",
          name: "空分组",
          bounds: { x: 1000, y: 50, width: 160, height: 120 },
        },
      ],
      cards: [
        { ...note("root-text"), group: "inner", pin: "根笔记" },
        {
          ...note("branch", 400),
          kind: "canvas",
          title: "项目",
          text: "",
          group: "outer",
          pin: "项目入口",
          canvas: {
            version: 1,
            id: "branch-board",
            groups: [],
            cards: [
              {
                ...note("todo"),
                kind: "todo",
                title: "任务",
                text: "",
                tasks: [
                  { id: "task-1", text: "完成项", done: true },
                  { id: "task-2", text: "待办项", done: false },
                ],
              },
              {
                ...note("scene", 400),
                kind: "miniature",
                title: "城市",
                text: "https://atlanmatrix.github.io/codex-playground/city/",
                width: 640,
                height: 520,
              },
              {
                ...note("deep-node", 80, 800),
                kind: "canvas",
                title: "深层画布",
                text: "",
                canvas: deep,
              },
              {
                ...note("photo", 400, 800),
                kind: "image",
                title: "pixel.png",
                text: "",
                mime: "image/png",
                blob: new Blob(
                  [
                    Uint8Array.from(
                      atob(
                        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
                      ),
                      (c) => c.charCodeAt(0),
                    ),
                  ],
                  { type: "image/png" },
                ),
              },
            ],
            connections: [
              {
                id: "task-link",
                from: { card: "todo", side: "e", task: "task-2" },
                to: { card: "scene", side: "w" },
                label: "相关场景",
              },
            ],
          },
        },
        {
          ...note("sibling", 700),
          kind: "canvas",
          title: "兄弟画布",
          text: "",
          group: "outer",
          canvas: { version: 1, id: "sibling-board", cards: [], groups: [] },
        },
      ],
      connections: [
        {
          id: "root-link",
          from: { card: "root-text", side: "e" },
          to: { card: "branch", side: "w" },
          label: "根级连线",
        },
      ],
    };
    const views = {
      root: { x: 280, y: -90, z: 0.75 },
      "branch-board": { x: -300, y: 100, z: 1.4 },
      deep: { x: 120, y: 60, z: 0.9 },
      "sibling-board": { x: 47, y: -80, z: 1.2 },
    };
    await saveBoard(board, views.deep, {
      path: ["branch", "deep-node"],
      views,
    });
  });
  await page.reload();
  await expect(page.locator(".canvas-navigation")).toHaveText("深层画布");
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    // @ts-expect-error Vite browser source modules.
    const { readBoard, readView, readNavigation, exportBoard } =
      await import("/src/storage.ts");
    return {
      board: JSON.parse(await exportBoard(await readBoard())),
      view: await readView(),
      navigation: await readNavigation(),
    };
  });
}
async function backup(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function upload(page: Page, bytes: Buffer) {
  await page.getByTestId("import").setInputFiles({
    name: "workspace.json",
    mimeType: "application/json",
    buffer: bytes,
  });
}
async function saved(page: Page) {
  await expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
}

test("exporting from a deep canvas restores every canvas, component, byte, ID and view in a fresh browser", async ({
  page,
  browser,
}) => {
  await seed(page);
  const original = await snapshot(page),
    bytes = await backup(page),
    data = JSON.parse(bytes.toString());
  expect(data.format).toBe("yua-canvas-workspace");
  expect(data.cards.map((c: any) => c.id)).toEqual([
    "root-text",
    "branch",
    "sibling",
  ]);
  expect(data.workspace.navigation).toEqual(original.navigation);
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    await fresh.goto(new URL("/", page.url()).href);
    await expect(
      fresh.getByRole("button", { name: "添加任务", exact: true }),
    ).toBeEnabled();
    await upload(fresh, bytes);
    await expect(fresh.getByRole("dialog", { name: "确认导入" })).toContainText(
      "替换整个工作区",
    );
    await expect(fresh.getByRole("dialog", { name: "确认导入" })).toContainText(
      "4 个画布、9 个组件",
    );
    await fresh.getByRole("button", { name: "确认替换" }).click();
    await expect(fresh.locator(".canvas-navigation")).toHaveText("深层画布");
    await saved(fresh);
    expect(await snapshot(fresh)).toEqual(original);
    const roundTrip = JSON.parse((await backup(fresh)).toString());
    expect(roundTrip).toEqual(data);
    const deep = roundTrip.cards[1].canvas.cards.find(
      (c: any) => c.id === "deep-node",
    ).canvas;
    expect(deep.cards[0].mime).toBe("text/plain");
    expect(deep.cards[0].blobType).toBe("application/octet-stream");
    expect(deep.cards[0].blobName).toBe("原始.dat");
    expect(deep.cards[0].blobLastModified).toBe(123456);
    expect(deep.cards[1].blobType).toBe("");
    expect(deep.cards[1].mime).toBeUndefined();
    await fresh.reload();
    await expect(fresh.locator(".canvas-navigation")).toHaveText("深层画布");
    expect(await snapshot(fresh)).toEqual(original);
  } finally {
    await context.close();
  }
});

test("whole-workspace restore replaces parents and siblings from any canvas and can undo without losing old data", async ({
  page,
}) => {
  await seed(page);
  const original = await snapshot(page),
    bytes = await backup(page);
  await page.getByRole("button", { name: "返回父画布", exact: true }).click();
  await page.getByRole("button", { name: "返回父画布", exact: true }).click();
  await page.keyboard.press("n");
  await page
    .getByRole("textbox", { name: "文本内容" })
    .fill("备份之后新增的根内容");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page
    .getByRole("button", { name: "进入子画布 兄弟画布", exact: true })
    .click();
  await saved(page);
  const beforeImport = await snapshot(page);
  await upload(page, bytes);
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".canvas-navigation")).toHaveText("深层画布");
  await saved(page);
  expect(await snapshot(page)).toEqual(original);
  await page.keyboard.press("ControlOrMeta+z");
  await saved(page);
  expect((await snapshot(page)).board).toEqual(beforeImport.board);
});

test("malformed workspace metadata and attachments fail atomically; cancel leaves the workspace untouched", async ({
  page,
}) => {
  await seed(page);
  const original = await snapshot(page),
    bytes = await backup(page),
    data = JSON.parse(bytes.toString());
  const variants = [
    { ...data, workspace: { ...data.workspace, version: 2 } },
    { ...data, workspace: { ...data.workspace, view: { x: 0, y: 0, z: 0 } } },
    {
      ...data,
      workspace: {
        ...data.workspace,
        navigation: { ...data.workspace.navigation, path: ["missing"] },
      },
    },
    {
      ...data,
      workspace: {
        ...data.workspace,
        navigation: {
          ...data.workspace.navigation,
          views: { root: { x: "bad", y: 0, z: 1 } },
        },
      },
    },
  ];
  const missing = structuredClone(data);
  delete missing.cards[1].canvas.cards.find((c: any) => c.id === "photo").blob;
  variants.push(missing);
  for (const value of variants) {
    await upload(page, Buffer.from(JSON.stringify(value)));
    await expect(page.getByRole("dialog", { name: "确认导入" })).toHaveCount(0);
    expect(await snapshot(page)).toEqual(original);
  }
  await upload(page, bytes);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await snapshot(page)).toEqual(original);
});

test("failed storage transaction keeps both the current canvas and saved workspace intact", async ({
  page,
}) => {
  await seed(page);
  const bytes = await backup(page);
  await page.getByRole("button", { name: "返回父画布", exact: true }).click();
  await page.getByRole("button", { name: "返回父画布", exact: true }).click();
  await saved(page);
  const original = await snapshot(page);
  await upload(page, bytes);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    (window as any).restoreTransactions = () => {
      IDBDatabase.prototype.transaction = original;
    };
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<typeof original>
    ) {
      const tx = original.apply(this, args);
      if (this.name === "yua-canvas" && args[1] === "readwrite")
        queueMicrotask(() => tx.abort());
      return tx;
    };
  });
  try {
    await page.getByRole("button", { name: "确认替换" }).click();
    await expect(page.getByRole("status")).toContainText("还原失败");
    await expect(page.getByRole("dialog", { name: "确认导入" })).toBeVisible();
    await expect(page.locator(".canvas-navigation")).toHaveCount(0);
    expect(await snapshot(page)).toEqual(original);
  } finally {
    await page.evaluate(() => (window as any).restoreTransactions());
  }
});

test("export captures an edit immediately, before autosave, and legacy canvas imports remain usable", async ({
  page,
}) => {
  await page.goto("/");
  await openTextEditor(page);
  await page
    .getByRole("textbox", { name: "文本内容" })
    .fill("尚未等待自动保存的内容");
  const bytes = await backup(page),
    data = JSON.parse(bytes.toString());
  expect(data.cards[0].text).toBe("尚未等待自动保存的内容");
  await page.getByRole("button", { name: "创建子画布", exact: true }).click();
  await page
    .getByRole("button", { name: "进入子画布 子画布", exact: true })
    .click();
  const legacy = {
    version: 1,
    groups: [],
    cards: [
      {
        id: "old",
        kind: "text",
        title: "",
        text: "旧版内容",
        x: 80,
        y: 100,
        color: "#ffffff",
        width: 200,
        height: 100,
      },
    ],
  };
  await upload(page, Buffer.from(JSON.stringify(legacy)));
  await expect(page.getByRole("dialog", { name: "确认导入" })).toContainText(
    "替换当前画布",
  );
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator('[data-card-id="old"]')).toHaveText(/旧版内容/);
  await page.getByRole("button", { name: "返回父画布", exact: true }).click();
  await expect(page.locator(".card-text")).toHaveText(/尚未等待自动保存的内容/);
});

test("cloud attachment transport preserves metadata needed for a later complete backup", async ({
  page,
}) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite browser source modules.
    const { readBoard, exportBoard } = await import("/src/storage.ts");
    // @ts-expect-error Vite browser source modules.
    const { packCloud, unpackCloud } = await import("/src/cloud.ts");
    const board = await readBoard(),
      packed = await packCloud(board);
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/assets/")) {
        const asset = packed.assets.get(url.slice("/api/assets/".length));
        return new Response(asset, { status: asset ? 200 : 404 });
      }
      return originalFetch(input, options);
    };
    try {
      return {
        before: JSON.parse(await exportBoard(board)),
        after: JSON.parse(
          await exportBoard(await unpackCloud(packed.snapshot)),
        ),
      };
    } finally {
      window.fetch = originalFetch;
    }
  });
  expect(result.after).toEqual(result.before);
});

test("a slow restore suspends pending autosave until the imported workspace is active", async ({
  page,
}) => {
  await seed(page);
  await saved(page);
  const bytes = await backup(page);
  await page.clock.install();
  await page.getByRole("button", { name: "返回父画布", exact: true }).click();
  await page.getByRole("button", { name: "返回父画布", exact: true }).click();
  await upload(page, bytes);
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction,
      put = IDBObjectStore.prototype.put;
    (window as any).backupWrites = [];
    (window as any).restoreStorageMethods = () => {
      IDBDatabase.prototype.transaction = transaction;
      IDBObjectStore.prototype.put = put;
    };
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === "navigation")
        (window as any).backupWrites.push([...value.path]);
      return put.call(this, value, key);
    };
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<typeof transaction>
    ) {
      const tx = transaction.apply(this, args);
      if (this.name === "yua-canvas" && args[1] === "readwrite") {
        Object.defineProperty(tx, "oncomplete", {
          configurable: true,
          set(callback) {
            tx.addEventListener(
              "complete",
              (event) => {
                (window as any).backupCommitted = true;
                setTimeout(() => callback.call(tx, event), 2000);
              },
              { once: true },
            );
          },
        });
      }
      return tx;
    };
  });
  try {
    await page.getByRole("button", { name: "确认替换" }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).backupCommitted))
      .toBe(true);
    await page.clock.fastForward(800);
    expect(await page.evaluate(() => (window as any).backupWrites)).toEqual([
      ["branch", "deep-node"],
    ]);
    await page.clock.fastForward(1600);
    await expect(page.locator(".canvas-navigation")).toHaveText("深层画布");
    expect((await snapshot(page)).navigation?.path).toEqual([
      "branch",
      "deep-node",
    ]);
  } finally {
    await page.evaluate(() => (window as any).restoreStorageMethods());
  }
});

test("restored file metadata stays lossless while PDF previews use a PDF content type", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  const html = "<script>parent.__attachmentExecuted=true</script>";
  const data = {
    version: 1,
    groups: [],
    cards: [
      {
        id: "pdf",
        kind: "file",
        title: "legacy.pdf",
        text: "",
        x: 80,
        y: 100,
        width: 240,
        height: 250,
        color: "#ffffff",
        mime: "application/pdf",
        blobType: "text/html",
        blob: "data:text/html;base64," + Buffer.from(html).toString("base64"),
      },
    ],
  };
  await upload(page, Buffer.from(JSON.stringify(data)));
  await page.getByRole("button", { name: "确认替换" }).click();
  await page.locator(".card-file").dblclick();
  await expect(page.locator(".pdf")).toHaveAttribute("src", /^blob:/);
  const type = await page
    .locator(".pdf")
    .evaluate(async (frame: HTMLIFrameElement) =>
      (await fetch(frame.src)).headers.get("Content-Type"),
    );
  expect(type).toBe("application/pdf");
  expect(
    await page.evaluate(() => (window as any).__attachmentExecuted),
  ).toBeUndefined();
  await page.keyboard.press("Escape");
  const exported = JSON.parse((await backup(page)).toString());
  expect(exported.cards[0].mime).toBe("application/pdf");
  expect(exported.cards[0].blobType).toBe("text/html");
  expect(exported.cards[0].blob).toBe(data.cards[0].blob);
});

import { test, expect, type Page } from "@playwright/test";
const password = "test-master-password-2026";
const saved = (page: Page) =>
  expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
async function note(page: Page, value: string) {
  await page.keyboard.press("n");
  await page
    .getByRole("textbox", { name: "文本内容", exact: true })
    .fill(value);
  await page.keyboard.press("ControlOrMeta+Enter");
}
async function menu(page: Page, name: string) {
  await page
    .getByTestId("card")
    .first()
    .dispatchEvent("contextmenu", { clientX: 400, clientY: 200 });
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function submit(page: Page, first = false, value = password) {
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "主密码", exact: true })
    .fill(value);
  if (first)
    await dialog
      .getByRole("textbox", { name: "确认主密码", exact: true })
      .fill(value);
  await dialog.locator("button.primary").click();
}
async function stored(page: Page) {
  await saved(page);
  return page.evaluate(async () => {
    const { readBoard, exportBoard } = await import("/src/storage.ts");
    const root = (await readBoard())!;
    return { raw: await exportBoard(root), root };
  });
}

test("remove encryption authenticates locked components and persists plaintext after reload and export", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await note(page, "永久取消加密的文本");
  await menu(page, "密码锁定");
  await submit(page, true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await menu(page, "取消加密");
  await expect(
    page.getByRole("dialog", { name: "取消加密", exact: true }),
  ).toContainText("明文");
  await submit(page, false, "wrong-password");
  await expect(page.getByRole("alert")).toHaveText("密码错误或加密数据已损坏");
  expect((await stored(page)).root.cards[0].locked).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".component-locked")).toBeVisible();
  await menu(page, "取消加密");
  await submit(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".note-body")).toHaveText("永久取消加密的文本");
  const plain = await stored(page);
  expect(plain.root.cards[0].lock).toBeUndefined();
  expect(plain.root.cards[0].locked).toBeUndefined();
  expect(plain.raw).toContain("永久取消加密的文本");
  await page.reload();
  await expect(page.locator(".note-body")).toHaveText("永久取消加密的文本");
  await page
    .getByTestId("card")
    .dispatchEvent("contextmenu", { clientX: 400, clientY: 200 });
  await expect(
    page.getByRole("menuitem", { name: "取消加密", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "密码锁定", exact: true }),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载", exact: true }).click();
  const chunks: Buffer[] = [];
  for await (const chunk of (await (await pending).createReadStream())!)
    chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe("永久取消加密的文本");
});

test("removing encryption from an open component verifies the password and keeps the newest edits", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await note(page, "加密前的文本");
  await menu(page, "密码锁定");
  await submit(page, true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await menu(page, "密码解锁");
  await submit(page);
  await expect(page.locator(".note-body")).toHaveText("加密前的文本");
  await page.locator(".note-body").dblclick();
  await page
    .getByRole("textbox", { name: "文本内容", exact: true })
    .fill("解锁后最新的修改");
  await page.keyboard.press("ControlOrMeta+Enter");
  await menu(page, "取消加密");
  await submit(page, false, "wrong-password");
  await expect(page.getByRole("alert")).toHaveText("密码错误或加密数据已损坏");
  await submit(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".note-body")).toHaveText("解锁后最新的修改");
  expect((await stored(page)).root.cards[0].text).toBe("解锁后最新的修改");
  await page.reload();
  await expect(page.locator(".note-body")).toHaveText("解锁后最新的修改");
});

test("removing a canvas lock preserves independently encrypted descendants, sibling locks and parent protection", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const result = await page.evaluate(async (password) => {
    const {
      createLockProfile,
      lockCard,
      unlockCard,
      removeEncryption,
      releaseUnusedKeys,
      inheritProtection,
    } = await import("/src/encryption.ts");
    const { exportBoard } = await import("/src/storage.ts");
    const profile = await createLockProfile(password);
    const note = (id: string, text: string) =>
      ({
        id,
        kind: "text",
        title: "",
        text,
        x: 20,
        y: 30,
        color: "#ffffff",
      }) as any;
    const child = await lockCard(
      note("child", "独立子组件秘密"),
      profile,
      password,
    );
    const sibling = await lockCard(
      note("sibling", "兄弟组件秘密"),
      profile,
      password,
    );
    const parent = await lockCard(
      {
        id: "parent",
        kind: "canvas",
        title: "画布",
        text: "",
        x: 10,
        y: 10,
        color: "#ffffff",
        canvas: {
          version: 1,
          id: "inside",
          cards: [note("plain", "取消后的普通内容"), child],
          groups: [],
        },
      },
      profile,
      password,
    );
    const open = await unlockCard(parent, password);
    const ownOpen = await unlockCard(open.canvas!.cards[1], password);
    const root = {
      version: 1,
      cards: [
        {
          ...open,
          canvas: { ...open.canvas!, cards: [open.canvas!.cards[0], ownOpen] },
        },
        sibling,
      ],
      groups: [],
    } as any;
    const removed = await removeEncryption(root.cards[0], password, root);
    const updated = { ...root, cards: [removed, sibling] };
    releaseUnusedKeys(updated);
    const raw = await exportBoard(updated);
    const standalone = JSON.parse(raw);
    const outer = await unlockCard(parent, password);
    const nestedRemoved = await removeEncryption(
      outer.canvas!.cards[1],
      password,
      { version: 1, cards: [outer], groups: [] },
    );
    const scoped = inheritProtection(
      { ...outer.canvas!, cards: [outer.canvas!.cards[0], nestedRemoved] },
      outer.canvas!.protection!,
    );
    const scopedExport = await exportBoard({
      version: 1,
      cards: [scoped.cards[1]],
      groups: [],
    });
    return {
      raw,
      scopedExport,
      parentLock: removed.lock,
      scope: removed.canvas!.protection,
      childInheritance: removed.canvas!.cards[0].inheritedLock,
      independent: standalone.cards[0].canvas.cards[1].locked,
      sibling: standalone.cards[1].locked,
    };
  }, password);
  expect(result.raw).toContain("取消后的普通内容");
  expect(result.raw).not.toContain("独立子组件秘密");
  expect(result.raw).not.toContain("兄弟组件秘密");
  expect(result.parentLock).toBeUndefined();
  expect(result.scope).toBeUndefined();
  expect(result.childInheritance).toBeUndefined();
  expect(result.independent).toBe(true);
  expect(result.sibling).toBe(true);
  expect(result.scopedExport).not.toContain("独立子组件秘密");
  expect(JSON.parse(result.scopedExport).cards[0].locked).toBe(true);
});

test("password locks are encrypted at rest, reject a wrong password, edit only in session and relock on refresh", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await note(page, "私密文本-绝不能保存明文");
  await menu(page, "密码锁定");
  await submit(page, true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".component-locked")).toBeVisible();
  await expect(
    page.getByText("私密文本-绝不能保存明文", { exact: true }),
  ).toHaveCount(0);
  const initial = await stored(page);
  expect(initial.raw).not.toContain("私密文本");
  expect(initial.raw).not.toContain(password);
  expect(initial.root.cards[0].locked).toBe(true);
  expect(initial.root.cards[0].lock?.wrappedKey.ciphertext).toBeTruthy();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".component-locked")).toBeVisible();
  await menu(page, "密码解锁");
  await submit(page, false, "incorrect-password");
  await expect(page.getByRole("alert")).toHaveText("密码错误或加密数据已损坏");
  await expect(page.locator(".component-locked")).toBeVisible();
  await submit(page);
  await expect(page.locator(".note-body")).toHaveText(
    "私密文本-绝不能保存明文",
  );
  await page.locator(".note-body").dblclick();
  await page
    .getByRole("textbox", { name: "文本内容", exact: true })
    .fill("解锁后修改的秘密");
  await page.keyboard.press("ControlOrMeta+Enter");
  const edited = await stored(page);
  expect(edited.raw).not.toContain("修改的秘密");
  expect(edited.root.cards[0].locked).toBe(true);
  await page.reload();
  await expect(page.locator(".component-locked")).toBeVisible();
  await menu(page, "密码解锁");
  await submit(page);
  await expect(page.locator(".note-body")).toHaveText("解锁后修改的秘密");
  await menu(page, "重新锁定");
  await expect(page.locator(".component-locked")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".component-locked")).toBeVisible();
});

test("one master password wraps independent component keys; cloning requires authentication and creates a fresh key", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await note(page, "第一个秘密");
  await menu(page, "密码锁定");
  await submit(page, true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByTestId("card").click();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(
    page.getByRole("dialog", { name: "复制加密组件" }),
  ).toBeVisible();
  await submit(page);
  await expect(page.getByTestId("card")).toHaveCount(2);
  const { root } = await stored(page);
  expect(root.cards[0].lock?.profile).toEqual(root.cards[1].lock?.profile);
  expect(root.cards[0].lock?.id).not.toBe(root.cards[1].lock?.id);
  expect(root.cards[0].lock?.wrappedKey.ciphertext).not.toBe(
    root.cards[1].lock?.wrappedKey.ciphertext,
  );
  expect(root.cards[0].lock?.dataIV).not.toBe(root.cards[1].lock?.dataIV);
  await page
    .getByTestId("card")
    .last()
    .dispatchEvent("contextmenu", { clientX: 400, clientY: 200 });
  await page.getByRole("menuitem", { name: "密码解锁", exact: true }).click();
  await submit(page);
  await expect(page.locator(".note-body")).toHaveText("第一个秘密");
  await note(page, "第二个秘密");
  await stored(page);
  await page.reload();
  await saved(page);
  await page
    .getByTestId("card")
    .last()
    .dispatchEvent("contextmenu", { clientX: 400, clientY: 200 });
  await page.getByRole("menuitem", { name: "密码锁定", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "确认主密码", exact: true }),
  ).toHaveCount(0);
  await submit(page, false, "another-master-password");
  await expect(page.getByRole("alert")).toHaveText("密码错误或加密数据已损坏");
  await submit(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await stored(page)).root.cards.at(-1)?.lock?.profile).toEqual(
    root.cards[0].lock?.profile,
  );
});

test("a read-only encrypted share asks for the password and its downloaded snapshot remains encrypted", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const packed = await page.evaluate(async (password) => {
    const { createLockProfile, lockCard } = await import("/src/encryption.ts");
    const { packCloud } = await import("/src/cloud.ts");
    const profile = await createLockProfile(password);
    const card = await lockCard(
      {
        id: "shared",
        kind: "text",
        title: "",
        text: "只读分享秘密",
        x: 80,
        y: 100,
        color: "#ffffff",
        width: 320,
        height: 80,
      },
      profile,
      password,
    );
    const value = await packCloud({
      version: 1,
      cards: [card],
      groups: [],
      lockProfile: profile,
    });
    const [id, blob] = [...value.assets.entries()][0];
    return {
      snapshot: value.snapshot,
      id,
      bytes: [...new Uint8Array(await blob.arrayBuffer())],
    };
  }, password);
  await page.route("**/api/shares/resolve", (route) =>
    route.fulfill({ json: { snapshot: packed.snapshot } }),
  );
  await page.route("**/api/assets/**", (route) =>
    route.fulfill({
      body: Buffer.from(packed.bytes),
      contentType: "application/octet-stream",
    }),
  );
  await page.goto("/#/s/" + "a".repeat(64));
  await expect(page.locator(".component-locked")).toBeVisible();
  await page.getByRole("button", { name: "密码解锁", exact: true }).click();
  await submit(page);
  await expect(page.locator(".share-card .note-body")).toHaveText(
    "只读分享秘密",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载快照", exact: true }).click();
  const stream = await (await pending).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  expect(raw).not.toContain("只读分享秘密");
  expect(JSON.parse(raw).cards[0].locked).toBe(true);
  await page.reload();
  await expect(page.locator(".component-locked")).toBeVisible();
});

test("copying through the system clipboard never writes plaintext and pasting uses a new component key", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await saved(page);
  await note(page, "剪贴板中的秘密");
  await menu(page, "密码锁定");
  await submit(page, true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByTestId("card").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByRole("status")).toContainText("已复制");
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).not.toContain("剪贴板中的秘密");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(
    page.getByRole("dialog", { name: "复制加密组件" }),
  ).toBeVisible();
  await submit(page);
  await expect(page.getByTestId("card")).toHaveCount(2);
  const root = (await stored(page)).root;
  expect(root.cards[0].lock?.id).not.toBe(root.cards[1].lock?.id);
});

test("repeated encrypted backup imports isolate hidden canvas IDs and keys before editing", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const result = await page.evaluate(async (password) => {
    const {
      createLockProfile,
      lockCard,
      unlockIsolated,
      forgetCard,
      sealBoard,
    } = await import("/src/encryption.ts");
    const profile = await createLockProfile(password);
    const locked = await lockCard(
      {
        id: "first",
        kind: "canvas",
        title: "秘密标题",
        text: "",
        x: 0,
        y: 0,
        color: "#ffffff",
        canvas: {
          version: 1,
          id: "hidden",
          cards: [
            {
              id: "note",
              kind: "text",
              title: "",
              text: "秘密",
              x: 0,
              y: 0,
              color: "#ffffff",
            },
          ],
          groups: [],
        },
      },
      profile,
      password,
    );
    let root = {
      version: 1,
      id: "root",
      cards: [locked, { ...locked, id: "second" }],
      groups: [],
    } as any;
    const first = await unlockIsolated(root.cards[0], password, root);
    root = { ...root, cards: [first, root.cards[1]] };
    const second = await unlockIsolated(root.cards[1], password, root);
    root = { ...root, cards: [first, second] };
    forgetCard(first);
    const edited = {
      ...second,
      canvas: {
        ...second.canvas!,
        cards: second.canvas!.cards.map((c) => ({ ...c, text: "新秘密" })),
      },
    };
    const sealed = await sealBoard({ version: 1, cards: [edited], groups: [] });
    return {
      keys: [first.lock!.id, second.lock!.id],
      boards: [first.canvas!.id, second.canvas!.id],
      locked: sealed.cards[0].locked,
    };
  }, password);
  expect(new Set(result.keys).size).toBe(2);
  expect(new Set(result.boards).size).toBe(2);
  expect(result.locked).toBe(true);
});

test("locking clears old PDF and tool caches and unlocked protected content cannot recreate plaintext disk previews", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const result = await page.evaluate(async (password) => {
    const { savePdfBitmap, readPdfBitmap } =
      await import("/src/previewDisk.ts");
    const { saveToolCache } = await import("/src/toolData.ts");
    const { lockCard, createLockProfile, unlockCard } =
      await import("/src/encryption.ts");
    const bitmap = {
      blob: new Blob(["private preview"]),
      page: 1,
      pages: 1,
      width: 10,
      height: 10,
    };
    await savePdfBitmap("before-lock", bitmap);
    const before = !!(await readPdfBitmap("before-lock"));
    saveToolCache("private-location", { latitude: 12, longitude: 34 });
    const card = await lockCard(
      {
        id: "text",
        kind: "text",
        title: "",
        text: "secret",
        x: 0,
        y: 0,
        color: "#ffffff",
      },
      await createLockProfile(password),
      password,
    );
    await unlockCard(card, password);
    await savePdfBitmap("after-unlock", bitmap);
    saveToolCache("private-location-after", { latitude: 45, longitude: 67 });
    const count = await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open("yua-preview-cache", 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("pdf");
        const q = tx.objectStore("pdf").count();
        q.onsuccess = () => {
          resolve(q.result);
          db.close();
        };
        q.onerror = () => reject(q.error);
      };
      request.onerror = () => reject(request.error);
    });
    return {
      before,
      count,
      tools: Object.keys(localStorage).filter((k) => k.startsWith("yua-tool:")),
    };
  }, password);
  expect(result.before).toBe(true);
  expect(result.count).toBe(0);
  expect(result.tools).toEqual([]);
});

test("new and imported content inside an unlocked encrypted canvas inherits protection for direct downloads", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await page.getByRole("button", { name: "创建子画布", exact: true }).click();
  await menu(page, "密码锁定");
  await submit(page, true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await menu(page, "密码解锁");
  await submit(page);
  await page
    .getByRole("button", { name: "进入子画布 子画布", exact: true })
    .click();
  await note(page, "新建在保护层内的秘密");
  const download = async () => {
    await page
      .getByTestId("card")
      .first()
      .dispatchEvent("contextmenu", { clientX: 400, clientY: 200 });
    const pending = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "下载", exact: true }).click();
    const chunks: Buffer[] = [];
    for await (const chunk of (await (await pending).createReadStream())!)
      chunks.push(chunk);
    return Buffer.concat(chunks).toString();
  };
  const created = await download();
  expect(created).not.toContain("新建在保护层内的秘密");
  expect(JSON.parse(created).cards[0].locked).toBe(true);
  await page
    .getByTestId("import")
    .setInputFiles({
      name: "plain.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          cards: [
            {
              id: "imported",
              kind: "text",
              title: "",
              text: "导入后仍受保护",
              x: 80,
              y: 100,
              color: "#ffffff",
            },
          ],
          groups: [],
        }),
      ),
    });
  await page.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".note-body")).toHaveText("导入后仍受保护");
  const imported = await download();
  expect(imported).not.toContain("导入后仍受保护");
  expect(JSON.parse(imported).cards[0].locked).toBe(true);
  await saved(page);
  await page.reload();
  await expect(page.locator(".component-locked")).toBeVisible();
  await expect(page.locator(".note-body")).toHaveCount(0);
});

test("encrypted Todo edits update public task references and deleted tasks prune links before encrypted backups", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const result = await page.evaluate(async (password) => {
    const { createLockProfile, lockCard, unlockCard } =
      await import("/src/encryption.ts");
    const { exportBoard, importBoard } = await import("/src/storage.ts");
    const { pruneConnections } = await import("/src/connections.ts");
    const base = {
      id: "todo",
      kind: "todo",
      title: "",
      text: "",
      x: 0,
      y: 0,
      color: "#ffffff",
      tasks: [{ id: "old-task", text: "旧秘密", done: false }],
    } as any;
    const locked = await lockCard(
      base,
      await createLockProfile(password),
      password,
    );
    const open = await unlockCard(locked, password);
    const edited = {
      ...open,
      tasks: [...open.tasks!, { id: "new-task", text: "新秘密", done: true }],
    };
    const target = {
      id: "target",
      kind: "text",
      title: "",
      text: "target",
      x: 400,
      y: 0,
      color: "#ffffff",
    };
    const connections = [
      {
        id: "old",
        from: { card: "todo", task: "old-task", side: "e" },
        to: { card: "target", side: "w" },
      },
      {
        id: "new",
        from: { card: "todo", task: "new-task", side: "e" },
        to: { card: "target", side: "w" },
      },
    ];
    const root = {
      version: 1,
      cards: [edited, target],
      groups: [],
      connections,
    } as any;
    const restored = await importBoard(await exportBoard(root));
    const trimmed = pruneConnections({
      ...root,
      cards: [
        { ...edited, tasks: edited.tasks.filter((t) => t.id !== "old-task") },
        target,
      ],
    });
    const trimmedRestored = await importBoard(await exportBoard(trimmed));
    return {
      before: restored.connections?.length,
      after: trimmedRestored.connections?.map((c) => c.id),
      taskIds: trimmedRestored.cards[0].lock?.taskIds,
    };
  }, password);
  expect(result.before).toBe(2);
  expect(result.after).toEqual(["new"]);
  expect(result.taskIds).toEqual(["new-task"]);
});

test("file and canvas envelopes round trip JSON, ZIP and cloud without plaintext or unencrypted assets; tampering fails atomically", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const result = await page.evaluate(async (password) => {
    const { lockCard, unlockCard, sealBoard, createLockProfile } =
      await import("/src/encryption.ts");
    const { importBoard, exportBoard } = await import("/src/storage.ts");
    const { createArchive, readArchive } = await import("/src/archive.ts");
    const { packCloud } = await import("/src/cloud.ts");
    const profile = await createLockProfile(password);
    const plain = {
      id: "file",
      kind: "file",
      title: "secret-name.json",
      text: "",
      mime: "application/json",
      x: 20,
      y: 30,
      color: "#ffffff",
      blob: new File(['{"secret-body":"私密附件"}'], "original.json", {
        type: "application/json",
        lastModified: 1234,
      }),
      remark: "保密备注",
    } as any;
    const locked = await lockCard(plain, profile, password);
    const open = await unlockCard(locked, password);
    const board = {
      version: 1,
      groups: [],
      cards: [open],
      lockProfile: profile,
    } as any;
    const raw = await exportBoard(board);
    const restored = await importBoard(raw);
    const decoded = await unlockCard(restored.cards[0], password);
    const zip = await createArchive(board);
    const archive = await readArchive(
      new File([zip], "locked.zip", { type: "application/zip" }),
      { x: 0, y: 0 },
    );
    const zipBoard = archive;
    const packed = await packCloud(board);
    const asset = [...packed.assets.values()][0];
    let tamperRejected = false;
    const bad = {
      ...locked,
      blob: new Blob([
        new Uint8Array(await locked.blob!.arrayBuffer()).fill(0),
      ]),
    };
    try {
      await unlockCard(bad, password);
    } catch {
      tamperRejected = true;
    }
    const same = await sealBoard(board),
      again = await sealBoard(board);
    return {
      raw,
      title: decoded.title,
      bytes: await decoded.blob!.text(),
      fileName: (decoded.blob as File).name,
      modified: (decoded.blob as File).lastModified,
      packed: JSON.stringify(packed.snapshot),
      assetText: await asset.text(),
      zipCards: zipBoard.cards.length,
      zipLock: zipBoard.cards[0].locked,
      tamperRejected,
      stable: (await exportBoard(same)) === (await exportBoard(again)),
    };
  }, password);
  expect(result.raw).not.toContain("secret-name");
  expect(result.raw).not.toContain("私密附件");
  expect(result.packed).not.toContain("secret-name");
  expect(result.assetText).not.toContain("私密附件");
  expect(result.title).toBe("secret-name.json");
  expect(result.fileName).toBe("original.json");
  expect(result.modified).toBe(1234);
  expect(result.bytes).toContain("私密附件");
  expect(result.zipCards).toBe(1);
  expect(result.zipLock).toBe(true);
  expect(result.tamperRejected).toBe(true);
  expect(result.stable).toBe(true);
});

test("protected child-canvas exports and selections remain encrypted and a deep workspace backup restores to its locked ancestor", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const result = await page.evaluate(async (password) => {
    const { createLockProfile, lockCard, unlockCard, sealBoard } =
      await import("/src/encryption.ts");
    const { exportBoard, saveBoard, readNavigation } =
      await import("/src/storage.ts");
    const { exportWorkspace, readCanvasImport } =
      await import("/src/workspaceBackup.ts");
    const { selectedFragment } = await import("/src/fragments.ts");
    const { packCloud } = await import("/src/cloud.ts");
    const profile = await createLockProfile(password);
    const inner = {
      id: "inner-note",
      kind: "text",
      title: "",
      text: "秘密子画布内容",
      x: 80,
      y: 100,
      color: "#ffffff",
      group: "private-group",
    } as any;
    const canvas = {
      id: "canvas",
      kind: "canvas",
      title: "秘密父级标题",
      text: "",
      x: 80,
      y: 100,
      color: "#ffffff",
      canvas: {
        version: 1,
        id: "private-board",
        cards: [inner],
        groups: [
          {
            id: "private-group",
            name: "秘密分组名称",
            bounds: { x: 20, y: 20, width: 400, height: 300 },
          },
        ],
      },
    } as any;
    const locked = await lockCard(canvas, profile, password);
    const open = await unlockCard(locked, password);
    const root = {
      version: 1,
      id: "root",
      cards: [open],
      groups: [],
      lockProfile: profile,
    } as any;
    const navigation = {
      path: ["canvas"],
      views: {
        root: { x: 65, y: 55, z: 1 },
        "private-board": { x: 10, y: 20, z: 1 },
      },
    };
    const backup = await exportWorkspace({
      board: root,
      navigation,
      view: { x: 10, y: 20, z: 1 },
    });
    const restored = await readCanvasImport(backup);
    await saveBoard(root, { x: 10, y: 20, z: 1 }, navigation);
    const localPath = (await readNavigation())?.path;
    const child = await exportBoard(open.canvas!);
    const fragment = selectedFragment(open.canvas!, ["private-group"]);
    const selection = await sealBoard(fragment);
    const cloud = await packCloud(open.canvas!);
    const single = await exportBoard({
      version: 1,
      cards: [open.canvas!.cards[0]],
      groups: [],
    });
    const revealed = await unlockCard(
      (await sealBoard(open.canvas!)).cards[0],
      password,
    );
    return {
      backup,
      path: restored.workspace?.navigation.path,
      locked: restored.board.cards[0].locked,
      localPath,
      child,
      selection: JSON.stringify(selection),
      cloud: JSON.stringify(cloud.snapshot),
      single,
      restoredText: revealed.canvas?.cards[0].canvas?.cards[0].text,
      restoredGroup: revealed.canvas?.cards[0].title,
    };
  }, password);
  for (const value of [
    result.backup,
    result.child,
    result.selection,
    result.cloud,
    result.single,
  ]) {
    expect(value).not.toContain("秘密");
    expect(value).not.toContain(password);
  }
  expect(result.path).toEqual([]);
  expect(result.localPath).toEqual([]);
  expect(result.locked).toBe(true);
  expect(result.restoredText).toBe("秘密子画布内容");
  expect(result.restoredGroup).toBe("秘密分组名称");
});

test("every editable component kind encrypts and restores; malformed envelopes are rejected rather than imported as plaintext", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  const result = await page.evaluate(async (password) => {
    const { createLockProfile, lockCard, unlockCard } =
      await import("/src/encryption.ts");
    const { exportBoard, importBoard } = await import("/src/storage.ts");
    const { defaultAgent } = await import("/src/agent.ts");
    const profile = await createLockProfile(password);
    const base = {
      id: "test",
      title: "秘密名称",
      text: "秘密文本",
      x: 0,
      y: 0,
      color: "#ffffff",
      remark: "秘密备注",
      pin: "秘密Pin",
    };
    const specs: any[] = [
      { kind: "text" },
      { kind: "todo", tasks: [{ id: "task", text: "秘密任务", done: true }] },
      { kind: "file", blob: new Blob(["秘密文件"], { type: "text/plain" }) },
      {
        kind: "image",
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      },
      { kind: "mermaid", text: "flowchart LR\n A --> B" },
      { kind: "miniature", text: "https://example.com/scene" },
      { kind: "agent", text: JSON.stringify(defaultAgent) },
      { kind: "vscode", text: "/private/project" },
      { kind: "iterm2", text: "echo private" },
      ...[
        "calculator",
        "currency",
        "temperature",
        "distance",
        "weather",
        "calendar",
      ].map((kind) => ({ kind, text: "{}" })),
    ];
    const restored: string[] = [],
      ids: string[] = [];
    for (const spec of specs) {
      const locked = await lockCard({ ...base, ...spec }, profile, password);
      const imported = await importBoard(
        await exportBoard({ version: 1, cards: [locked], groups: [] }),
      );
      const open = await unlockCard(imported.cards[0], password);
      if (
        open.remark !== base.remark ||
        open.pin !== base.pin ||
        open.title !== base.title
      )
        throw Error("metadata lost");
      restored.push(open.kind);
      ids.push(locked.lock!.id);
    }
    const example = await lockCard(
      { ...base, kind: "text" } as any,
      profile,
      password,
    );
    const data = JSON.parse(
      await exportBoard({ version: 1, cards: [example], groups: [] }),
    );
    const cases = [
      (d: any) => {
        d.cards[0].text = "plaintext";
      },
      (d: any) => {
        d.cards[0].lock.profile.iterations = 1;
      },
      (d: any) => {
        d.cards[0].lock.wrappedKey.ciphertext = "invalid";
      },
      (d: any) => {
        d.cards[0].lock.password = "forbidden";
      },
      (d: any) => {
        delete d.cards[0].blob;
      },
    ];
    let rejected = 0;
    for (const alter of cases) {
      const copy = structuredClone(data);
      alter(copy);
      try {
        await importBoard(JSON.stringify(copy));
      } catch {
        rejected++;
      }
    }
    return { restored, unique: new Set(ids).size, rejected };
  }, password);
  expect(result.restored).toHaveLength(15);
  expect(result.unique).toBe(15);
  expect(result.rejected).toBe(5);
});

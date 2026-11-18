import { test, expect, type Page } from "@playwright/test";
import { openSettings } from "./settings-helper.mjs";
const password = "original-master-password";
const nextPassword = "replacement-master-password";
async function note(page: Page, text: string) {
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.locator(".canvas").click({ position: { x: 800, y: 500 } });
  await page.keyboard.press("n");
  await page.getByRole("textbox", { name: "文本内容", exact: true }).fill(text);
  await page.keyboard.press("ControlOrMeta+Enter");
}
async function menu(page: Page, name: string, index = 0) {
  await page
    .getByTestId("card")
    .nth(index)
    .dispatchEvent("contextmenu", { clientX: 400, clientY: 200 });
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function openManagement(page: Page) {
  await openSettings(page);
  const settings = page.getByRole("dialog", { name: "设置", exact: true });
  await expect(
    settings.getByRole("button", { name: "设置主密码", exact: true }),
  ).toHaveCount(0);
  await settings.getByRole("button", { name: "主密码", exact: true }).click();
  await expect(settings).not.toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "主密码管理", exact: true }),
  ).toBeVisible();
}
async function action(page: Page, name: string) {
  await openManagement(page);
  await page.getByRole("button", { name, exact: true }).click();
}
async function submit(page: Page, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values))
    await page
      .getByRole("dialog")
      .getByLabel(name, { exact: true })
      .fill(value);
  await page.getByRole("dialog").locator("button.primary").click();
}
async function noDialog(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function persisted(page: Page) {
  return page.evaluate(async () => {
    const { readBoard, exportBoard } = await import("/src/storage.ts");
    return exportBoard((await readBoard())!);
  });
}

test("settings configures and verifies a session, encrypts directly, and revokes authorization by locking open content", async ({
  page,
}) => {
  await page.goto("/");
  await openManagement(page);
  await expect(page.getByLabel("主密码管理")).toContainText("未设置");
  await page.getByRole("button", { name: "设置主密码", exact: true }).click();
  await submit(page, { 新密码: password, 确认新密码: "not-the-same" });
  await expect(page.getByRole("alert")).toHaveText("两次输入的密码不一致");
  await submit(page, { 确认新密码: password });
  await noDialog(page);
  await openManagement(page);
  await expect(page.getByLabel("主密码管理")).toContainText("已设置 · 已验证");
  await page.keyboard.press("Escape");
  await note(page, "会话秘密");
  await menu(page, "密码锁定");
  await expect(page.locator(".component-locked")).toBeVisible();
  await noDialog(page);
  expect(await persisted(page)).not.toContain(password);
  await page.reload();
  await openManagement(page);
  await expect(page.getByLabel("主密码管理")).toContainText("已设置 · 未验证");
  await page.getByRole("button", { name: "验证主密码", exact: true }).click();
  await submit(page, { 主密码: "wrong-password" });
  await expect(page.getByRole("alert")).toHaveText("密码错误或加密数据已损坏");
  await submit(page, { 主密码: password });
  await noDialog(page);
  await note(page, "新组件");
  await menu(page, "密码锁定", 1);
  await expect(page.locator(".component-locked")).toHaveCount(2);
  await noDialog(page);
  await menu(page, "密码解锁");
  await submit(page, { 主密码: password });
  await expect(page.locator(".note-body")).toHaveText("会话秘密");
  await action(page, "清除会话授权");
  await expect(page.locator(".component-locked")).toHaveCount(2);
  await openManagement(page);
  await expect(page.getByLabel("主密码管理")).toContainText("已设置 · 未验证");
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".component-locked")).toHaveCount(2);
  await note(page, "需要再次验证");
  await menu(page, "密码锁定", 2);
  await expect(page.getByRole("dialog")).toBeVisible();
  await submit(page, { 主密码: password });
  await expect(page.locator(".component-locked")).toHaveCount(3);
});

test("changing the password checks both inputs, preserves latest open edits, and persists only the new password envelopes", async ({
  page,
}) => {
  await page.goto("/");
  await note(page, "修改前");
  await menu(page, "密码锁定");
  await submit(page, { 主密码: password, 确认主密码: password });
  await noDialog(page);
  await menu(page, "密码解锁");
  await submit(page, { 主密码: password });
  await page.locator(".note-body").dblclick();
  await page
    .getByRole("textbox", { name: "文本内容", exact: true })
    .fill("未丢失的最新编辑");
  await page.keyboard.press("ControlOrMeta+Enter");
  const before = await persisted(page);
  await action(page, "修改主密码");
  await submit(page, {
    原密码: "wrong-password",
    新密码: nextPassword,
    确认新密码: nextPassword,
  });
  await expect(page.getByRole("alert")).toHaveText("密码错误或加密数据已损坏");
  expect(JSON.parse(await persisted(page)).lockProfile).toEqual(
    JSON.parse(before).lockProfile,
  );
  await submit(page, { 原密码: password, 确认新密码: "mismatch" });
  await expect(page.getByRole("alert")).toHaveText("两次输入的密码不一致");
  await submit(page, { 确认新密码: nextPassword });
  await noDialog(page);
  await expect(page.locator(".component-locked")).toBeVisible();
  const raw = await persisted(page);
  expect(raw).not.toContain("未丢失的最新编辑");
  expect(raw).not.toContain(password);
  expect(raw).not.toContain(nextPassword);
  expect(JSON.parse(raw).lockProfile.salt).not.toBe(
    JSON.parse(before).lockProfile.salt,
  );
  await page.reload();
  await menu(page, "密码解锁");
  await submit(page, { 主密码: password });
  await expect(page.getByRole("alert")).toHaveText("密码错误或加密数据已损坏");
  await submit(page, { 主密码: nextPassword });
  await expect(page.locator(".note-body")).toHaveText("未丢失的最新编辑");
});

test("password rotation migrates hidden nested locks and attachments, preserves old backups, and rejects mixed-password or damaged data atomically", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(
    async ({ password, nextPassword }) => {
      const {
        createLockProfile,
        lockCard,
        unlockCard,
        changeMasterPassword,
        clearMasterAuthorization,
        hasMasterAuthorization,
      } = await import("/src/encryption.ts");
      const { exportBoard, saveBoard, readBoard } =
        await import("/src/storage.ts");
      const profile = await createLockProfile(password);
      const base = {
        id: "a",
        kind: "text" as const,
        title: "name",
        text: "nested secret",
        x: 1,
        y: 2,
        color: "#fff",
      };
      const file = await lockCard(
        {
          ...base,
          id: "file",
          kind: "file",
          blob: new Blob(["attachment secret"], { type: "text/plain" }),
        },
        profile,
        password,
      );
      const parent = await lockCard(
        {
          ...base,
          id: "parent",
          kind: "canvas",
          canvas: { version: 1, cards: [file], groups: [] },
        },
        profile,
        password,
      );
      const root = {
        version: 1 as const,
        lockProfile: profile,
        cards: [parent],
        groups: [],
      };
      await saveBoard(root);
      const original = await exportBoard(root);
      const migrated = await changeMasterPassword(root, password, nextPassword);
      const raw = await exportBoard(migrated);
      await saveBoard(migrated);
      clearMasterAuthorization();
      const noNewAuthorization = !hasMasterAuthorization(migrated.lockProfile);
      let oldRejected = false;
      try {
        await unlockCard(migrated.cards[0], password);
      } catch {
        oldRejected = true;
      }
      const open = await unlockCard(migrated.cards[0], nextPassword);
      const child = await unlockCard(open.canvas!.cards[0], nextPassword);
      const oldOpen = await unlockCard(parent, password);
      const backupFile = await unlockCard(oldOpen.canvas!.cards[0], password);
      const otherProfile = await createLockProfile("different-import-password");
      const other = await lockCard(
        base,
        otherProfile,
        "different-import-password",
      );
      const before = await exportBoard((await readBoard())!);
      let mixedRejected = false;
      try {
        await changeMasterPassword(
          { ...root, cards: [parent, other] },
          password,
          nextPassword,
        );
      } catch {
        mixedRejected = true;
      }
      const bad = { ...parent, blob: new Blob(["corrupt"]) };
      let damagedRejected = false;
      try {
        await changeMasterPassword(
          { ...root, cards: [bad] },
          password,
          nextPassword,
        );
      } catch {
        damagedRejected = true;
      }
      return {
        oldRejected,
        content: await child.blob!.text(),
        backupContent: await backupFile.blob!.text(),
        sameProfile:
          JSON.stringify(open.canvas!.cards[0].lock!.profile) ===
          JSON.stringify(migrated.lockProfile),
        mixedRejected,
        damagedRejected,
        unchanged: before === (await exportBoard((await readBoard())!)),
        oldBackupUnchanged: original === (await exportBoard(root)),
        noPlaintext:
          !raw.includes("nested secret") && !raw.includes("attachment secret"),
        noNewAuthorization,
      };
    },
    { password, nextPassword },
  );
  expect(result).toEqual({
    oldRejected: true,
    content: "attachment secret",
    backupContent: "attachment secret",
    sameProfile: true,
    mixedRejected: true,
    damagedRejected: true,
    unchanged: true,
    oldBackupUnchanged: true,
    noPlaintext: true,
    noNewAuthorization: true,
  });
});

test("a failed IndexedDB commit leaves the original password and open edits usable", async ({
  page,
}) => {
  await page.goto("/");
  await note(page, "保存失败仍保留的内容");
  await menu(page, "密码锁定");
  await submit(page, { 主密码: password, 确认主密码: password });
  await noDialog(page);
  await menu(page, "密码解锁");
  await submit(page, { 主密码: password });
  await expect(page.locator(".note-body")).toHaveText("保存失败仍保留的内容");
  const originalProfile = JSON.parse(await persisted(page)).lockProfile;
  await action(page, "修改主密码");
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "boards" && key === "main") {
        IDBObjectStore.prototype.put = put;
        throw new DOMException("模拟存储空间不足", "QuotaExceededError");
      }
      return put.call(this, value, key);
    };
  });
  await submit(page, {
    原密码: password,
    新密码: nextPassword,
    确认新密码: nextPassword,
  });
  await expect(page.getByRole("alert")).toContainText("模拟存储空间不足");
  expect(JSON.parse(await persisted(page)).lockProfile).toEqual(
    originalProfile,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".note-body")).toHaveText("保存失败仍保留的内容");
  await page.reload();
  await menu(page, "密码解锁");
  await submit(page, { 主密码: password });
  await expect(page.locator(".note-body")).toHaveText("保存失败仍保留的内容");
});

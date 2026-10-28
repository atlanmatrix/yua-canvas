import { test, expect, type Page, type Download } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { execFileSync } from "node:child_process";
import { validApplicationText, vscodeUrl } from "../src/appAssociations";
import { launcherInstaller } from "../src/localAppLauncher";

const commands =
  "cd \"/Users/alice/我的项目\"\nprintf '%s\\n' \"你好 & $HOME\"\ncat <<'EOF'\nline 1\nline 2\nEOF\n";
const saved = (page: Page) =>
  expect(page.locator(".save-indicator")).toHaveAttribute(
    "data-state",
    "已保存至本地",
  );
const launches = (page: Page) =>
  page.evaluate(() => (window as any).__nativeLaunches as string[]);
async function downloadBytes(download: Download) {
  const chunks: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!)
    chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function exportJson(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  return downloadBytes(await pending);
}
async function create(page: Page, name: string, x = 200, y = 180) {
  await page.locator(".canvas").click({ button: "right", position: { x, y } });
  await page
    .getByRole("menuitem", { name: "新建应用关联", exact: true })
    .hover();
  const submenu = page.getByRole("menu", {
    name: "新建应用关联组件",
    exact: true,
  });
  await expect(submenu.getByRole("menuitem")).toHaveText(["VS Code", "iTerm2"]);
  await submenu.getByRole("menuitem", { name, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__nativeLaunches = [];
    document.addEventListener(
      "click",
      (event) => {
        const link = (event.target as Element)?.closest?.("a");
        if (link && /^(vscode:|yua-canvas:)/.test(link.href)) {
          event.preventDefault();
          (window as any).__nativeLaunches.push(link.href);
        }
      },
      true,
    );
  });
  await page.goto("/");
  await saved(page);
});

test("VS Code links encode local paths and the Mac installer validates as a shell script", async () => {
  expect(vscodeUrl("/Users/name/项目 #1/a?b")).toBe(
    "vscode://file/Users/name/%E9%A1%B9%E7%9B%AE%20%231/a%3Fb?windowId=_blank",
  );
  expect(
    decodeURIComponent(new URL(vscodeUrl("C:\\Work\\My Project")).pathname),
  ).toBe("/C:/Work/My Project");
  for (const value of [
    "relative/path",
    "~/project",
    "vscode://command/workbench.action.terminal.new",
    "/tmp/a\nb",
    "/tmp/a\0b",
  ])
    expect(validApplicationText("vscode", value)).toBe(false);
  expect(validApplicationText("iterm2", commands)).toBe(true);
  expect(validApplicationText("iterm2", "\0echo invalid")).toBe(false);
  expect(validApplicationText("iterm2", "echo ok\u001b[A")).toBe(false);
  expect(validApplicationText("iterm2", "汉".repeat(8193))).toBe(false);
  const script = launcherInstaller("a".repeat(64));
  expect(() => execFileSync("bash", ["-n"], { input: script })).not.toThrow();
  expect(script).toContain("considering case");
  expect(script).toContain(`yua-canvas://iterm2/${"a".repeat(64)}/`);
  expect(script).toContain("write text commands");
  expect(script).toContain("create window with default profile");
  expect(script).toContain("codesign --force --deep --sign -");
  expect(script).not.toContain("do shell script commands");
  expect(() => launcherInstaller("not-a-pairing-key")).toThrow();
});

test("application submenu follows New; VS Code capsules launch once, drag without launching and retain edits", async ({
  page,
}) => {
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 200, y: 180 } });
  await expect(
    page
      .getByRole("group", { name: "新建内容", exact: true })
      .locator(":scope > .context-submenu-host > button > span:first-child"),
  ).toHaveText(["新建", "新建工具", "新建应用关联"]);
  await page.keyboard.press("Escape");
  await create(page, "VS Code");
  await page.getByRole("textbox", { name: "本地路径" }).fill("relative/path");
  await page.getByRole("button", { name: "保存关联" }).click();
  await expect(page.getByRole("alert")).toContainText("完整的本地路径");
  await expect(page.locator(".card-vscode")).toHaveCount(0);
  const path = "/Users/alice/项目 #1/demo folder";
  await page.getByRole("textbox", { name: "本地路径" }).fill(path);
  await page.getByRole("button", { name: "保存关联" }).click();
  const card = page.locator(".card-vscode");
  const pill = card.getByRole("button", {
    name: "使用 VS Code 打开 demo folder",
    exact: true,
  });
  await expect(pill.locator(".vscode-icon")).toBeVisible();
  await expect(pill).toHaveCSS("background-color", "rgb(18, 18, 18)");
  await expect(pill).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(card.locator(".card-top,footer,.card-download")).toHaveCount(0);
  expect(await launches(page)).toHaveLength(0);
  await pill.click();
  expect(await launches(page)).toEqual([vscodeUrl(path)]);
  await pill.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  expect(await launches(page)).toHaveLength(3);
  const before = (await card.boundingBox())!;
  await page.mouse.move(before.x + 80, before.y + 20);
  await page.mouse.down();
  await page.mouse.move(before.x + 160, before.y + 90, { steps: 6 });
  await page.mouse.up();
  const after = (await card.boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(80);
  expect(after.y - before.y).toBeCloseTo(70);
  expect(await launches(page)).toHaveLength(3);
  await pill.click({ modifiers: ["Shift"] });
  expect(await launches(page)).toHaveLength(3);
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "配置关联" }).click();
  await expect(page.getByRole("textbox", { name: "本地路径" })).toHaveValue(
    path,
  );
  await page
    .getByRole("textbox", { name: "本地路径" })
    .fill("/Users/alice/another-project");
  await page.getByRole("button", { name: "保存关联" }).click();
  await expect(card.locator(".vscode-pill")).toHaveText(
    "使用 VS Code 打开 another-project",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card.locator(".vscode-pill")).toHaveText(
    "使用 VS Code 打开 demo folder",
  );
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await saved(page);
  await page.reload();
  await expect(card.locator(".vscode-pill")).toHaveText(
    "使用 VS Code 打开 another-project",
  );
  expect(await launches(page)).toHaveLength(0);
});

test("iTerm2 preserves multiline commands, copies exactly and only launches a paired request after explicit execution", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await create(page, "iTerm2");
  await page.getByRole("textbox", { name: "iTerm2 命令" }).fill(commands);
  await page.getByRole("button", { name: "保存关联" }).click();
  const card = page.locator(".card-iterm2");
  await expect(card.locator("pre code")).toHaveText(commands);
  await expect(card.locator(".app-terminal-prompt")).toHaveCount(
    commands.split("\n").length,
  );
  await expect(card.locator(".card-top,footer,.card-download")).toHaveCount(0);
  await page.mouse.move(20, 400);
  await expect(card.locator(".app-terminal-actions")).toHaveCSS("opacity", "0");
  await card.hover();
  await expect(card.locator(".app-terminal-actions")).toHaveCSS("opacity", "1");
  await expect(card.locator(".app-terminal-actions button")).toHaveCount(2);
  await card.getByRole("button", { name: "复制命令" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    commands,
  );
  expect(await launches(page)).toHaveLength(0);
  await card.getByRole("button", { name: "执行命令" }).click();
  const setup = page.getByRole("dialog", { name: "设置 iTerm2 本地打开器" });
  await expect(setup).toBeVisible();
  expect(await launches(page)).toHaveLength(0);
  const pending = page.waitForEvent("download");
  await setup.getByRole("button", { name: "下载打开器" }).click();
  const zip = await downloadBytes(await pending);
  const entries = unzipSync(zip);
  const script = strFromU8(entries["安装 Canvas 打开器.command"]);
  const key = (await page.evaluate(() =>
    localStorage.getItem("yua-local-launcher-key"),
  ))!;
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(script).toContain(`yua-canvas://iterm2/${key}/`);
  const central = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  expect(zip.readUInt32LE(central + 38) >>> 16).toBe(0o100755);
  expect(() => execFileSync("bash", ["-n"], { input: script })).not.toThrow();
  await setup.getByRole("button", { name: "安装完成，执行命令" }).click();
  await expect(setup).toHaveCount(0);
  const urls = await launches(page);
  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain(`yua-canvas://iterm2/${key}/`);
  expect(
    Buffer.from(
      new URL(urls[0]).pathname.split("/").at(-1)!,
      "base64url",
    ).toString(),
  ).toBe(commands);
  const raw = (await exportJson(page)).toString();
  expect(raw).not.toContain(key);
  expect(JSON.parse(raw).cards[0].text).toBe(commands);
  await saved(page);
  await page.reload();
  await expect(card.locator("pre code")).toHaveText(commands);
  expect(await launches(page)).toHaveLength(0);
  await card.hover();
  await card.getByRole("button", { name: "执行命令" }).click();
  expect(await launches(page)).toHaveLength(1);
  await expect(setup).toHaveCount(0);
  await card.dblclick({ position: { x: 40, y: 90 } });
  await expect(page.getByRole("textbox", { name: "iTerm2 命令" })).toHaveValue(
    commands,
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await launches(page)).toHaveLength(1);
});

const snapshot = {
  version: 1,
  groups: [],
  cards: [
    {
      id: "code",
      kind: "vscode",
      title: "demo",
      text: "/Users/alice/demo",
      x: 100,
      y: 150,
      width: 340,
      height: 44,
      color: "#ffffff",
    },
    {
      id: "terminal",
      kind: "iterm2",
      title: "iTerm2",
      text: commands,
      x: 100,
      y: 280,
      width: 420,
      height: 260,
      color: "#ffffff",
    },
  ],
};
test("JSON and ZIP preserve application configurations without executing them or exporting local pairing", async ({
  page,
}) => {
  const load = async (buffer: Buffer) => {
    await page.getByTestId("import").setInputFiles({
      name: "applications.json",
      mimeType: "application/json",
      buffer,
    });
    await page.getByRole("button", { name: "确认替换" }).click();
    await page.getByRole("button", { name: "关闭提示" }).click();
  };
  await load(Buffer.from(JSON.stringify(snapshot)));
  await load(await exportJson(page));
  await expect(page.locator(".card-iterm2 pre")).toHaveText(commands);
  await page.locator(".canvas").click({ position: { x: 10, y: 200 } });
  await page.keyboard.press("ControlOrMeta+a");
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 10, y: 200 } });
  const pending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载", exact: true }).click();
  const zip = await downloadBytes(await pending);
  await page.getByTestId("files").setInputFiles({
    name: "applications.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(page.locator(".card-vscode")).toHaveCount(2);
  await expect(page.locator(".card-iterm2")).toHaveCount(2);
  const data = JSON.parse((await exportJson(page)).toString());
  expect(
    data.cards.filter((c: any) => c.kind === "iterm2").map((c: any) => c.text),
  ).toEqual([commands, commands]);
  expect(
    data.cards.filter((c: any) => c.kind === "vscode").map((c: any) => c.text),
  ).toEqual(["/Users/alice/demo", "/Users/alice/demo"]);
  expect(await launches(page)).toHaveLength(0);
  expect(
    await page.evaluate(() => localStorage.getItem("yua-local-launcher-key")),
  ).toBeNull();
  await saved(page);
  await page.reload();
  await expect(page.locator(".card-iterm2")).toHaveCount(2);
  expect(await launches(page)).toHaveLength(0);
});

test("read-only shares display application configurations without launch actions", async ({
  page,
}) => {
  await page.route("**/api/shares/resolve", (route) =>
    route.fulfill({ json: { snapshot } }),
  );
  await page.goto("/#/s/" + "a".repeat(64));
  await expect(page.locator(".share-card .vscode-pill")).toHaveText(
    "使用 VS Code 打开 demo",
  );
  const capsule = (await page
    .locator(".share-card .vscode-pill")
    .boundingBox())!;
  const parent = (await page
    .locator(".share-card")
    .filter({ has: page.locator(".vscode-pill") })
    .boundingBox())!;
  expect(capsule.y + capsule.height).toBeLessThanOrEqual(
    parent.y + parent.height + 0.5,
  );
  await expect(page.locator(".share-card .app-terminal pre")).toHaveText(
    commands,
  );
  await expect(
    page.locator(".app-terminal-actions,button.vscode-pill,a[href^='vscode:']"),
  ).toHaveCount(0);
  expect(await launches(page)).toHaveLength(0);
});

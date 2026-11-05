import { openSettings } from "./settings-helper.mjs";
import { test, expect } from "@playwright/test";
const snapshot = {
  version: 1,
  cards: [
    {
      id: "one",
      kind: "text",
      title: "",
      text: "来自分享的内容",
      x: 0,
      y: 0,
      color: "#ffffff",
    },
  ],
  groups: [],
};
test("share opens read-only, does not replace the local workspace", async ({
  page,
}) => {
  await page.route("**/api/shares/resolve", (r) =>
    r.fulfill({ json: { snapshot } }),
  );
  await page.goto("/#/s/" + "a".repeat(64));
  await expect(page.getByText("来自分享的内容")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("link", { name: "返回我的画布" }).click();
  await expect(page.getByText("来自分享的内容")).toHaveCount(0);
});
test("unavailable cloud leaves local editing usable", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享" }).click();
  await page.getByRole("button", { name: "管理服务器：当前站点" }).click();
  await expect(
    page.getByRole("dialog", { name: "云同步与分享" }),
  ).toContainText("当前站点未启用云服务");
  await page.getByRole("button", { name: "关闭云同步" }).click();
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
});
test("invalid share shows a useful error without mounting editor", async ({
  page,
}) => {
  await page.route("**/api/shares/resolve", (r) =>
    r.fulfill({ status: 404, json: { message: "分享不存在或已失效" } }),
  );
  await page.goto("/#/s/missing");
  await expect(page.getByRole("alert")).toHaveText("分享不存在或已失效");
});
test("connecting with different local and cloud content pauses, preserves recovery on adoption", async ({
  page,
}) => {
  let writes = 0;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: { owner_id: "owner", name: "tester" } } }),
  );
  await page.route("**/api/shares", (r) => r.fulfill({ json: { shares: [] } }));
  await page.route("**/api/canvas", (r) => {
    if (r.request().method() === "PUT") writes++;
    return r.fulfill({ json: { revision: 2, snapshot } });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    // @ts-expect-error Vite serves source modules to the browser test.
    const { saveBoard } = await import("/src/storage.ts");
    await saveBoard({
      version: 1,
      cards: [
        {
          id: "local",
          kind: "text",
          title: "",
          text: "本机未上传内容",
          x: 0,
          y: 0,
          color: "#ffffff",
        },
      ],
      groups: [],
    });
  });
  await page.reload();
  await expect(page.getByText("本机未上传内容")).toBeVisible();
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享" }).click();
  await page.getByRole("button", { name: "管理服务器：当前站点" }).click();
  await page.getByRole("checkbox", { name: "自动同步", exact: true }).check();
  await expect(page.getByRole("status")).toContainText("本地和云端均有内容");
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "备份本地并采用云端" }).click();
  await expect(page.getByRole("status")).toContainText(
    "已从云端拉取，本地原内容已备份",
  );
  await page.getByRole("button", { name: "关闭云同步" }).click();
  await expect(page.getByText("来自分享的内容")).toBeVisible();
  const saved = await page.evaluate(async () => {
    // @ts-expect-error Vite serves source modules to the browser test.
    const { readRecovery } = await import("/src/storage.ts");
    return (await readRecovery()).cards[0].text;
  });
  expect(saved).toBe("本机未上传内容");
});

test("server submenu supports adding, independent multi-selection and selecting none across reloads", async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route("https://one.example/**", (r) => {
    calls.push(r.request().url());
    return r.fulfill({ json: { user: null } });
  });
  await page.route("https://two.example/**", (r) => {
    calls.push(r.request().url());
    return r.fulfill({ json: { user: null } });
  });
  await page.goto("/");
  async function menu() {
    await openSettings(page);
    await page.getByRole("button", { name: "云同步与分享" }).click();
  }
  async function add(name: string, origin: string) {
    await menu();
    await page.getByRole("menuitem", { name: "新增服务器" }).click();
    const dialog = page.getByRole("dialog", { name: "新增服务器" });
    await dialog.getByLabel("服务器名称").fill(name);
    await dialog.getByLabel("服务器地址").fill(origin);
    await dialog
      .getByRole("button", { name: "添加服务器", exact: true })
      .click();
    await page.getByRole("button", { name: "关闭云同步" }).click();
  }
  await add("服务器一", "https://one.example");
  await add("服务器二", "https://two.example");
  await menu();
  const one = page.getByRole("menuitemcheckbox", {
    name: "服务器一",
    exact: true,
  });
  const two = page.getByRole("menuitemcheckbox", {
    name: "服务器二",
    exact: true,
  });
  await expect(one).toHaveAttribute("aria-checked", "false");
  await one.click();
  await two.click();
  await expect(one).toHaveAttribute("aria-checked", "true");
  await expect(two).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await menu();
  await expect(one).toHaveAttribute("aria-checked", "true");
  await expect(two).toHaveAttribute("aria-checked", "true");
  await one.click();
  await two.click();
  await page.reload();
  await menu();
  await expect(one).toHaveAttribute("aria-checked", "false");
  await expect(two).toHaveAttribute("aria-checked", "false");
  const count = calls.length;
  await page.waitForTimeout(1700);
  expect(calls.length).toBe(count);
});

test("two selected servers sync independently and deselection stops background requests", async ({
  page,
}) => {
  const writes = new Map<string, any[]>(),
    reads = new Map<string, number>();
  await page.addInitScript(() => {
    localStorage.setItem(
      "yua-cloud-servers",
      JSON.stringify([
        {
          id: "one",
          name: "One",
          origin: "https://one.example",
          selected: true,
        },
        {
          id: "two",
          name: "Two",
          origin: "https://two.example",
          selected: true,
        },
      ]),
    );
    localStorage.setItem("yua-cloud-token:https://one.example", "one-token");
    localStorage.setItem("yua-cloud-token:https://two.example", "two-token");
  });
  for (const host of ["one", "two"])
    await page.route(`https://${host}.example/**`, (r) => {
      expect(r.request().headers().authorization).toBe(
        "Bearer " + host + "-token",
      );
      if (r.request().url().endsWith("/session"))
        return r.fulfill({ json: { user: { owner_id: host, name: host } } });
      if (r.request().method() === "PUT") {
        writes.set(host, [
          ...(writes.get(host) || []),
          r.request().postDataJSON(),
        ]);
        return r.fulfill({ json: { revision: 1 } });
      }
      reads.set(host, (reads.get(host) || 0) + 1);
      return r.fulfill({ json: { revision: 0, snapshot: null } });
    });
  await page.goto("/");
  await expect.poll(() => writes.get("one")?.length).toBe(1);
  await expect.poll(() => writes.get("two")?.length).toBe(1);
  expect(writes.get("one")![0].baseRevision).toBe(0);
  expect(writes.get("two")![0].baseRevision).toBe(0);
  const baselines = await page.evaluate(() =>
    ["one", "two"].map((id) =>
      JSON.parse(localStorage.getItem("yua-cloud-baseline:" + id)!),
    ),
  );
  expect(baselines.map((b) => b.owner)).toEqual(["one", "two"]);
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享" }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "One", exact: true })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "Two", exact: true })
    .click();
  const count = [...reads.values()].reduce((a, b) => a + b, 0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(1700);
  expect([...reads.values()].reduce((a, b) => a + b, 0)).toBe(count);
});

test("remote share resolves its snapshot and hash-checked attachment from the link's server", async ({
  page,
}) => {
  const bytes = new TextEncoder().encode("remote attachment bytes");
  const id = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  const token = "c".repeat(64),
    requests: string[] = [];
  await page.route("https://share.example/api/**", async (r) => {
    requests.push(r.request().url());
    if (r.request().url().endsWith("/shares/resolve")) {
      expect(r.request().postDataJSON().token).toBe(token);
      return r.fulfill({
        json: {
          snapshot: {
            version: 1,
            cards: [
              {
                id: "remote-file",
                kind: "file",
                title: "remote.bin",
                text: "",
                x: 0,
                y: 0,
                color: "#ffffff",
                archiveFile: id,
                mime: "application/octet-stream",
              },
            ],
            groups: [],
          },
        },
      });
    }
    expect(r.request().headers()["x-share-token"]).toBe(token);
    return r.fulfill({
      body: Buffer.from(bytes),
      contentType: "application/octet-stream",
    });
  });
  await page.goto(
    "/#/s/" + token + "?server=" + encodeURIComponent("https://share.example"),
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 remote.bin" }).click();
  const download = await downloading,
    chunks: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!)
    chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe("remote attachment bytes");
  expect(requests).toEqual([
    "https://share.example/api/shares/resolve",
    "https://share.example/api/assets/" + id,
  ]);
});

test("offline sign-in stays visible, refresh recovers, and OAuth waits for manual sync opt-in", async ({
  page,
}) => {
  let online = false,
    signedIn = false,
    canvasRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem(
      "yua-cloud-servers",
      JSON.stringify([
        {
          id: "remote",
          name: "Remote",
          origin: "https://login.example",
          selected: false,
        },
      ]),
    );
  });
  await page.context().route("https://login.example/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/login") {
      signedIn = true;
      return route.fulfill({
        contentType: "text/html",
        body: `<script>window.opener.postMessage({type:"yua-login",token:"${"a".repeat(64)}"}, "http://127.0.0.1:5173");window.close();</script>`,
      });
    }
    if (!online) return route.abort("internetdisconnected");
    if (path === "/api/session")
      return route.fulfill({
        json: {
          user: signedIn ? { owner_id: "owner", name: "tester" } : null,
        },
      });
    if (path === "/api/shares") return route.fulfill({ json: { shares: [] } });
    canvasRequests++;
    return route.fulfill({ json: { revision: 1, snapshot: null } });
  });
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享" }).click();
  await page.getByRole("button", { name: "管理服务器：Remote" }).click();
  const login = page.getByRole("button", { name: "使用 GitHub 登录" });
  const refresh = page.getByRole("button", { name: "刷新连接状态" });
  await expect(login).toBeVisible();
  await expect(login).toBeDisabled();
  await expect(refresh).toBeEnabled();
  online = true;
  await refresh.click();
  await expect(login).toBeEnabled();
  await page.context().setOffline(true);
  await expect(login).toBeDisabled();
  await page.context().setOffline(false);
  await expect(login).toBeEnabled();
  await login.click();
  const sync = page.getByRole("checkbox", { name: "自动同步", exact: true });
  await expect(sync).not.toBeChecked();
  await expect(page.getByRole("status")).toContainText("已登录，请手动勾选");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  await page.waitForTimeout(1700);
  expect(canvasRequests).toBe(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("yua-cloud-servers")!)[0].selected,
    ),
  ).toBe(false);
  await sync.check();
  await expect.poll(() => canvasRequests).toBeGreaterThan(0);
  await expect(page.getByRole("status")).toContainText("已与云端同步");
});

test("legacy sync baseline does not implicitly opt in the default server", async ({
  page,
}) => {
  let requests = 0;
  await page.addInitScript(() =>
    localStorage.setItem(
      "yua-cloud-baseline",
      JSON.stringify({
        owner: "owner",
        revision: 1,
        fingerprint: "legacy",
      }),
    ),
  );
  await page.route("**/api/**", (route) => {
    requests++;
    return route.fulfill({
      json: { user: { owner_id: "owner", name: "tester" } },
    });
  });
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享" }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "当前站点", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  expect(requests).toBe(0);
});

async function openManualCloud(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    // @ts-expect-error Vite serves source modules to browser tests.
    const { saveBoard } = await import("/src/storage.ts");
    await saveBoard({
      version: 1,
      cards: [
        {
          id: "local",
          kind: "text",
          title: "",
          text: "手动同步前的本地内容",
          x: 0,
          y: 0,
          color: "#ffffff",
        },
      ],
      groups: [],
    });
  });
  await page.reload();
  await expect(page.getByText("手动同步前的本地内容")).toBeVisible();
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享" }).click();
  await page.getByRole("button", { name: "管理服务器：当前站点" }).click();
  await expect(
    page.getByRole("checkbox", { name: "自动同步", exact: true }),
  ).not.toBeChecked();
}

test("manual pull works with automatic sync off, preserves a recovery copy, and never uploads", async ({
  page,
}) => {
  let canvasReads = 0,
    writes = 0;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: { owner_id: "owner", name: "tester" } } }),
  );
  await page.route("**/api/shares", (r) => r.fulfill({ json: { shares: [] } }));
  await page.route("**/api/canvas", (r) => {
    canvasReads++;
    if (r.request().method() === "PUT") writes++;
    return r.fulfill({ json: { revision: 7, snapshot } });
  });
  await openManualCloud(page);
  expect(canvasReads).toBe(0);
  await page.getByRole("button", { name: "手动拉取", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "已从云端拉取，本地原内容已备份",
  );
  await expect(
    page.getByRole("checkbox", { name: "自动同步", exact: true }),
  ).not.toBeChecked();
  const saved = await page.evaluate(async () => {
    // @ts-expect-error Vite serves source modules to browser tests.
    const { readRecovery } = await import("/src/storage.ts");
    return (await readRecovery()).cards[0].text;
  });
  expect(saved).toBe("手动同步前的本地内容");
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "关闭云同步" }).click();
  await expect(page.getByText("来自分享的内容")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(1700);
  expect(canvasReads).toBe(1);
  await page.reload();
  await expect(page.getByText("来自分享的内容")).toBeVisible();
});

test("manual upload confirms replacement, handles concurrent cloud edits, and never starts automatic sync", async ({
  page,
}) => {
  const writes: any[] = [];
  let revision = 7,
    canvasReads = 0;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: { owner_id: "owner", name: "tester" } } }),
  );
  await page.route("**/api/shares", (r) => r.fulfill({ json: { shares: [] } }));
  await page.route("**/api/canvas", (r) => {
    if (r.request().method() === "PUT") {
      writes.push(r.request().postDataJSON());
      if (revision === 7)
        return r.fulfill({ status: 409, json: { message: "云端版本已更新" } });
      return r.fulfill({ json: { revision: revision + 1 } });
    }
    canvasReads++;
    return r.fulfill({ json: { revision, snapshot } });
  });
  await openManualCloud(page);
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "手动上传", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "手动上传", exact: true }),
  ).toBeEnabled();
  expect(writes).toHaveLength(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "手动上传", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("云端版本已更新");
  expect(writes[0].baseRevision).toBe(7);
  expect(
    await page.evaluate(() => localStorage.getItem("yua-cloud-baseline")),
  ).toBeNull();
  revision = 8;
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "手动上传", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已上传至云端");
  expect(writes).toHaveLength(2);
  expect(writes[1].baseRevision).toBe(8);
  expect(writes[1].snapshot.cards[0].text).toBe("手动同步前的本地内容");
  await expect(
    page.getByRole("checkbox", { name: "自动同步", exact: true }),
  ).not.toBeChecked();
  const reads = canvasReads;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(1700);
  expect(canvasReads).toBe(reads);
  expect(writes).toHaveLength(2);
  await page.getByRole("button", { name: "关闭云同步" }).click();
  await expect(page.getByText("手动同步前的本地内容")).toBeVisible();
});

test("manual pull leaves local content untouched when the cloud is empty or fails", async ({
  page,
}) => {
  let fails = false;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: { owner_id: "owner", name: "tester" } } }),
  );
  await page.route("**/api/shares", (r) => r.fulfill({ json: { shares: [] } }));
  await page.route("**/api/canvas", (r) =>
    fails
      ? r.fulfill({ status: 503, json: { message: "云端暂不可用" } })
      : r.fulfill({ json: { revision: 0, snapshot: null } }),
  );
  await openManualCloud(page);
  await page.getByRole("button", { name: "手动拉取", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "云端暂无画布，本地内容未改变",
  );
  fails = true;
  await page.getByRole("button", { name: "手动拉取", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("云端暂不可用");
  await page.getByRole("button", { name: "关闭云同步" }).click();
  await expect(page.getByText("手动同步前的本地内容")).toBeVisible();
});

test("manual pull rejects a stale response after local editing during the request", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: { owner_id: "owner", name: "tester" } } }),
  );
  await page.route("**/api/shares", (r) => r.fulfill({ json: { shares: [] } }));
  await page.route("**/api/canvas", async (r) => {
    requested = true;
    await pending;
    await r.fulfill({ json: { revision: 7, snapshot } });
  });
  await openManualCloud(page);
  await page.getByRole("button", { name: "手动拉取", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "关闭云同步" }).click();
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await page
    .getByRole("textbox", { name: "任务内容 1", exact: true })
    .fill("拉取期间新增的本地任务");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("card")).toHaveCount(2);
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享" }).click();
  await page.getByRole("button", { name: "管理服务器：当前站点" }).click();
  release();
  await expect(page.getByRole("status")).toContainText(
    "读取期间发生编辑，请重试",
  );
  await page.getByRole("button", { name: "关闭云同步" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect(page.getByText("手动同步前的本地内容")).toBeVisible();
  await expect(page.getByText("来自分享的内容")).toHaveCount(0);
});

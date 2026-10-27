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
  await page.getByRole("button", { name: "云同步与分享" }).click();
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
  await page.getByRole("button", { name: "云同步与分享" }).click();
  await page.getByRole("button", { name: "连接并同步" }).click();
  await expect(page.getByRole("status")).toContainText("本地和云端均有内容");
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "备份本地并采用云端" }).click();
  await expect(page.getByRole("status")).toContainText("已与云端同步");
  await page.getByRole("button", { name: "关闭云同步" }).click();
  await expect(page.getByText("来自分享的内容")).toBeVisible();
  const saved = await page.evaluate(async () => {
    // @ts-expect-error Vite serves source modules to the browser test.
    const { readRecovery } = await import("/src/storage.ts");
    return (await readRecovery()).cards[0].text;
  });
  expect(saved).toBe("本机未上传内容");
});

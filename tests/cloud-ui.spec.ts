import { test, expect, type Page } from "@playwright/test";
import { openSettings } from "./settings-helper.mjs";
const origin = "https://yua-worker.atlanmatrix.workers.dev";
async function menu(page: Page) {
  await openSettings(page);
  await page.getByRole("button", { name: "云同步与分享", exact: true }).click();
  return page.getByRole("menu", { name: "同步服务器", exact: true });
}
async function openDefault(page: Page) {
  await page.goto("/");
  await (
    await menu(page)
  )
    .getByRole("menuitem", { name: "Yua Cloud", exact: true })
    .click();
}
test("default server is added once, stays opt-in, and the add action follows the divider", async ({
  page,
}) => {
  await page.route(origin + "/api/session", (r) =>
    r.fulfill({ json: { user: null } }),
  );
  await page.addInitScript(
    () =>
      !localStorage.getItem("yua-cloud-servers") &&
      localStorage.setItem(
        "yua-cloud-servers",
        JSON.stringify([
          {
            id: "saved",
            name: "Saved",
            origin: "https://saved.example",
            selected: false,
          },
        ]),
      ),
  );
  await page.goto("/");
  const list = await menu(page);
  await expect(
    list.getByRole("menuitem", { name: "Yua Cloud", exact: true }),
  ).toHaveCount(1);
  await expect(
    list.getByRole("switch", { name: "自动同步：Yua Cloud", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    list.getByRole("menuitem", { name: "Saved", exact: true }),
  ).toBeVisible();
  expect(
    await list.evaluate((el) =>
      Array.from(el.children).map((child) => child.getAttribute("role")),
    ),
  ).toEqual([null, null, "separator", "menuitem"]);
  await expect(
    list.getByRole("button", { name: "管理", exact: true }),
  ).toHaveCount(0);
  await list
    .getByRole("switch", { name: "自动同步：Yua Cloud", exact: true })
    .click();
  // Save the combined list without leaving automatic sync enabled.
  await list
    .getByRole("switch", { name: "自动同步：Yua Cloud", exact: true })
    .click();
  await page.reload();
  await expect(
    (await menu(page)).getByRole("menuitem", {
      name: "Yua Cloud",
      exact: true,
    }),
  ).toHaveCount(1);
});

test("server confirmation hides fields, retries three times, and refresh recovers", async ({
  page,
}) => {
  let attempts = 0,
    healthy = false;
  const releases: (() => void)[] = [];
  await page.route("https://new.example/api/session", async (r) => {
    attempts++;
    if (!healthy) {
      await new Promise<void>((resolve) => releases.push(resolve));
      return r.fulfill({ status: 503, json: { message: "暂不可用" } });
    }
    return r.fulfill({ json: { user: null } });
  });
  await page.goto("/");
  await (
    await menu(page)
  )
    .getByRole("menuitem", { name: "新增服务器" })
    .click();
  const form = page.getByRole("dialog", { name: "新增服务器", exact: true });
  await expect(form.getByRole("button", { name: "Github" })).toHaveCount(0);
  const fields = form.locator("input");
  await expect(fields.first()).toHaveAttribute("type", "url");
  await form.getByLabel("服务器地址").fill("https://new.example");
  await form.getByLabel("服务器名称").fill("New server");
  await form.getByRole("button", { name: "确认", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "云同步与分享", exact: true });
  await expect(panel.getByRole("heading")).toHaveText("New server");
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  await expect(
    panel.getByRole("img", { name: "正在连接", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Github", exact: true }),
  ).toBeDisabled();
  for (let n = 1; n <= 3; n++) {
    await expect.poll(() => attempts).toBe(n);
    await expect(
      panel.getByRole("img", { name: "正在连接", exact: true }),
    ).toBeVisible();
    releases.shift()!();
  }
  await expect(
    panel.getByRole("img", { name: "三次连接失败", exact: true }),
  ).toBeVisible();
  healthy = true;
  await panel.getByRole("button", { name: "刷新连接状态" }).click();
  await expect(
    panel.getByRole("img", { name: "连接成功", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Github", exact: true }),
  ).toBeEnabled();
  expect(attempts).toBe(4);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("yua-cloud-servers")!).find(
          (s: any) => s.origin === "https://new.example",
        ).selected,
    ),
  ).toBe(false);
});

test("account logout requires confirmation and the app select works with keyboard", async ({
  page,
}) => {
  let signedIn = true,
    logouts = 0;
  await page.route(origin + "/api/**", (r) => {
    if (r.request().url().endsWith("/auth/logout")) {
      logouts++;
      signedIn = false;
      return r.fulfill({ json: { ok: true } });
    }
    if (r.request().url().endsWith("/shares"))
      return r.fulfill({ json: { shares: [] } });
    return r.fulfill({
      json: {
        user: signedIn ? { owner_id: "owner", name: "Cloud user" } : null,
      },
    });
  });
  await openDefault(page);
  const panel = page.getByRole("dialog", { name: "云同步与分享", exact: true });
  await expect(panel.locator(".cloud-account")).toHaveText("Cloud user");
  await expect(panel.locator("select")).toHaveCount(0);
  const select = panel.getByRole("combobox", { name: "分享有效期" });
  await select.focus();
  await select.press("ArrowDown");
  await select.press("End");
  await select.press("Enter");
  await expect(select).toHaveText("永久");
  await select.click();
  await panel.getByRole("option", { name: "1 天", exact: true }).click();
  await expect(select).toHaveText("1 天");
  await panel.getByRole("button", { name: "退出登录" }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "确认退出登录？",
  });
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  expect(logouts).toBe(0);
  await expect(panel.locator(".cloud-account")).toHaveText("Cloud user");
  await expect(panel.getByRole("button", { name: "退出登录" })).toBeFocused();
  await panel.getByRole("button", { name: "退出登录" }).click();
  await confirmation.press("Escape");
  await expect(confirmation).not.toBeVisible();
  expect(logouts).toBe(0);
  await panel.getByRole("button", { name: "退出登录" }).click();
  await confirmation
    .getByRole("button", { name: "退出登录", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Github", exact: true }),
  ).toBeVisible();
  expect(logouts).toBe(1);
  await expect(panel.getByText("自动同步未开启", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    panel.getByRole("button", { name: "下载上次同步前的本地副本" }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`cloud controls are opaque and legible in ${theme} mode`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) => localStorage.setItem("yua-appearance", theme),
      theme,
    );
    await page.route(origin + "/api/session", (r) =>
      r.fulfill({ json: { user: null } }),
    );
    await openDefault(page);
    await page
      .locator("html")
      .evaluate((el, theme) => el.setAttribute("data-theme", theme), theme);
    const panel = page.getByRole("dialog", {
      name: "云同步与分享",
      exact: true,
    });
    const login = panel.getByRole("button", { name: "Github", exact: true });
    await expect(login).toBeEnabled();
    const colors = await login.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      text: getComputedStyle(el).color,
      radius: getComputedStyle(el).borderRadius,
    }));
    expect(colors.bg).toBe("rgb(17, 17, 17)");
    expect(colors.text).toBe("rgb(255, 255, 255)");
    expect(colors.radius).toBe("999px");
    await page.screenshot({ path: `/tmp/yua-cloud-login-${theme}.png` });
    await panel.getByRole("button", { name: "关闭云同步" }).click();
    await (
      await menu(page)
    )
      .getByRole("menuitem", { name: "新增服务器" })
      .click();
    const form = page.getByRole("dialog", { name: "新增服务器", exact: true });
    const palette = await form.evaluate((el) => {
      const panel = getComputedStyle(el),
        input = getComputedStyle(el.querySelector("input")!);
      const lum = (color: string) => {
        const rgb = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const ratio = (a: string, b: string) =>
        (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      return {
        bg: panel.backgroundColor,
        text: ratio(input.color, input.backgroundColor),
        border: ratio(input.borderTopColor, panel.backgroundColor),
      };
    });
    expect(palette.bg).toBe(
      theme === "light" ? "rgb(243, 244, 246)" : "rgb(32, 33, 36)",
    );
    expect(palette.text).toBeGreaterThanOrEqual(4.5);
    expect(palette.border).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: `/tmp/yua-cloud-form-${theme}.png` });
  });
}

test.describe("mobile cloud UI", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test("touch switches and the custom list remain usable in the viewport", async ({
    page,
  }) => {
    await page.route(origin + "/api/**", (r) =>
      r.fulfill({
        json: r.request().url().endsWith("/session")
          ? { user: { owner_id: "owner", name: "Mobile user" } }
          : { shares: [] },
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "设置", exact: true }).tap();
    await page.getByRole("button", { name: "云同步与分享", exact: true }).tap();
    const list = page.getByRole("menu", { name: "同步服务器" });
    await page.waitForTimeout(400);
    await expect(list).toBeVisible();
    await list.getByRole("menuitem", { name: "Yua Cloud", exact: true }).tap();
    const panel = page.getByRole("dialog", {
      name: "云同步与分享",
      exact: true,
    });
    await panel.getByRole("combobox", { name: "分享有效期" }).tap();
    await panel.getByRole("option", { name: "30 天", exact: true }).tap();
    await expect(panel.getByRole("combobox")).toHaveText("30 天");
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: "/tmp/yua-cloud-mobile.png" });
  });
});

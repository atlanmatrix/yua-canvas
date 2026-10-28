import { test, expect, type Page } from "@playwright/test";
const saved = (page: Page) =>
  expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
test("malformed currency and weather caches or responses show errors without crashing the canvas", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://api.frankfurter.dev/**", (route) =>
    route.fulfill({ json: { base: "USD", rates: "invalid" } }),
  );
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      json: {
        current: { temperature_2m: 22 },
        daily: { time: ["2026-10-28"] },
      },
    }),
  );
  await start(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "yua-tool:rates:USD",
      JSON.stringify({
        saved: Date.now(),
        data: { base: "USD", date: "2026-10-28", rates: "invalid" },
      }),
    );
    localStorage.setItem(
      "yua-tool:weather:39.904:116.407",
      JSON.stringify({
        saved: Date.now(),
        data: {
          current: { temperature_2m: 22 },
          daily: { time: ["2026-10-28"] },
        },
      }),
    );
  });
  const currency = await tool(page, "汇率计算");
  await expect(currency).toContainText("暂时无法获取汇率");
  await expect(currency.getByLabel("转换结果")).toContainText("—");
  const weather = await tool(page, "天气");
  await expect(weather).toContainText("暂时无法获取天气");
  await expect(
    page.getByRole("button", { name: "导出画布", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
async function start(page: Page) {
  await page.goto("/");
  await saved(page);
}
async function tool(page: Page, name: string) {
  const count = await page.getByTestId("card").count();
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 100 + count * 360, y: 100 } });
  await page.getByRole("menuitem", { name: "新建工具", exact: true }).hover();
  await page
    .getByRole("menu", { name: "新建工具组件", exact: true })
    .getByRole("menuitem", { name, exact: true })
    .click();
  return page.getByTestId("card").last();
}
async function paste(page: Page, source: string) {
  await page.evaluate((source) => {
    const data = new DataTransfer();
    data.setData("text/plain", source);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data }));
  }, source);
}
async function exported(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
test("tool submenu contains TODO and all six tools, separated from New, and retains the clicked anchor", async ({
  page,
}) => {
  await start(page);
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 100, y: 100 } });
  await page.getByRole("menuitem", { name: "新建", exact: true }).hover();
  await expect(
    page
      .getByRole("menu", { name: "新建组件", exact: true })
      .getByRole("menuitem", { name: "任务", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "新建工具", exact: true }).hover();
  await expect(
    page
      .getByRole("menu", { name: "新建工具组件", exact: true })
      .getByRole("menuitem"),
  ).toHaveText([
    "任务",
    "计算器",
    "汇率计算",
    "摄氏度 / 华氏度",
    "距离单位转换",
    "天气",
    "日历",
  ]);
  await page.getByRole("menuitem", { name: "任务", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "任务内容 1" })).toBeFocused();
  await page.getByRole("textbox", { name: "任务内容 1" }).fill("Tool TODO");
  await page.keyboard.press("ControlOrMeta+Enter");
  const card = await tool(page, "计算器");
  const snapshot = await exported(page);
  expect(snapshot.cards.map((c: any) => c.kind)).toEqual([
    "todo",
    "calculator",
  ]);
  expect(snapshot.cards[1]).toMatchObject({
    displayMode: "medium",
    x: snapshot.cards[0].x + 360,
    y: snapshot.cards[0].y,
  });
  await expect(card.locator(".tool-component")).toBeVisible();
});
test("calculator evaluates arithmetic safely and keeps its expression/history after reload and JSON/ZIP transfers", async ({
  page,
}) => {
  await start(page);
  const card = await tool(page, "计算器"),
    input = card.getByRole("textbox", { name: "计算表达式" });
  await input.fill("(12.5 + 7.5) × 2 - 5%");
  await input.press("Enter");
  await expect(input).toHaveValue("39.95");
  await expect(card.locator(".calculator-history")).toContainText("39.95");
  await input.fill("globalThis.__executed = true");
  await input.press("Enter");
  await expect(card.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__executed)).toBeUndefined();
  await input.fill("2^3^2");
  await input.press("Enter");
  await expect(input).toHaveValue("512");
  await input.blur();
  await saved(page);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "计算表达式" })).toHaveValue(
    "512",
  );
  const snapshot = await exported(page);
  await page.evaluate(async (snapshot) => {
    const storage = await import("/src/storage.ts" as string),
      archive = await import("/src/archive.ts" as string);
    const board = await storage.importBoard(JSON.stringify(snapshot));
    const blob = await archive.createArchive({
      cards: board.cards,
      groups: [],
    });
    const result = await archive.readArchive(new File([blob], "tools.zip"), {
      x: 0,
      y: 0,
    });
    if (
      result.cards[0].text !== board.cards[0].text ||
      result.cards[0].kind !== "calculator"
    )
      throw Error("Tool state lost in ZIP");
  }, snapshot);
});
test("temperature and distance converters support negatives, swapping and independent saved state", async ({
  page,
}) => {
  await start(page);
  const temperature = await tool(page, "摄氏度 / 华氏度");
  await temperature.getByRole("spinbutton", { name: "数值" }).fill("0");
  await expect(temperature.getByLabel("转换结果")).toContainText("32");
  await temperature.getByRole("spinbutton", { name: "数值" }).fill("-40");
  await expect(temperature.getByLabel("转换结果")).toContainText("-40");
  await temperature.getByRole("button", { name: "交换单位" }).click();
  await expect(
    temperature.getByRole("combobox", { name: "原始单位" }),
  ).toHaveValue("F");
  const distance = await tool(page, "距离单位转换");
  await distance.getByRole("spinbutton", { name: "数值" }).fill("1609.344");
  await distance.getByRole("combobox", { name: "目标单位" }).selectOption("mi");
  await expect(distance.getByLabel("转换结果")).toContainText("1 mi");
  await distance.getByRole("combobox", { name: "原始单位" }).selectOption("in");
  await distance.getByRole("combobox", { name: "目标单位" }).selectOption("cm");
  await distance.getByRole("spinbutton", { name: "数值" }).fill("1");
  await expect(distance.getByLabel("转换结果")).toContainText("2.54");
  const snapshot = await exported(page);
  expect(JSON.parse(snapshot.cards[0].text).from).toBe("F");
  expect(JSON.parse(snapshot.cards[1].text)).toMatchObject({
    amount: "1",
    from: "in",
    to: "cm",
  });
});
test("currency uses dated live rates, reuses offline cache and reports failures without inventing rates", async ({
  page,
}) => {
  await page.route("https://api.frankfurter.dev/**", (route) =>
    route.fulfill({
      json: { base: "USD", date: "2026-10-28", rates: { CNY: 7.25, EUR: 0.9 } },
    }),
  );
  await start(page);
  const card = await tool(page, "汇率计算");
  await card.getByRole("spinbutton", { name: "数值" }).fill("10");
  await expect(card.getByLabel("转换结果")).toContainText("72.5");
  await expect(card).toContainText("2026-10-28");
  await saved(page);
  await page.unroute("https://api.frankfurter.dev/**");
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.reload();
  await expect(page.getByLabel("转换结果")).toContainText("72.5");
  await page.getByRole("button", { name: "刷新汇率" }).click();
  await expect(page.locator(".tool-data-status")).toContainText("离线缓存");
  await page.getByRole("combobox", { name: "原始单位" }).selectOption("EUR");
  await expect(page.getByLabel("转换结果")).toContainText("—");
  await expect(page.locator(".tool-data-status")).toContainText(
    "暂时无法获取汇率",
  );
});
test("weather searches and saves a chosen city, renders forecast and reuses it offline", async ({
  page,
}) => {
  await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            id: 1,
            name: "Tokyo",
            country: "Japan",
            latitude: 35.68,
            longitude: 139.69,
          },
        ],
      },
    }),
  );
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      json: {
        current: {
          temperature_2m: 22,
          relative_humidity_2m: 55,
          apparent_temperature: 21,
          weather_code: 1,
          wind_speed_10m: 10,
          time: "2026-10-28T12:00",
        },
        daily: {
          time: ["2026-10-28", "2026-10-29", "2026-10-30"],
          temperature_2m_max: [25, 24, 23],
          temperature_2m_min: [16, 17, 15],
        },
        timezone: "Asia/Tokyo",
      },
    }),
  );
  await start(page);
  const card = await tool(page, "天气");
  await expect(card.locator(".weather-current")).toContainText("22°");
  await card.getByRole("textbox", { name: "搜索城市" }).fill("Tokyo");
  await card.getByRole("button", { name: "查找城市" }).click();
  await card.getByRole("button", { name: "Tokyo · Japan" }).click();
  await expect(card.locator(".weather-location")).toContainText("Tokyo, Japan");
  await expect(card.locator(".weather-forecast > div")).toHaveCount(3);
  await saved(page);
  await page.reload();
  await expect(page.locator(".weather-location")).toContainText("Tokyo, Japan");
  await page.unroute("https://api.open-meteo.com/**");
  await page.route("https://api.open-meteo.com/**", (route) => route.abort());
  await page.getByRole("button", { name: "刷新天气" }).click();
  await expect(page.getByRole("status")).toContainText("离线缓存");
  expect(JSON.parse((await exported(page)).cards[0].text)).toMatchObject({
    latitude: 35.68,
    longitude: 139.69,
  });
});
test("calendar month and selected date persist and all tools support masking and display modes", async ({
  page,
}) => {
  await start(page);
  const card = await tool(page, "日历");
  await card.getByRole("button", { name: "下个月" }).click();
  const cell = card.getByRole("gridcell").first(),
    date = await cell.getAttribute("aria-label");
  await cell.click();
  await expect(cell).toHaveAttribute("aria-selected", "true");
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("gridcell", { name: date!, exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.locator(".tool-heading").click({ button: "right" });
  await page.getByRole("menuitemradio", { name: "显示模式：小" }).click();
  await expect(card.locator(".component-type-icon")).toHaveCount(1);
  await expect(card.locator(".tool-component")).toHaveCount(0);
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "遮罩", exact: true }).click();
  await expect(card.locator(".component-mask")).toHaveCount(1);
});
test("format detection preserves prose while recognizing code, data, configuration and explicit language fences", async ({
  page,
}) => {
  await start(page);
  const samples: [string, string][] = [
    ['{"name":"Yua","ready":true}', "json"],
    ['def greet(name):\n    return "Hi " + name', "py"],
    ["const answer = 42;\nconsole.log(answer);", "js"],
    ["interface User { name: string; }", "ts"],
    [".canvas { color: red; padding: 12px; }", "css"],
    ['#!/bin/bash\necho "hello"', "sh"],
    ["SELECT name FROM users WHERE id = 1;", "sql"],
    ["name: Yua\nversion: 1", "yaml"],
    ['package main\nfunc main() { println("hello") }', "go"],
    ['fn main() { println!("hello"); }', "rs"],
    ["FROM node:22\nWORKDIR /app\nRUN npm ci", "dockerfile"],
    ["```elixir\ndefmodule Hello do\nend\n```", "ex"],
    ["# A document\n\n**Bold text**", "md"],
    ['[project]\nname = "Yua"', "toml"],
    ["<div>Hello</div>", "html"],
    ['```haskell\nmain = putStrLn "Hello"\n```', "hs"],
  ];
  const results = await page.evaluate(async (samples) => {
    const mod = await import("/src/textFormats.ts" as string);
    return samples.map(([source]) => mod.detectTextFormat(source)?.extension);
  }, samples);
  expect(results).toEqual(samples.map(([, extension]) => extension));
  for (const prose of [
    "hello world",
    "普通文字保持原样",
    "123",
    "https://example.com",
    "flowchart is an ordinary word",
  ]) {
    await paste(page, prose);
    await expect(page.locator(".card-text").last()).toContainText(prose);
  }
  for (const [source, extension] of samples) {
    await paste(page, source);
    await expect(page.locator(".card-file").last()).toHaveAttribute(
      "aria-label",
      `pasted.${extension}`,
    );
  }
  await expect(
    page.locator(".card-file").last().locator('[data-code-state="ready"]'),
  ).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator(".hljs-keyword")).not.toHaveCount(0);
  const snapshot = await exported(page),
    json = snapshot.cards.find((c: any) => c.title === "pasted.json");
  expect(Buffer.from(json.blob.split(",")[1], "base64").toString()).toBe(
    samples[0][0],
  );
});
test("uploaded source files and Markdown fences highlight safely, and editing updates language and original bytes", async ({
  page,
}) => {
  await start(page);
  await page.getByTestId("files").setInputFiles({
    name: "safe.py",
    mimeType: "text/plain",
    buffer: Buffer.from(
      'def greet():\n    return "<script>window.unsafe = true</script>"',
    ),
  });
  const card = page.locator(".card-file");
  await expect(
    card.locator('[data-code-language="python"][data-code-state="ready"]'),
  ).toHaveCount(1, { timeout: 20000 });
  await expect(card.locator(".hljs-keyword")).toContainText(["def", "return"]);
  expect(await page.evaluate(() => (window as any).unsafe)).toBeUndefined();
  await card.dblclick();
  await page.getByRole("button", { name: "编辑文件", exact: true }).click();
  await page
    .getByRole("textbox", { name: "文件内容" })
    .fill("def updated():\n    return 99");
  await page.getByRole("button", { name: "保存文件", exact: true }).click();
  await page.getByRole("button", { name: "关闭详情" }).click();
  await expect(card).toContainText("updated");
  await expect(card).not.toContainText("greet");
  await page.getByTestId("files").setInputFiles({
    name: "code.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      '# Code\n\n```rust\nfn main() { println!("safe"); }\n```',
    ),
  });
  await expect(
    page.locator(".markdown .language-rust .hljs-keyword"),
  ).not.toHaveCount(0, { timeout: 20000 });
});
test("English and dark/system preferences update live, preserve user content and restore after reload", async ({
  page,
}) => {
  await start(page);
  await paste(page, "使用说明");
  const card = await tool(page, "日历");
  await expect(card).toContainText("日历");
  await page
    .getByRole("combobox", { name: "语言", exact: true })
    .selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".card-text")).toHaveText("使用说明");
  await expect(card).toContainText("Calendar");
  await expect(card).not.toContainText("日历");
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".canvas")).toHaveCSS(
    "background-color",
    "rgb(23, 27, 34)",
  );
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x: 20, y: 400 } });
  await page.getByRole("menuitem", { name: "New tool", exact: true }).hover();
  await expect(
    page
      .getByRole("menu", { name: "New tool menu", exact: true })
      .getByRole("menuitem"),
  ).toHaveText([
    "TODO",
    "Calculator",
    "Currency exchange",
    "Celsius / Fahrenheit",
    "Distance converter",
    "Weather",
    "Calendar",
  ]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Help", exact: true }),
  ).toContainText("Keyboard shortcuts");
  await expect(page.getByRole("dialog")).not.toContainText("画布");
  await page.getByRole("button", { name: "Close help", exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page
    .getByRole("combobox", { name: "Appearance" })
    .selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh");
  await expect(
    page.getByRole("button", { name: "使用说明", exact: true }),
  ).toBeVisible();
});

import { test, expect, type Page } from "@playwright/test";
// Deliberately fake credentials: every provider request is intercepted.
const fakeKey = "fake-agent-test-credential";
async function create(page: Page) {
  await page.goto("/");
  await page.mouse.click(100, 100, { button: "right" });
  await page.getByRole("menuitem", { name: "新建", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Agent", exact: true }).click();
  await expect(page.locator(".card-agent")).toHaveCount(1);
  await page.getByRole("button", { name: "配置 Agent", exact: true }).click();
  await page.getByLabel("API Key", { exact: true }).fill(fakeKey);
  await page.getByLabel("系统提示词").fill("请用中文简短回答");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
}
async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "发送给 Agent" }).fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
}
async function download(page: Page) {
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  const result = await promise,
    stream = await result.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return Buffer.concat(chunks);
}
const sse = (text: string) =>
  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\r\n\r\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}\r\n\r\n`;

test("Agent streams multi-turn responses, restores history, and keeps keys out of JSON and ZIP backups", async ({
  page,
  browser,
}) => {
  const bodies: any[] = [];
  await page.route("https://api.openai.com/v1/responses", (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${fakeKey}`);
    const body = route.request().postDataJSON();
    bodies.push(body);
    return route.fulfill({
      contentType: "text/event-stream",
      body: sse(bodies.length === 1 ? "你好，世界🌍" : "这是第二轮回答"),
    });
  });
  await create(page);
  await send(page, "你好");
  await expect(page.locator(".agent-message.assistant")).toHaveText(
    "Agent你好，世界🌍",
  );
  await send(page, "继续");
  await expect(page.locator(".agent-message.assistant")).toHaveCount(2);
  expect(bodies[0]).toMatchObject({
    model: "gpt-5-mini",
    stream: true,
    store: false,
    instructions: "请用中文简短回答",
    input: [{ role: "user", content: "你好" }],
  });
  expect(bodies[1].input).toEqual([
    { role: "user", content: "你好" },
    { role: "assistant", content: "你好，世界🌍" },
    { role: "user", content: "继续" },
  ]);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".agent-message")).toHaveCount(4);
  const bytes = await download(page),
    json = JSON.parse(bytes.toString());
  expect(bytes.toString()).not.toContain(fakeKey);
  expect(JSON.parse(json.cards[0].text).messages).toHaveLength(4);
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto("/");
  await fresh.getByTestId("import").setInputFiles({
    name: "agent.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await fresh.getByRole("button", { name: "确认替换" }).click();
  await expect(fresh.locator(".agent-message")).toHaveCount(4);
  await send(fresh, "没有密钥");
  await expect(fresh.getByRole("alert")).toHaveText("请先填写 API Key");
  await expect(fresh.getByLabel("API Key", { exact: true })).toHaveValue("");
  await context.close();
  await page.mouse.click(700, 100, { button: "right" });
  await page.getByRole("menuitem", { name: "新建", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Agent", exact: true }).click();
  await page.mouse.click(10, 200);
  await page.keyboard.press("ControlOrMeta+a");
  await page.mouse.click(10, 200, { button: "right" });
  const pending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载", exact: true }).click();
  const zip = await pending,
    stream = await zip.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const zipBytes = Buffer.concat(chunks);
  const { unzipSync, strFromU8 } = await import("fflate");
  for (const entry of Object.values(unzipSync(zipBytes)))
    expect(strFromU8(entry)).not.toContain(fakeKey);
  await page.getByTestId("files").setInputFiles({
    name: "agent.zip",
    mimeType: "application/zip",
    buffer: zipBytes,
  });
  await expect(page.locator(".card-agent")).toHaveCount(4);
  await expect(page.locator(".agent-message")).toHaveCount(8);
});

test("compatible chat API, authentication errors, retries, endpoint-bound credentials and new conversations", async ({
  page,
}) => {
  let calls = 0;
  await page.route(
    "https://compatible.example/v1/chat/completions",
    (route) => {
      const body = route.request().postDataJSON();
      expect(body.messages[0]).toEqual({
        role: "system",
        content: "请用中文简短回答",
      });
      calls++;
      return calls === 1
        ? route.fulfill({ status: 401, json: { error: { message: fakeKey } } })
        : route.fulfill({
            json: { choices: [{ message: { content: "兼容接口正常" } }] },
          });
    },
  );
  await create(page);
  await page.getByRole("button", { name: "Agent 设置", exact: true }).click();
  await page
    .getByLabel("接口地址", { exact: true })
    .fill("https://compatible.example/v1");
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  await page.getByLabel("接口协议", { exact: true }).selectOption("chat");
  await page.getByLabel("API Key", { exact: true }).fill(fakeKey);
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await send(page, "测试");
  await expect(page.getByRole("alert")).toHaveText(
    "API Key 无效或已过期，请检查设置",
  );
  await expect(page.locator(".agent-card")).not.toContainText(fakeKey);
  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  await expect(page.locator(".agent-message.assistant")).toContainText(
    "兼容接口正常",
  );
  await expect(page.locator(".agent-message.user")).toHaveCount(1);
  await page.getByRole("button", { name: "新建对话", exact: true }).click();
  await expect(page.locator(".agent-message")).toHaveCount(0);
  await page.getByRole("button", { name: "Agent 设置", exact: true }).click();
  await page.getByLabel("API Key", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await send(page, "已移除密钥");
  await expect(page.getByRole("alert")).toHaveText("请先填写 API Key");
});

test("arbitrary SSE chunks preserve Unicode; stopping generation persists partial text and undo cancels stale replies", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const realFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (!String(url).includes("api.openai.com/v1/responses"))
        return realFetch(url, options);
      const bytes = new TextEncoder().encode(
        'data: {"type":"response.output_text.delta","delta":"分块🌍回复"}\r\n\r\n',
      );
      return new Response(
        new ReadableStream({
          async start(controller) {
            options?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("Aborted", "AbortError")),
            );
            for (let i = 0; i < bytes.length; i += 3)
              controller.enqueue(bytes.slice(i, i + 3));
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    };
  });
  await create(page);
  await send(page, "分块测试");
  await expect(page.locator(".agent-message.assistant")).toContainText(
    "分块🌍回复",
  );
  await page.getByRole("button", { name: "停止生成", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".agent-message.assistant")).toContainText(
    "分块🌍回复",
  );
  await send(page, "撤销中的请求");
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  await page.locator(".agent-header strong").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".agent-message.user")).toHaveCount(1);
  await expect(page.locator(".agent-message.assistant")).toHaveCount(1);
});

test("import rejects embedded keys, and shared Agent nodes never expose controls or make API requests", async ({
  page,
}) => {
  const state = {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    protocol: "responses",
    instructions: "",
    messages: [
      { role: "user", content: "问题" },
      { role: "assistant", content: "只读回答" },
    ],
  };
  const card = {
    id: "agent",
    kind: "agent",
    title: "Agent",
    text: JSON.stringify(state),
    x: 50,
    y: 50,
    width: 400,
    height: 560,
    displayMode: "large",
    color: "#ffffff",
  };
  let calls = 0;
  await page.route("https://api.openai.com/**", (route) => {
    calls++;
    return route.abort();
  });
  await page.route("**/api/shares/resolve", (route) =>
    route.fulfill({
      json: { snapshot: { version: 1, cards: [card], groups: [] } },
    }),
  );
  await page.goto("/#/s/" + "a".repeat(64));
  await expect(page.locator(".agent-message.assistant")).toContainText(
    "只读回答",
  );
  await expect(page.getByRole("button", { name: "Agent 设置" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "发送给 Agent" })).toHaveCount(
    0,
  );
  expect(calls).toBe(0);
  await page.goto("/");
  await page.getByTestId("import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        cards: [
          { ...card, text: JSON.stringify({ ...state, apiKey: fakeKey }) },
        ],
        groups: [],
      }),
    ),
  });
  await expect(page.getByRole("status")).toContainText("Agent 配置无效");
  await expect(page.locator(".card-agent")).toHaveCount(0);
});

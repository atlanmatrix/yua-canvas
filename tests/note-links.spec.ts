import { test, expect, type Page } from "@playwright/test";

async function paste(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    document.querySelector(".canvas")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}
async function view(page: Page) {
  return page.locator(".world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, z: m.a };
  });
}

test("pasted web URLs display as links, preserve original text and remain editable after reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加笔记", exact: true }),
  ).toBeEnabled();
  const text = " https://example.com/文档?q=画布&mode=1#预览\n";
  await paste(page, text);
  const card = page.getByTestId("card"),
    link = card.getByRole("link");
  await expect(card).toHaveCount(1);
  await expect(link).toHaveText(text.trim());
  await expect(card.locator(".note-body")).toHaveText(text);
  await expect(link).toHaveCSS("color", "rgb(37, 99, 235)");
  await expect(link).toHaveCSS("text-decoration-line", "underline");
  await expect(link).toHaveAttribute("href", new URL(text.trim()).href);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("draggable", "false");
  await link.click();
  await expect(card).toHaveClass(/selected/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator('.save-indicator[data-state="已保存至本地"]'),
  ).toBeVisible();
  await page.reload();
  await expect(link).toHaveAttribute("href", new URL(text.trim()).href);
  await link.dblclick();
  const input = page.getByRole("textbox", { name: "笔记内容" });
  await expect(input).toHaveValue(text);
  await input.fill("普通笔记内容");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await expect(link).toHaveCount(0);
  await expect(card.locator(".note-body")).toHaveText("普通笔记内容");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(link).toHaveAttribute("href", new URL(text.trim()).href);
});

for (const modifier of ["Meta", "Control"] as const) {
  test(`${modifier} click opens a new tab while ${modifier} dragging still pans without navigation`, async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "添加笔记", exact: true }),
    ).toBeEnabled();
    await paste(page, "https://example.com/canvas?mode=test#section");
    const card = page.getByTestId("card"),
      link = card.getByRole("link");
    const geometry = await card.evaluate(
      (el) => (el as HTMLElement).style.cssText,
    );
    const originalView = await view(page);
    await context.route("https://example.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<title>Opened link</title>",
      }),
    );
    const pending = context.waitForEvent("page");
    await link.click({ modifiers: [modifier] });
    const tab = await pending;
    await tab.waitForLoadState();
    expect(tab.url()).toBe("https://example.com/canvas?mode=test#section");
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    await tab.close();
    expect(await view(page)).toEqual(originalView);
    expect(await card.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
      geometry,
    );
    await expect(page.locator(".app")).not.toHaveClass(/is-grabbing/);
    const tabs = context.pages().length;
    const box = (await link.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.keyboard.down(modifier);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y + 45, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up(modifier);
    const after = await view(page);
    expect(after.x - originalView.x).toBeCloseTo(80);
    expect(after.y - originalView.y).toBeCloseTo(45);
    expect(context.pages()).toHaveLength(tabs);
    expect(await card.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(
      geometry,
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // An ordinary drag still moves the note itself.
    const moved = (await link.boundingBox())!;
    await page.mouse.move(
      moved.x + moved.width / 2,
      moved.y + moved.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      moved.x + moved.width / 2 + 35,
      moved.y + moved.height / 2 + 20,
      { steps: 6 },
    );
    await page.mouse.up();
    expect(
      await card.evaluate((el) => (el as HTMLElement).style.cssText),
    ).not.toBe(geometry);
    expect(await view(page)).toEqual(after);
    expect(context.pages()).toHaveLength(tabs);
  });
}

test("www addresses are supported while non-web schemes, mixed text and multiline URLs remain plain text", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加笔记", exact: true }),
  ).toBeEnabled();
  await paste(page, "www.example.com/guide");
  await expect(
    page.getByTestId("card").last().getByRole("link"),
  ).toHaveAttribute("href", "https://www.example.com/guide");
  for (const text of [
    "http://localhost:3000/path",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "普通文本 https://example.com",
    "https://example.com\nhttps://example.org",
    "https://",
  ]) {
    await paste(page, text);
    const card = page.getByTestId("card").last();
    await expect(card.locator(".note-body")).toHaveText(text);
    await expect(card.getByRole("link")).toHaveCount(
      text.startsWith("http://localhost") ? 1 : 0,
    );
  }
});

test("short and wrapped URLs fit their generated block without cutting off link text", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加笔记", exact: true }),
  ).toBeEnabled();
  for (const text of [
    "https://example.com/docs?project=canvas",
    "https://example.com/" + "segment/".repeat(70) + "?query=end",
  ]) {
    await paste(page, text);
    const card = page.getByTestId("card").last();
    await expect(card.getByRole("link")).toHaveText(text);
    const sizes = await card
      .locator(".note-body")
      .evaluate((el) => ({
        height: el.clientHeight,
        content: el.scrollHeight,
        width: el.clientWidth,
        contentWidth: el.scrollWidth,
      }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.height);
    expect(sizes.contentWidth).toBeLessThanOrEqual(sizes.width);
    expect(
      await card.evaluate((el) => parseFloat((el as HTMLElement).style.width)),
    ).toBeLessThanOrEqual(648);
  }
});

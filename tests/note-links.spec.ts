import { textWidth80 } from "./helpers";
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

test("pasted web URLs highlight only with modifiers, preserve text and remain editable after reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  const text = " https://example.com/文档?q=画布&mode=1#预览\n";
  await paste(page, text);
  const card = page.getByTestId("card"),
    link = card.getByRole("link");
  await expect(card).toHaveCount(1);
  await expect(link).toHaveText(text.trim());
  await expect(card.locator(".note-body")).toHaveText(text);
  await expect(link).toHaveCSS("color", "rgb(51, 65, 85)");
  await expect(link).toHaveCSS("text-decoration-line", "none");
  await expect(link).toHaveCSS("cursor", "grab");
  for (const modifier of ["Meta", "Control"]) {
    await page.keyboard.down(modifier);
    await expect(link).toHaveCSS("color", "rgb(37, 99, 235)");
    await expect(link).toHaveCSS("text-decoration-line", "underline");
    await expect(link).toHaveCSS("cursor", "pointer");
    await page.keyboard.up(modifier);
    await expect(link).toHaveCSS("text-decoration-line", "none");
  }
  await page.keyboard.down("Meta");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(link).toHaveCSS("text-decoration-line", "none");
  await page.keyboard.up("Meta");
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
  const input = page.getByRole("textbox", { name: "文本内容" });
  await expect(input).toHaveText(text);
  await input.fill("普通文本内容");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(link).toHaveCount(0);
  await expect(card.locator(".note-body")).toHaveText("普通文本内容");
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
      page.getByRole("button", { name: "添加任务", exact: true }),
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
    page.getByRole("button", { name: "添加任务", exact: true }),
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

test("address capsules keep a fixed icon and truncate only the long address", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  for (const text of [
    "https://example.com",
    "https://example.com/" + "segment/".repeat(70) + "?query=end",
  ]) {
    await paste(page, text);
    const card = page.getByTestId("card").last();
    const link = card.getByRole("link");
    await expect(link).toHaveText(text);
    await expect(link).toHaveAttribute("title", text);
    await expect(card).toHaveCSS("border-radius", "999px");
    await expect(link).toHaveCSS("text-overflow", "ellipsis");
    await expect(link).toHaveCSS("white-space", "nowrap");
    await expect(card.getByRole("button", { name: "链接选项" })).toHaveCSS(
      "width",
      "32px",
    );
    await expect(card.getByRole("button", { name: "链接选项" })).toHaveCSS(
      "height",
      "32px",
    );
    const shortened = await link.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(shortened).toBe(text.length > 100);
    expect(
      await card.evaluate((el) => parseFloat((el as HTMLElement).style.width)),
    ).toBeLessThanOrEqual(await textWidth80(page));
    if (shortened) {
      await card.hover();
      await card.getByRole("button", { name: "切换为滚动模式" }).click();
      await expect(link).toHaveCSS("overflow-x", "auto");
      await link.hover();
      await page.mouse.wheel(120, 0);
      await expect
        .poll(() => link.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
    }
  }
});

test("link icons only offer unlink, and pasted email and web addresses can be restored from plain text", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  for (const [address, href] of [
    ["https://example.com/guide", "https://example.com/guide"],
    ["name+tag@example.org", "mailto:name+tag@example.org"],
  ]) {
    await paste(page, address);
    const card = page.getByTestId("card").last();
    const text = card.locator(".note-body p");
    const addressLink = text.getByRole("link");
    const icon = card.getByRole("button", { name: "链接选项" });
    const tabs = context.pages().length;
    await expect(addressLink).toHaveAttribute("href", href);
    await expect(icon).toHaveCSS("border-radius", "999px");
    await expect(icon).toHaveCSS("width", "32px");
    await expect(icon).toHaveCSS("height", "32px");
    await expect(card).toHaveCSS("background-color", "rgb(237, 240, 244)");
    await expect(icon).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(icon.locator("svg")).toHaveAttribute(
      "data-ui-icon",
      href.startsWith("mailto:") ? "Mail" : "Link2",
    );

    await icon.hover();
    await expect(icon).toHaveCSS("background-color", "rgb(237, 240, 244)");
    await icon.click({ modifiers: ["Control"] });
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(context.pages()).toHaveLength(tabs);

    await icon.click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText(["取消链接"]);
    await menu.getByRole("menuitem", { name: "取消链接" }).click();
    await expect(text).toHaveText(address);
    await expect(addressLink).toHaveCount(0);
    await expect(icon).toHaveCount(0);
    await text.click({ modifiers: ["Control"] });
    expect(context.pages()).toHaveLength(tabs);

    await expect(
      page.locator('.save-indicator[data-state="已保存至本地"]'),
    ).toBeVisible();
    await page.reload();
    await expect(text).toHaveText(address);
    await expect(addressLink).toHaveCount(0);
    const archived = await page.evaluate(async () => {
      const { readBoard } = await import("/src/storage.ts");
      const { createArchive, readArchive } = await import("/src/archive.ts");
      const card = (await readBoard())!.cards.at(-1)!;
      const blob = await createArchive({ cards: [card], groups: [] });
      const copy = await readArchive(new File([blob], "note.zip"), {
        x: 0,
        y: 0,
      });
      return copy.cards[0].linkDisabled;
    });
    expect(archived).toBe(true);
    await text.click({ button: "right" });
    await menu.getByRole("menuitem", { name: "设为链接" }).click();
    await expect(addressLink).toHaveAttribute("href", href);
  }
  await page.emulateMedia({ colorScheme: "dark" });
  const capsule = page.getByTestId("card").last();
  await expect(capsule).toHaveCSS("background-color", "rgb(44, 51, 64)");
  await expect(capsule.getByRole("button", { name: "链接选项" })).toHaveCSS(
    "background-color",
    "rgb(35, 40, 50)",
  );
  await expect(capsule.getByRole("link")).toHaveCSS(
    "color",
    "rgb(224, 230, 239)",
  );
});

test("address geometry and options menu are usable from the keyboard in either theme", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  await paste(page, "person@example.org");
  const card = page.getByTestId("card"),
    icon = card.getByRole("button", { name: "链接选项" });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(card).toHaveCSS("height", "42px");
    await expect(icon).toHaveCSS("width", "32px");
    await icon.press("Enter");
    const unlink = page.getByRole("menuitem", { name: "取消链接" });
    await expect(unlink).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(icon).toBeFocused();
    await expect(icon).toHaveCSS("outline-width", "2px");
  }
  await icon.press("Space");
  await page.getByRole("menuitem", { name: "取消链接" }).press("Enter");
  await expect(card.getByRole("link")).toHaveCount(0);
  await expect(card).toContainText("person@example.org");
});

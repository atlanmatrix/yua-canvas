import { test, expect } from "@playwright/test";

test("Markdown renders Mermaid and both flowchart syntaxes, with readable invalid code and safe SVG", async ({
  page,
}) => {
  await page.goto("/");
  const markdown = [
    "# 图表预览",
    "```mermaid\nflowchart LR\n  A[开始] --> B{完成?}\n  B -->|是| C[结束]\n```",
    "```flowchart\nst=>start: 开始\nop=>operation: 处理\ne=>end: 结束\nst->op->e\n```",
    "```flowchart\nflowchart TD\n  X[输入] --> Y[输出]\n```",
    "```mermaid\nthis is not a valid diagram\n```",
    "```js\nconst ready = true;\n```",
    "<script>window.__diagramUnsafe=true</script>",
  ].join("\n\n");
  await page.getByTestId("files").setInputFiles({
    name: "图表.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown),
  });
  await page.getByTestId("card").dblclick();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.locator('.markdown-diagram[data-diagram-state="ready"]'),
  ).toHaveCount(3, { timeout: 20000 });
  await expect(
    dialog.locator('.markdown-diagram[data-diagram-state="error"]'),
  ).toHaveCount(1);
  await expect(dialog.locator(".markdown-diagram svg")).toHaveCount(3);
  await expect(dialog.locator(".markdown-diagram").first()).toContainText(
    "开始",
  );
  await expect(dialog.locator(".markdown-diagram").nth(1)).toContainText(
    "处理",
  );
  await expect(dialog.locator(".markdown-diagram").nth(2)).toContainText(
    "输入",
  );
  await expect(
    dialog.locator('.markdown-diagram[data-diagram-state="error"] pre'),
  ).toHaveText("this is not a valid diagram");
  await expect(dialog.locator("pre code.language-js")).toContainText(
    "const ready = true",
  );
  await expect(
    dialog.locator(
      "svg script,svg [onload],svg [onclick],svg [href^='javascript:']",
    ),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__diagramUnsafe),
  ).toBeUndefined();
  await expect(page.locator(".diagram-staging")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/yua-diagrams.png" });
  await page.keyboard.press("Escape");
  await page.getByTestId("card").dblclick();
  await expect(
    dialog.locator('.markdown-diagram[data-diagram-state="ready"]'),
  ).toHaveCount(3);
});

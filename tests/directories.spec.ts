import { openNoteEditor } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

async function board(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  const file = await pending,
    stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
async function transfer(page: Page, action: "paste" | "drop", modern = false) {
  await page.evaluate(
    ({ action, modern, png }) => {
      const leaf = (name: string, content: string, type = "text/plain") => ({
        isFile: true,
        isDirectory: false,
        name,
        file: (success: (file: File) => void) =>
          setTimeout(
            () =>
              success(
                new File(
                  [
                    type === "image/png"
                      ? Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
                      : content,
                  ],
                  name,
                  { type },
                ),
              ),
            0,
          ),
      });
      const directory = (name: string, entries: any[]) => ({
        isFile: false,
        isDirectory: true,
        name,
        createReader: () => {
          let index = 0;
          return {
            readEntries: (success: (entries: any[]) => void) => {
              const batch = entries.slice(index, index + 2);
              index += 2;
              setTimeout(() => success(batch), 0);
            },
          };
        },
      });
      const root = directory("项目资料", [
        leaf("说明.md", "# 根目录正文", "text/markdown"),
        leaf(".env", "ENV=local\n"),
        directory("子目录", [
          leaf("说明.md", "# 子目录正文", "text/markdown"),
          leaf("原图.png", png, "image/png"),
        ]),
        directory("空目录", []),
      ]);
      const asHandle = (entry: any): any =>
        entry.isFile
          ? {
              kind: "file",
              name: entry.name,
              getFile: () => new Promise((resolve) => entry.file(resolve)),
            }
          : {
              kind: "directory",
              name: entry.name,
              async *values() {
                const reader = entry.createReader();
                for (;;) {
                  const entries: any = await new Promise((resolve) =>
                    reader.readEntries(resolve),
                  );
                  if (!entries.length) break;
                  for (const child of entries) yield asHandle(child);
                }
              },
            };
      let active = true;
      const item = {
        kind: "file",
        webkitGetAsEntry: () => {
          if (!active) throw Error("Expired transfer");
          return modern ? null : root;
        },
        getAsFileSystemHandle: () => {
          if (!active) throw Error("Expired transfer");
          return Promise.resolve(asHandle(root));
        },
        getAsFile: () => null,
      };
      const data = new DataTransfer();
      const exposed = { files: [], items: [item], getData: () => "" };
      const canvas = document.querySelector(".canvas")!;
      const r = canvas.getBoundingClientRect();
      const event =
        action === "paste"
          ? new ClipboardEvent("paste", {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            })
          : new DragEvent("drop", {
              dataTransfer: data,
              clientX: r.left + 150,
              clientY: r.top + 180,
              bubbles: true,
              cancelable: true,
            });
      Object.defineProperty(
        event,
        action === "paste" ? "clipboardData" : "dataTransfer",
        { value: exposed },
      );
      canvas.dispatchEvent(event);
      active = false;
      // Real transfers become inaccessible after the event; retained references
      // must still be sufficient for asynchronous traversal.
      data.items.clear();
    },
    { action, modern, png },
  );
}

for (const variant of ["paste", "drop", "handle"] as const) {
  test(`${variant} directory groups retain nested and empty folders, every read batch and file contents`, async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "导入目录" })).toBeEnabled();
    await transfer(
      page,
      variant === "drop" ? "drop" : "paste",
      variant === "handle",
    );
    await expect(page.getByTestId("card")).toHaveCount(4);
    await expect(page.locator(".group-boundary")).toHaveCount(3);
    const imported = await board(page);
    const root = imported.groups.find((g: any) => g.name === "项目资料");
    const child = imported.groups.find((g: any) => g.name === "子目录");
    const empty = imported.groups.find((g: any) => g.name === "空目录");
    expect(child.parent).toBe(root.id);
    expect(empty.parent).toBe(root.id);
    expect(imported.cards.filter((c: any) => c.group === root.id)).toHaveLength(
      2,
    );
    expect(
      imported.cards.filter((c: any) => c.group === child.id),
    ).toHaveLength(2);
    for (const card of imported.cards) {
      const b = imported.groups.find((g: any) => g.id === card.group).bounds;
      expect(card.x).toBeGreaterThanOrEqual(b.x + 20);
      expect(card.y).toBeGreaterThanOrEqual(b.y + 45);
      expect(card.x + card.width).toBeLessThanOrEqual(b.x + b.width);
      expect(card.y + card.height).toBeLessThanOrEqual(b.y + b.height);
    }
    const nested = imported.cards.find(
      (c: any) => c.title === "说明.md" && c.group === child.id,
    );
    expect(Buffer.from(nested.blob.split(",")[1], "base64").toString()).toBe(
      "# 子目录正文",
    );
    expect(imported.cards.find((c: any) => c.kind === "image").blob).toBe(
      "data:image/png;base64," + png,
    );
    expect(imported.cards.some((c: any) => c.title === "项目资料")).toBe(false);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("card")).toHaveCount(0);
    await expect(page.locator(".group-boundary")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(page.getByTestId("card")).toHaveCount(4);
    await expect(
      page.locator('.save-indicator[data-state="已保存至本地"]'),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("card")).toHaveCount(4);
    await expect(page.locator(".group-boundary")).toHaveCount(3);
    if (variant === "paste")
      await page.screenshot({ path: "/tmp/yua-directory-paste.png" });
  });
}

for (const method of ["picker", "native drop"] as const) {
  test(`directory ${method} imports native relative paths and original bytes`, async ({
    page,
  }) => {
    const path = await mkdtemp(join(tmpdir(), "yua-directory-"));
    const original = Buffer.concat([
      Buffer.from([255, 254]),
      Buffer.from("APP_NAME=画布\n", "utf16le"),
    ]);
    try {
      await mkdir(join(path, "素材"));
      await mkdir(join(path, "空目录"));
      await writeFile(join(path, "配置.env"), original);
      await writeFile(join(path, "素材", "样例.txt"), "子目录内容");
      await page.goto("/");
      if (method === "picker") {
        const choosing = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "导入目录" }).click();
        await (await choosing).setFiles(path);
      } else {
        await expect(
          page.getByRole("button", { name: "导入目录" }),
        ).toBeEnabled();
        const cdp = await page.context().newCDPSession(page);
        const data = { items: [], files: [path], dragOperationsMask: 1 };
        for (const type of ["dragEnter", "dragOver", "drop"] as const)
          await cdp.send("Input.dispatchDragEvent", {
            type,
            x: 300,
            y: 200,
            data,
          });
        await cdp.detach();
      }
      await expect(page.getByTestId("card")).toHaveCount(2);
      await expect(page.locator(".group-boundary")).toHaveCount(
        method === "picker" ? 2 : 3,
      );
      const imported = await board(page);
      const root = imported.groups.find((g: any) => g.name === basename(path));
      expect(imported.groups.find((g: any) => g.name === "素材").parent).toBe(
        root.id,
      );
      const config = imported.cards.find((c: any) => c.title === "配置.env");
      expect(Buffer.from(config.blob.split(",")[1], "base64")).toEqual(
        original,
      );
      await expect(
        page.locator('.card[aria-label="配置.env"] .file-content-thumbnail'),
      ).toContainText("APP_NAME=画布");
    } finally {
      await rm(path, { recursive: true, force: true });
    }
  });
}

test("a directory read failure does not import partial files or overwrite the board", async ({
  page,
}) => {
  await page.goto("/");
  await openNoteEditor(page);
  await page.getByRole("textbox", { name: "笔记内容" }).fill("保留内容");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await page.evaluate(() => {
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
    });
    const item = {
      kind: "file",
      getAsFile: () => null,
      webkitGetAsEntry: () => ({
        name: "无法读取",
        isDirectory: true,
        isFile: false,
        createReader: () => ({
          readEntries: (_: unknown, reject: (e: Error) => void) =>
            reject(Error("无法读取目录")),
        }),
      }),
    };
    Object.defineProperty(event, "clipboardData", {
      value: { files: [], items: [item], getData: () => "" },
    });
    document.querySelector(".canvas")!.dispatchEvent(event);
  });
  await expect(page.getByRole("status")).toContainText("无法读取目录");
  await expect(page.getByTestId("card")).toHaveCount(1);
  await expect(page.getByTestId("card")).toContainText("保留内容");
  await expect(page.locator(".group-boundary")).toHaveCount(0);
});

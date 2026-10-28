import type { Card } from "./storage";
export type ClipboardCopy = { items: ClipboardItem[]; message: string };
export class FileClipboardUnsupported extends Error {
  constructor(public files: Card[]) {
    super("浏览器不支持复制系统文件，请下载原文件");
  }
}
export const isTextFile = (card: Card) =>
  card.editableFile ||
  card.mime?.startsWith("text/") ||
  /(?:^|\.)env(?:\.[^/]+)*$/i.test(card.title) ||
  /\.(txt|md|markdown|mdown|csv|json|xml|yaml|yml|log|js|ts|tsx|jsx|css|html|svg)$/i.test(
    card.title,
  );
export const isMarkdownFile = (card: Card) =>
  card.kind === "file" &&
  (card.mime === "text/markdown" || /\.(md|markdown|mdown)$/i.test(card.title));
export const isPdfFile = (card: Card) =>
  card.kind === "file" &&
  (card.mime === "application/pdf" || /\.pdf$/i.test(card.title));
export async function fileText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
  // Do not silently replace undecodable bytes: the original download is lossless.
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function png(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("图片转换失败");
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(Error("图片转换失败"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
// Build ClipboardItems synchronously so write() runs inside the copy gesture,
// including browsers which expire user activation while decoding an image.
export function clipboardCopy(cards: Card[]): ClipboardCopy {
  if (!cards.length) throw Error("请先选择要复制的内容");
  const unsupported = cards.filter((c) => c.kind === "file" && !isTextFile(c));
  if (unsupported.length) throw new FileClipboardUnsupported(unsupported);
  const images = cards.filter((c) => c.kind === "image");
  if (images.length) {
    if (cards.length !== 1) throw Error("图片请逐张复制；文本可多选复制");
    const card = images[0];
    if (!card.blob) throw Error("图片数据不可用");
    return {
      items: [new ClipboardItem({ "image/png": png(card.blob) })],
      message: "已复制图片（PNG）",
    };
  }
  const text = Promise.all(
    cards.map((c) => {
      if (c.kind === "file") {
        if (!c.blob) throw Error("文件数据不可用");
        return fileText(c.blob);
      }
      if (c.kind === "todo")
        return (c.tasks || [])
          .map((t) => `- [${t.done ? "x" : " "}] ${t.text}`)
          .join("\n");
      return c.kind === "canvas"
        ? c.title || "子画布"
        : c.kind === "miniature"
          ? c.miniatureView || c.text
          : c.text;
    }),
  ).then((parts) => new Blob([parts.join("\n\n")], { type: "text/plain" }));
  return {
    items: [new ClipboardItem({ "text/plain": text })],
    message: cards.some((c) => c.kind === "file")
      ? "已复制文件文本（仅供编辑器粘贴，不能粘贴为系统文件）"
      : "已复制",
  };
}

export function canvasClipboard(
  copy: ClipboardCopy | undefined,
  token: string,
  text: string,
): ClipboardItem[] {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  const item = copy?.items[0];
  const data: Record<string, Blob | Promise<Blob>> = {};
  if (item) for (const type of item.types) data[type] = item.getType(type);
  if (!data["text/plain"])
    data["text/plain"] = new Blob([text], { type: "text/plain" });
  const html = item?.types.includes("image/png")
    ? item.getType("image/png").then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve(`<img data-yua-copy="${token}" src="${reader.result}">`);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      )
    : Promise.resolve(data["text/plain"])
        .then((blob) => blob.text())
        .then(
          (value) =>
            `<span data-yua-copy="${token}" style="white-space:pre-wrap">${escape(value)}</span>`,
        );
  data["text/html"] = html.then(
    (value) => new Blob([value], { type: "text/html" }),
  );
  return [new ClipboardItem(data)];
}

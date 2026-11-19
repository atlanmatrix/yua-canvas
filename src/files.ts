import { cardRect } from "./geometry";
import { type Card } from "./storage";
import { isTextFile } from "./clipboard";
export const xlsxMime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export function isXlsxFile(file: Pick<Card, "title" | "mime">) {
  return file.mime === xlsxMime || /\.xlsx$/i.test(file.title);
}
export function fileMime(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    mdown: "text/markdown",
    json: "application/json",
    pdf: "application/pdf",
    xlsx: xlsxMime,
    csv: "text/csv",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    zip: "application/zip",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    webm: "video/webm",
  };
  return (
    types[extension || ""] ||
    (isTextFile({ title: name } as Card)
      ? "text/plain"
      : "application/octet-stream")
  );
}
// Use the displayed frames so wide reading previews leave the next file visible.
export function placeFileRows(
  cards: Card[],
  point: { x: number; y: number },
  columns: number,
) {
  let y = point.y;
  for (let start = 0; start < cards.length; start += columns) {
    const row = cards.slice(start, start + columns);
    let x = point.x,
      rowHeight = 0;
    for (const card of row) {
      card.x = x;
      card.y = y;
      const { width, height } = cardRect(card);
      x += width + 24;
      rowHeight = Math.max(rowHeight, height);
    }
    y += rowHeight + 24;
  }
  return cards;
}
export async function cardsFromFiles(
  files: File[],
  point: { x: number; y: number },
  pastedImages = false,
): Promise<Card[]> {
  const cards = await Promise.all(
    files.map(async (file): Promise<Card> => {
      const mime = isXlsxFile({ title: file.name, mime: file.type })
        ? xlsxMime
        : file.type || fileMime(file.name);
      const kind = mime.startsWith("image/") ? "image" : "file";
      let size = isTextFile({ title: file.name, mime } as Card)
        ? { width: 320, height: 240 }
        : { width: 240, height: 250 };
      if (mime === xlsxMime) size = { width: 400, height: 260 };
      if (mime === "application/pdf") size = { width: 360, height: 480 };
      if (kind === "image") {
        const url = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const scale = pastedImages
            ? image.naturalWidth > 2560 || image.naturalHeight > 1440
              ? 0.5
              : 1
            : Math.min(
                480 / image.naturalWidth,
                720 / image.naturalHeight,
                Math.max(
                  1,
                  80 / Math.max(image.naturalWidth, image.naturalHeight),
                ),
              );
          size = {
            width: image.naturalWidth * scale,
            height: image.naturalHeight * scale,
          };
        } catch {
          /* An unreadable image remains downloadable in its original form. */
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      return {
        id: crypto.randomUUID(),
        kind,
        displayMode:
          pastedImages && kind === "image"
            ? ("large" as const)
            : ("medium" as const),
        title: file.name,
        text: "",
        ...point,
        color: "#ffffff",
        blob: file,
        mime,
        ...size,
      };
    }),
  );
  return placeFileRows(cards, point, 4);
}

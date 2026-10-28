import { type Card } from "./storage";
import { isTextFile } from "./clipboard";
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
export async function cardsFromFiles(
  files: File[],
  point: { x: number; y: number },
): Promise<Card[]> {
  return Promise.all(
    files.map(async (file, index) => {
      const mime = file.type || fileMime(file.name);
      const kind = mime.startsWith("image/") ? "image" : "file";
      let size = isTextFile({ title: file.name, mime } as Card)
        ? { width: 320, height: 240 }
        : { width: 240, height: 250 };
      if (mime === "application/pdf") size = { width: 360, height: 480 };
      if (kind === "image") {
        const url = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const scale = Math.min(
            480 / image.naturalWidth,
            720 / image.naturalHeight,
            Math.max(1, 80 / Math.max(image.naturalWidth, image.naturalHeight)),
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
        title: file.name,
        text: "",
        x: point.x + (index % 4) * 270,
        y: point.y + Math.floor(index / 4) * 290,
        color: "#ffffff",
        blob: file,
        mime,
        ...size,
      };
    }),
  );
}

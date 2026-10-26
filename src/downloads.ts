import type { Card } from "./storage";
export function textDownloadName(now = new Date()): string {
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}.txt`;
}
export function cardDownload(card: Card): { blob: Blob; name: string } {
  if (card.blob) return { blob: card.blob, name: card.title };
  const text =
    card.kind === "todo"
      ? (card.tasks || [])
          .map((t) => `- [${t.done ? "x" : " "}] ${t.text}`)
          .join("\n")
      : card.text;
  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    name: textDownloadName(),
  };
}

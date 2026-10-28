import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import type { Card } from "./storage";
import { Markdown } from "./Markdown";
import { PdfPreview } from "./PdfPreview";
import { isTextFile, isMarkdownFile, isPdfFile } from "./clipboard";
export function Attachment({
  card,
  large = false,
  onPdfPageChange,
}: {
  card: Card;
  large?: boolean;
  onPdfPageChange?: (page: number) => void;
}) {
  const [asset, setAsset] = useState<{
      url: string;
      blob: Blob;
      mime?: string;
    }>(),
    [fileText, setFileText] = useState("");
  const url =
    asset && asset.blob === card.blob && asset.mime === card.mime
      ? asset.url
      : "";
  useEffect(() => {
    if (!card.blob || !isTextFile(card)) return;
    let active = true;
    const limit = isMarkdownFile(card)
      ? card.blob.size
      : large
        ? 1024 * 1024
        : 64 * 1024;
    card.blob
      .slice(0, limit)
      .arrayBuffer()
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        const encoding =
          bytes[0] === 255 && bytes[1] === 254
            ? "utf-16le"
            : bytes[0] === 254 && bytes[1] === 255
              ? "utf-16be"
              : "utf-8";
        const text = new TextDecoder(encoding).decode(bytes, {
          stream: card.blob!.size > limit,
        });
        if (active) setFileText(text);
      })
      .catch(() => {
        if (active) setFileText("");
      });
    return () => {
      active = false;
    };
  }, [large, card.blob, card.mime, card.title]);
  useEffect(() => {
    if (!card.blob) return;
    // The stored Blob type is preserved independently of the declared preview
    // type. Always give the PDF viewer a PDF URL, including mismatched imports.
    const preview =
      card.mime === "application/pdf"
        ? card.blob.slice(0, card.blob.size, "application/pdf")
        : card.blob;
    const u = URL.createObjectURL(preview);
    setAsset({ url: u, blob: card.blob, mime: card.mime });
    return () => URL.revokeObjectURL(u);
  }, [card.blob, card.mime]);
  if (!large && isPdfFile(card))
    return <PdfPreview card={card} onPageChange={onPdfPageChange} />;
  if (!large && isMarkdownFile(card))
    return (
      <div
        className="markdown-file-preview"
        onWheel={(e) => {
          if (e.currentTarget.scrollHeight > e.currentTarget.clientHeight)
            e.stopPropagation();
        }}
      >
        <Markdown>{fileText}</Markdown>
      </div>
    );
  if (!large && card.kind === "file" && isTextFile(card))
    return (
      <pre
        className="file-content-thumbnail"
        aria-label={`${card.title} 内容预览`}
      >
        {fileText}
      </pre>
    );
  if (
    large &&
    (/\.(md|markdown|mdown)$/i.test(card.title) ||
      card.mime === "text/markdown")
  )
    return <Markdown>{fileText}</Markdown>;
  if (large && fileText)
    return (
      <pre className="file-text">
        {fileText}
        {(card.blob?.size || 0) > 1024 * 1024
          ? "\n…（仅预览前 1 MB，完整内容请下载）"
          : ""}
      </pre>
    );
  if (card.kind === "image")
    return (
      <img
        className={large ? "detail-image" : "thumbnail"}
        src={url || undefined}
        alt={card.title}
      />
    );
  if (large && card.mime === "application/pdf")
    return <iframe title={card.title} src={url || undefined} className="pdf" />;
  if (large && card.mime?.startsWith("video/"))
    return <video controls src={url || undefined} />;
  if (large && card.mime?.startsWith("audio/"))
    return <audio controls src={url || undefined} />;
  return (
    <div className="file-preview">
      <FileText size={large ? 64 : 38} />
      <span>{card.title.split(".").pop()?.toUpperCase() || "FILE"}</span>
      <small>{((card.blob?.size || 0) / 1024).toFixed(1)} KB</small>
    </div>
  );
}

import { t as tr } from "./i18n";
import { PreviewBoundary } from "./PreviewBoundary";
import { usePreferences } from "./i18n";
import { CodePreview } from "./CodePreview";
import { Diagram } from "./Markdown";
import { languageForFile } from "./textFormats";
import { readPreviewText } from "./previewCache";
import { memo, useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import type { Card } from "./storage";
import { Markdown } from "./Markdown";
import { PdfPreview } from "./PdfPreview";
import { isTextFile, isMarkdownFile, isPdfFile } from "./clipboard";
const AttachmentContent = memo(function AttachmentContent({
  card,
  large = false,
  onPdfPageChange,
}: {
  card: Card;
  large?: boolean;
  onPdfPageChange?: (page: number) => void;
}) {
  usePreferences();
  const [asset, setAsset] = useState<{
      url: string;
      blob: Blob;
      mime?: string;
    }>(),
    [decoded, setDecoded] = useState<{ source: Blob; text: string }>();
  const fileText = decoded?.source === card.blob ? decoded?.text || "" : "";
  const url =
    asset && asset.blob === card.blob && asset.mime === card.mime
      ? asset.url
      : "";
  useEffect(() => {
    if (!card.blob || !isTextFile(card)) return;
    let active = true;
    const controller = new AbortController();
    const limit = isMarkdownFile(card)
      ? card.blob.size
      : large
        ? 1024 * 1024
        : 64 * 1024;
    readPreviewText(card.blob, limit, controller.signal)
      .then((text) => {
        if (active) setDecoded({ source: card.blob!, text });
      })
      .catch(() => {
        if (active && !controller.signal.aborted)
          setDecoded({ source: card.blob!, text: "" });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [large, card.blob, card.mime, card.title]);
  useEffect(() => {
    if (
      !card.blob ||
      !(
        card.kind === "image" ||
        (large &&
          (card.mime === "application/pdf" ||
            /^(video|audio)\//.test(card.mime || "")))
      )
    )
      return;
    // The stored Blob type is preserved independently of the declared preview
    // type. Always give the PDF viewer a PDF URL, including mismatched imports.
    const preview =
      card.mime === "application/pdf"
        ? card.blob.slice(0, card.blob.size, "application/pdf")
        : card.blob;
    const u = URL.createObjectURL(preview);
    setAsset({ url: u, blob: card.blob, mime: card.mime });
    return () => URL.revokeObjectURL(u);
  }, [card.blob, card.mime, card.kind, large]);
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
    return languageForFile(card.title) === "mermaid" ? (
      <div className="mermaid-preview">
        <Diagram source={fileText} language="mermaid" standalone />
      </div>
    ) : (
      <CodePreview
        source={fileText}
        language={languageForFile(card.title)}
        className="file-content-thumbnail"
        label={tr("{0} 内容预览", card.title)}
      />
    );
  if (
    large &&
    (/\.(md|markdown|mdown)$/i.test(card.title) ||
      card.mime === "text/markdown")
  )
    return <Markdown>{fileText}</Markdown>;
  if (large && fileText)
    return languageForFile(card.title) === "mermaid" ? (
      <div className="mermaid-preview">
        <Diagram source={fileText} language="mermaid" standalone />
      </div>
    ) : (
      <CodePreview source={fileText} language={languageForFile(card.title)} />
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
});
export function Attachment({
  card,
  large = false,
  onPdfPageChange,
}: {
  card: Card;
  large?: boolean;
  onPdfPageChange?: (page: number) => void;
}) {
  const change = useRef(onPdfPageChange);
  change.current = onPdfPageChange;
  const handler = useRef((page: number) => change.current?.(page)).current;
  const content = (
    <AttachmentContent
      card={card}
      large={large}
      onPdfPageChange={onPdfPageChange ? handler : undefined}
    />
  );
  return large || isPdfFile(card) ? (
    content
  ) : (
    <PreviewBoundary allowTiny={!isMarkdownFile(card)}>
      {content}
    </PreviewBoundary>
  );
}

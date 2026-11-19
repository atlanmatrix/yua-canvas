import { t as tr } from "./i18n";
import { PreviewBoundary } from "./PreviewBoundary";
import { usePreferences } from "./i18n";
import { TextFilePreview } from "./TextFilePreview";
import { readPreviewText } from "./previewCache";
import { memo, useEffect, useRef, useState } from "react";
import { FileText } from "./icons";
import type { Card } from "./storage";
import { XlsxPreview } from "./XlsxPreview";
import { OfficePreview } from "./OfficePreview";
import { isXlsxFile, officeKind } from "./files";
import { PdfPreview } from "./PdfPreview";
import { isTextFile, isMarkdownFile, isPdfFile } from "./clipboard";
const AttachmentContent = memo(function AttachmentContent({
  card,
  large = false,
  onPdfPageChange,
  onPdfAspectChange,
  onSlideChange,
}: {
  card: Card;
  large?: boolean;
  onSlideChange?: (page: number) => void;
  onPdfPageChange?: (page: number) => void;
  onPdfAspectChange?: (width: number, height: number) => void;
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
  const office = card.kind === "file" ? officeKind(card) : undefined;
  if (office)
    return (
      <OfficePreview
        blob={card.blob}
        kind={office}
        slidePage={card.slidePage}
        onSlideChange={onSlideChange}
      />
    );
  if (card.kind === "file" && isXlsxFile(card))
    return <XlsxPreview blob={card.blob} large={large} />;
  if (!large && isPdfFile(card))
    return (
      <PdfPreview
        card={card}
        onPageChange={onPdfPageChange}
        onAspectChange={onPdfAspectChange}
      />
    );
  if (card.kind === "file" && isTextFile(card))
    return (
      <TextFilePreview
        source={fileText}
        name={card.title}
        mime={card.mime}
        thumbnail={!large}
        loading={decoded?.source !== card.blob}
      />
    );
  if (card.kind === "image")
    return (
      <img
        className={large ? "detail-image" : "thumbnail"}
        data-file-preview-state={url || !card.blob ? "ready" : "loading"}
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
  onPdfAspectChange,
  onSlideChange,
}: {
  card: Card;
  large?: boolean;
  onSlideChange?: (page: number) => void;
  onPdfPageChange?: (page: number) => void;
  onPdfAspectChange?: (width: number, height: number) => void;
}) {
  const change = useRef(onPdfPageChange || onSlideChange);
  change.current = onPdfPageChange || onSlideChange;
  const handler = useRef((page: number) => change.current?.(page)).current;
  const content = (
    <AttachmentContent
      card={card}
      large={large}
      onPdfPageChange={onPdfPageChange ? handler : undefined}
      onPdfAspectChange={onPdfAspectChange}
      onSlideChange={
        onSlideChange && officeKind(card) === "pptx" ? handler : undefined
      }
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

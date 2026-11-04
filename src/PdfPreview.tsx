import "./pdf.css";
import { t as tr } from "./i18n";
import { memo, useEffect, useRef, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  FileWarning,
  PanelsLeftBottom,
} from "lucide-react";
import type { Card } from "./storage";
import { pdfResolution, requestPdfPreview } from "./pdfPreviewCache";
import {
  PreviewBoundary,
  usePreviewMoving,
  markPreviewMoving,
} from "./PreviewBoundary";
import { PdfThumbnails } from "./PdfThumbnails";
import type { PdfBitmap } from "./previewDisk";
import { usePreferences } from "./i18n";
function PdfContent({
  blob,
  page,
  onPageChange,
  onAspectChange,
}: {
  blob?: Blob;
  page: number;
  onPageChange?: (page: number) => void;
  onAspectChange?: (width: number, height: number) => void;
}) {
  usePreferences();
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    onChange = useRef(onPageChange);
  onChange.current = onPageChange;
  const aspect = useRef(onAspectChange);
  aspect.current = onAspectChange;
  const [showThumbnails, setShowThumbnails] = useState(false),
    [draft, setDraft] = useState(String(page));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [density, setDensity] = useState({ width: 0, height: 0 });
  const [result, setResult] = useState<{
    source: Blob;
    requested: number;
    bitmap: PdfBitmap;
  }>();
  const [rendered, setRendered] = useState(0),
    [error, setError] = useState(false);
  const busy = usePreviewMoving();
  const pages =
    result && result.source === blob ? result.bitmap.pages : undefined;
  const actual = pages ? Math.min(page, pages) : page;
  useEffect(() => {
    setShowThumbnails(false);
    setRendered(0);
    setResult(undefined);
    setError(false);
  }, [blob]);
  useEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width,
        height = entry.contentRect.height;
      setSize((old) =>
        old.width === width && old.height === height ? old : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // CSS transforms do not trigger ResizeObserver. Track the camera separately,
  // then render once movement settles; memoized cards never need camera props.
  useEffect(() => {
    const camera = host.current!.closest(".world,.share-world,.canvas3d-scene");
    const observer = new MutationObserver(() => markPreviewMoving());
    if (camera)
      observer.observe(camera, {
        attributes: true,
        attributeFilter: ["style"],
      });
    window.addEventListener("resize", markPreviewMoving);
    let media: MediaQueryList;
    const densityChanged = () => {
      media?.removeEventListener("change", densityChanged);
      media = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
      media.addEventListener("change", densityChanged);
      markPreviewMoving();
    };
    media = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    media.addEventListener("change", densityChanged);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", markPreviewMoving);
      media.removeEventListener("change", densityChanged);
    };
  }, []);
  useEffect(() => setDraft(String(actual)), [actual]);
  const jump = () => {
    if (!pages || !onPageChange) return;
    const next = /^\d+$/.test(draft.trim())
      ? Math.max(1, Math.min(pages, Number(draft)))
      : actual;
    setDraft(String(next));
    if (next !== actual) onPageChange(next);
  };
  useEffect(() => {
    if (busy || !size.width || !size.height) return;
    const r = host.current!.getBoundingClientRect(),
      ratio = devicePixelRatio || 1;
    setDensity((old) => {
      const next = {
        width: pdfResolution(r.width * ratio),
        height: pdfResolution(r.height * ratio),
      };
      return old.width === next.width && old.height === next.height
        ? old
        : next;
    });
  }, [busy, size.width, size.height]);
  useEffect(() => {
    if (!blob || !density.width || !density.height || busy) return;
    const controller = new AbortController();
    setError(false);
    void requestPdfPreview(
      blob,
      page,
      density.width,
      density.height,
      controller.signal,
    )
      .then((bitmap) => {
        if (!controller.signal.aborted)
          setResult((old) =>
            old?.source === blob &&
            old.requested === page &&
            old.bitmap === bitmap
              ? old
              : { source: blob, requested: page, bitmap },
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [blob, page, density.width, density.height, busy]);
  useEffect(() => {
    if (!result || result.source !== blob || result.requested !== page) return;
    if (result.bitmap.page !== page) onChange.current?.(result.bitmap.page);
    aspect.current?.(
      result.bitmap.aspectRatio || result.bitmap.width / result.bitmap.height,
      1,
    );
    let active = true;
    const url = URL.createObjectURL(result.bitmap.blob);
    const image = new Image();
    image.src = url;
    void image
      .decode()
      .then(() => {
        if (!active || !canvas.current) return;
        const target = canvas.current;
        target.width = result.bitmap.width;
        target.height = result.bitmap.height;
        target.getContext("2d")!.drawImage(image, 0, 0);
        setRendered(result.bitmap.page);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [result, blob, page]);
  const bitmap = result && result.source === blob ? result.bitmap : undefined;
  const width = bitmap
      ? Math.min(size.width, (size.height * bitmap.width) / bitmap.height)
      : 0,
    height = bitmap ? (width * bitmap.height) / bitmap.width : 0;
  return (
    <div
      className="pdf-preview"
      ref={host}
      data-pdf-page={rendered || undefined}
      aria-busy={!error && rendered !== actual}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={tr("PDF 第 {0} 页", rendered || actual)}
        style={{ visibility: rendered ? "visible" : "hidden", width, height }}
      />
      {error && (
        <FileWarning
          className="pdf-preview-error"
          aria-label={tr("PDF 无法预览，仍可下载原文件")}
        />
      )}
      {pages && (
        <>
          <div
            className="pdf-navigation"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {showThumbnails && blob && (
              <PdfThumbnails
                blob={blob}
                pages={pages}
                current={actual}
                onSelect={onPageChange}
              />
            )}
            <div className="pdf-page-controls">
              <button
                aria-label={tr("显示缩略图")}
                title={tr("显示缩略图")}
                aria-pressed={showThumbnails}
                onClick={() => setShowThumbnails((value) => !value)}
              >
                <PanelsLeftBottom size={17} />
              </button>
              <button
                aria-label={tr("上一页")}
                title={tr("上一页")}
                disabled={!onPageChange || actual <= 1}
                onClick={() => onPageChange?.(actual - 1)}
              >
                <ChevronUp size={18} />
              </button>
              <input
                aria-label={tr("PDF 页码")}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft}
                disabled={!onPageChange}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={jump}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    jump();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft(String(actual));
                  }
                }}
              />
              <span className="pdf-page-count">/ {pages}</span>
              <span className="sr-only" aria-live="polite">
                {tr("第 ")}
                {actual}
                {tr(" 页，共 ")}
                {pages}
                {tr(" 页")}
              </span>
              <button
                aria-label={tr("下一页")}
                title={tr("下一页")}
                disabled={!onPageChange || actual >= pages}
                onClick={() => onPageChange?.(actual + 1)}
              >
                <ChevronDown size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
const MemoPdf = memo(PdfContent);
export function PdfPreview({
  card,
  onPageChange,
  onAspectChange,
}: {
  card: Card;
  onPageChange?: (page: number) => void;
  onAspectChange?: (width: number, height: number) => void;
}) {
  const [localPage, setLocalPage] = useState(card.pdfPage || 1);
  useEffect(() => setLocalPage(card.pdfPage || 1), [card.blob, card.pdfPage]);
  const change = useRef(onPageChange);
  change.current = onPageChange || setLocalPage;
  const handler = useRef((page: number) => change.current?.(page)).current;
  const aspect = useRef(onAspectChange);
  aspect.current = onAspectChange;
  const aspectHandler = useRef((width: number, height: number) =>
    aspect.current?.(width, height),
  ).current;
  return (
    <PreviewBoundary>
      <MemoPdf
        blob={card.blob}
        onAspectChange={onAspectChange ? aspectHandler : undefined}
        page={onPageChange ? card.pdfPage || 1 : localPage}
        onPageChange={handler}
      />
    </PreviewBoundary>
  );
}

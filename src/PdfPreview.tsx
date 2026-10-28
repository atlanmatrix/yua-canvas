import { memo, useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, FileWarning } from "lucide-react";
import type { Card } from "./storage";
import { pdfResolution, requestPdfPreview } from "./pdfPreviewCache";
import { PreviewBoundary, usePreviewMoving } from "./PreviewBoundary";
import type { PdfBitmap } from "./previewDisk";
function PdfContent({
  blob,
  page,
  onPageChange,
}: {
  blob?: Blob;
  page: number;
  onPageChange?: (page: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    onChange = useRef(onPageChange);
  onChange.current = onPageChange;
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
  useEffect(() => {
    if (busy || !size.width || !size.height) return;
    const r = host.current!.getBoundingClientRect(),
      ratio = Math.min(devicePixelRatio || 1, 2);
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
        aria-label={`PDF 第 ${rendered || actual} 页`}
        style={{ visibility: rendered ? "visible" : "hidden", width, height }}
      />
      {error && (
        <FileWarning
          className="pdf-preview-error"
          aria-label="PDF 无法预览，仍可下载原文件"
        />
      )}
      {pages && (
        <div
          className="pdf-page-controls"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            aria-label="上一页"
            title="上一页"
            disabled={!onPageChange || actual <= 1}
            onClick={() => onPageChange?.(actual - 1)}
          >
            <ChevronUp size={18} />
          </button>
          <span className="sr-only" aria-live="polite">
            第 {actual} 页，共 {pages} 页
          </span>
          <button
            aria-label="下一页"
            title="下一页"
            disabled={!onPageChange || actual >= pages}
            onClick={() => onPageChange?.(actual + 1)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
const MemoPdf = memo(PdfContent);
export function PdfPreview({
  card,
  onPageChange,
}: {
  card: Card;
  onPageChange?: (page: number) => void;
}) {
  const change = useRef(onPageChange);
  change.current = onPageChange;
  const handler = useRef((page: number) => change.current?.(page)).current;
  return (
    <PreviewBoundary>
      <MemoPdf
        blob={card.blob}
        page={card.pdfPage || 1}
        onPageChange={onPageChange ? handler : undefined}
      />
    </PreviewBoundary>
  );
}

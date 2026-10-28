import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, FileWarning } from "lucide-react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Card } from "./storage";

export function PdfPreview({
  card,
  onPageChange,
}: {
  card: Card;
  onPageChange?: (page: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const onChange = useRef(onPageChange);
  onChange.current = onPageChange;
  const [loaded, setLoaded] = useState<{ blob: Blob; pdf: PDFDocumentProxy }>();
  const [error, setError] = useState(false);
  const [rendered, setRendered] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const pdf = loaded?.blob === card.blob ? loaded?.pdf : undefined;
  const page = pdf
    ? Math.min(card.pdfPage || 1, pdf.numPages)
    : card.pdfPage || 1;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    setError(false);
    setRendered(0);
    if (!card.blob) return;
    const blob = card.blob;
    void (async () => {
      const [library, bytes] = await Promise.all([
        import("pdfjs-dist"),
        blob.arrayBuffer(),
      ]);
      if (!active) return;
      library.GlobalWorkerOptions.workerSrc = workerUrl;
      const assets = new URL(
        `${import.meta.env.BASE_URL}assets/pdf/`,
        location.href,
      ).href;
      task = library.getDocument({
        data: new Uint8Array(bytes),
        cMapUrl: assets + "cmaps/",
        cMapPacked: true,
        standardFontDataUrl: assets + "standard_fonts/",
        wasmUrl: assets + "wasm/",
        iccUrl: assets + "iccs/",
      });
      const document = await task.promise;
      if (active) setLoaded({ blob, pdf: document });
    })().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
      void task?.destroy().catch(() => {});
    };
  }, [card.blob]);
  useEffect(() => {
    if (pdf && page !== (card.pdfPage || 1)) onChange.current?.(page);
  }, [pdf, page, card.pdfPage]);
  useEffect(() => {
    const target = canvas.current;
    if (!pdf || !target || !size.width || !size.height) return;
    let active = true;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    setRendered(0);
    void pdf
      .getPage(page)
      .then(async (documentPage) => {
        if (!active) return;
        const natural = documentPage.getViewport({ scale: 1 });
        const scale = Math.min(
          size.width / natural.width,
          size.height / natural.height,
        );
        const viewport = documentPage.getViewport({ scale });
        const ratio = Math.min(devicePixelRatio || 1, 2);
        target.width = Math.ceil(viewport.width * ratio);
        target.height = Math.ceil(viewport.height * ratio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        render = documentPage.render({
          canvas: target,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await render.promise;
        if (active) {
          setRendered(page);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, page, size.width, size.height]);
  return (
    <div
      className="pdf-preview"
      ref={host}
      data-pdf-page={rendered || undefined}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={`PDF 第 ${page} 页`}
        style={{ visibility: rendered === page ? "visible" : "hidden" }}
      />
      {error && (
        <FileWarning
          className="pdf-preview-error"
          aria-label="PDF 无法预览，仍可下载原文件"
        />
      )}
      {pdf && (
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
            disabled={!onPageChange || page <= 1}
            onClick={() => onPageChange?.(page - 1)}
          >
            <ChevronUp size={18} />
          </button>
          <span className="sr-only" aria-live="polite">
            第 {page} 页，共 {pdf.numPages} 页
          </span>
          <button
            aria-label="下一页"
            title="下一页"
            disabled={!onPageChange || page >= pdf.numPages}
            onClick={() => onPageChange?.(page + 1)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

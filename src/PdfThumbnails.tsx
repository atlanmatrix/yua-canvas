import { useEffect, useRef, useState } from "react";
import { requestPdfPreview } from "./pdfPreviewCache";
import { t as tr } from "./i18n";

function Thumbnail({ blob, page }: { blob: Blob; page: number }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let url = "";
    void requestPdfPreview(blob, page, 144, 192, controller.signal)
      .then((bitmap) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(bitmap.blob);
        setSource(url);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob, page]);
  return source ? (
    <img src={source} alt="" />
  ) : (
    <span className="pdf-thumbnail-placeholder" aria-hidden="true" />
  );
}
const ROW = 112;
export function PdfThumbnails({
  blob,
  pages,
  current,
  onSelect,
}: {
  blob: Blob;
  pages: number;
  current: number;
  onSelect?: (page: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({
    first: Math.max(0, current - 3),
    count: 8,
  });
  const measure = () => {
    const el = host.current!;
    setRange({
      first: Math.max(0, Math.floor(el.scrollTop / ROW) - 2),
      count: Math.ceil(el.clientHeight / ROW) + 4,
    });
  };
  useEffect(() => {
    const el = host.current!;
    el.scrollTop = Math.max(
      0,
      (current - 1) * ROW - el.clientHeight / 2 + ROW / 2,
    );
    measure();
  }, [current]);
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  const visible = Array.from(
    { length: Math.max(0, Math.min(range.count, pages - range.first)) },
    (_, i) => range.first + i + 1,
  );
  return (
    <div
      className="pdf-thumbnails"
      ref={host}
      onScroll={measure}
      aria-label={tr("PDF 缩略图")}
    >
      <div style={{ height: pages * ROW, position: "relative" }}>
        {visible.map((page) => (
          <button
            key={page}
            className="pdf-thumbnail"
            style={{ top: (page - 1) * ROW }}
            aria-label={tr("跳转到第 {0} 页", page)}
            aria-current={page === current ? "page" : undefined}
            disabled={!onSelect}
            onClick={() => onSelect?.(page)}
          >
            <Thumbnail blob={blob} page={page} />
            <span>{page}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

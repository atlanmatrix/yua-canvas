import { useEffect, useRef, useState } from "react";
import type { OfficeKind } from "./files";
import type { OfficeDocument } from "./officeDocument";
import { t } from "./i18n";
import { ChevronLeft, ChevronRight } from "./icons";
import "./office.css";

function Picture({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return <img src={url || undefined} alt={t("文档插图")} draggable={false} />;
}
export function OfficePreview({
  blob,
  kind,
  onSave,
  onDownload,
  slidePage = 1,
  onSlideChange,
}: {
  blob?: Blob;
  kind: OfficeKind;
  slidePage?: number;
  onSlideChange?: (page: number) => void;
  onSave?: (updated: Blob, source: Blob) => void;
  onDownload?: () => void;
}) {
  const [loaded, setLoaded] = useState<{
    source: Blob;
    kind: OfficeKind;
    model?: OfficeDocument;
  }>();
  const [localPage, setLocalPage] = useState(slidePage);
  const page = (onSlideChange ? slidePage : localPage) - 1;
  const setPage = (index: number) => (onSlideChange || setLocalPage)(index + 1);
  const [edits, setEdits] = useState<Map<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setEdits(null);
    setError("");
    if (blob)
      import("./officeDocument")
        .then(({ loadOffice }) => loadOffice(blob, kind))
        .then(
          (model) => {
            if (active) setLoaded({ source: blob, kind, model });
          },
          () => {
            if (active) setLoaded({ source: blob, kind });
          },
        );
    return () => {
      active = false;
    };
  }, [blob, kind]);
  const ready = !!loaded && loaded.source === blob && loaded.kind === kind;
  const model = ready ? loaded.model : undefined;
  const total = model?.pages.length || 0;
  const index = Math.max(0, Math.min(page, total - 1));
  const content = model?.pages[index];
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [index]);
  async function save() {
    if (!model || !blob || !edits?.size || !onSave || busy) return;
    setBusy(true);
    setError("");
    try {
      const { saveOffice } = await import("./officeDocument");
      onSave(await saveOffice(model, edits), blob);
      setEdits(null);
    } catch (err) {
      setError(
        t(
          err instanceof Error && err.message === "文件已更改，请重新打开"
            ? err.message
            : "保存失败",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const blocks = content?.paragraphs.map((paragraph, i) => (
    <div
      key={content.path + ":" + i}
      className={
        paragraph.title ? "office-paragraph office-title" : "office-paragraph"
      }
    >
      {paragraph.spans.map((span, j) => {
        if (span.type === "image") return <Picture key={j} blob={span.blob} />;
        if (span.type === "break") return <br key={j} />;
        if (span.type !== "text") return <span key={j}>{"\t"}</span>;
        return edits ? (
          <textarea
            rows={1}
            key={span.key}
            aria-label={t("段落 {0}，文本 {1}", i + 1, j + 1)}
            disabled={busy}
            value={edits.get(span.key) ?? span.value}
            onChange={(e) => {
              const value = e.target.value;
              setEdits((previous) => {
                const next = new Map(previous);
                if (value === span.value) next.delete(span.key);
                else next.set(span.key, value);
                return next;
              });
            }}
          />
        ) : (
          <span key={span.key}>{span.value}</span>
        );
      })}
    </div>
  ));
  const textLabel = kind === "docx" ? "Word 正文" : "幻灯片内容";
  return (
    <div
      className="office-file"
      data-file-preview-state={blob && !ready ? "loading" : "ready"}
    >
      {model ? (
        <>
          <div
            className="office-scroll"
            ref={scroller}
            tabIndex={0}
            aria-label={t(textLabel)}
          >
            {content?.paragraphs.length ? (
              !edits && content.layout ? (
                <div
                  className="office-slide"
                  style={{ aspectRatio: content.layout.ratio }}
                >
                  {content.layout.shapes.map((shape) => (
                    <div
                      className="office-shape"
                      key={shape.start}
                      style={{
                        left: shape.x + "%",
                        top: shape.y + "%",
                        width: shape.width + "%",
                        height: shape.height + "%",
                      }}
                    >
                      {blocks?.slice(shape.start, shape.end)}
                    </div>
                  ))}
                </div>
              ) : (
                blocks
              )
            ) : (
              <p>{t("此页没有可预览的文字或图片")}</p>
            )}
          </div>
          {kind === "pptx" && total > 0 && (
            <div
              className="office-pager"
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <button
                aria-label={t("上一页")}
                disabled={index === 0}
                onClick={() => setPage(index - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <span aria-live="polite">
                {index + 1} / {total}
              </span>
              <button
                aria-label={t("下一页")}
                disabled={index + 1 >= total}
                onClick={() => setPage(index + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="office-status">
          {t(blob && !ready ? "正在读取文档…" : "无法预览此文件")}
        </div>
      )}
      {error && <div role="alert">{error}</div>}
      {onDownload && (
        <div className="modal-bottom">
          {edits ? (
            <>
              <button
                disabled={busy}
                onClick={() => {
                  setEdits(null);
                  setError("");
                }}
              >
                {t("取消")}
              </button>
              <button
                className="primary"
                disabled={busy || !edits.size}
                onClick={save}
              >
                {t("保存文件")}
              </button>
            </>
          ) : (
            <>
              {onSave &&
                model &&
                model.pages.some((p) =>
                  p.paragraphs.some((block) =>
                    block.spans.some((span) => span.type === "text"),
                  ),
                ) && (
                  <button onClick={() => setEdits(new Map())}>
                    {t("编辑文字")}
                  </button>
                )}
              <button onClick={onDownload}>{t("下载文件")}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SheetData } from "read-excel-file/browser";
import { t } from "./i18n";
import { columnName, writeCells, type CellEdit } from "./xlsxEdit";
import "./xlsx.css";

const previews = new WeakMap<Blob, Promise<SheetData>>();
function load(blob: Blob) {
  const cached = previews.get(blob);
  if (cached) return cached;
  const pending = import("read-excel-file/browser").then(({ readSheet }) =>
    readSheet(blob, 1, { trim: false }),
  );
  previews.set(blob, pending);
  return pending;
}
function display(value: unknown) {
  return value instanceof Date
    ? value.toISOString().replace(/T00:00:00\.000Z$/, "")
    : String(value ?? "");
}

export function XlsxPreview({
  blob,
  large = false,
  onSave,
  onDownload,
}: {
  blob?: Blob;
  large?: boolean;
  onSave?: (updated: Blob, source: Blob) => void;
  onDownload?: () => void;
}) {
  const [loaded, setLoaded] = useState<{ blob: Blob; rows?: SheetData }>();
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Map<string, CellEdit>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (blob)
      load(blob).then(
        (rows) => {
          if (active) setLoaded({ blob, rows });
        },
        () => {
          if (active) setLoaded({ blob });
        },
      );
    setEditing(false);
    setEdits(new Map());
    setError("");
    return () => {
      active = false;
    };
  }, [blob]);
  const rows = loaded?.blob === blob ? loaded?.rows : undefined;
  async function save() {
    if (!blob || !onSave || saving) return;
    setSaving(true);
    try {
      onSave(await writeCells(blob, [...edits.values()]), blob);
      setEditing(false);
    } catch (err) {
      setError(
        t(
          err instanceof Error && /[\u3400-\u9fff]/.test(err.message)
            ? err.message
            : "保存失败",
        ),
      );
    } finally {
      setSaving(false);
    }
  }
  const writable = !!onSave && !!rows;
  return (
    <>
      {rows && (rows.length || editing) ? (
        <SheetGrid
          rows={rows}
          large={large}
          editing={editing}
          edits={edits}
          disabled={saving}
          onEdit={(address, edit) =>
            setEdits((previous) => {
              const next = new Map(previous);
              if (edit.value === display(edit.original)) next.delete(address);
              else next.set(address, edit);
              return next;
            })
          }
        />
      ) : (
        <div
          className="xlsx-status"
          data-file-preview-state={
            blob && loaded?.blob !== blob ? "loading" : "ready"
          }
        >
          {t(
            blob && loaded?.blob !== blob
              ? "正在读取工作表…"
              : rows
                ? "首个工作表为空"
                : "无法预览此工作簿",
          )}
        </div>
      )}
      {error && <div role="alert">{error}</div>}
      {onDownload && (
        <div className="modal-bottom">
          {editing ? (
            <>
              <button
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setEdits(new Map());
                  setError("");
                }}
              >
                {t("取消")}
              </button>
              <button
                className="primary"
                disabled={saving || !edits.size}
                onClick={save}
              >
                {t("保存表格")}
              </button>
            </>
          ) : (
            <>
              {writable && (
                <button onClick={() => setEditing(true)}>
                  {t("编辑表格")}
                </button>
              )}
              <button onClick={onDownload}>{t("下载工作簿")}</button>
            </>
          )}
        </div>
      )}
    </>
  );
}

const cellWidth = 112;
const cellHeight = 30;
function SheetGrid({
  rows,
  large,
  editing,
  edits,
  onEdit,
  disabled,
}: {
  rows: SheetData;
  large: boolean;
  editing: boolean;
  edits: Map<string, CellEdit>;
  onEdit: (address: string, edit: CellEdit) => void;
  disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({
    left: 0,
    top: 0,
    width: 600,
    height: 400,
  });
  const drag = useRef<
    | {
        id: number;
        x: number;
        y: number;
        left: number;
        top: number;
        scale: number;
      }
    | undefined
  >(undefined);
  function measure() {
    const el = host.current;
    if (el)
      setView({
        left: el.scrollLeft,
        top: el.scrollTop,
        width: el.clientWidth,
        height: el.clientHeight,
      });
  }
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(host.current!);
    measure();
    return () => observer.disconnect();
  }, []);
  let usedRows = rows.length;
  let usedColumns = rows[0]?.length ?? 0;
  for (const edit of edits.values()) {
    usedRows = Math.max(usedRows, edit.row + 1);
    usedColumns = Math.max(usedColumns, edit.column + 1);
  }
  const height = Math.min(1048576, usedRows + Number(editing));
  const width = Math.min(16384, usedColumns + Number(editing));
  const startRow = Math.max(0, Math.floor(view.top / cellHeight) - 1);
  const startCol = Math.max(0, Math.floor(view.left / cellWidth) - 1);
  const endRow = Math.min(
    height,
    Math.ceil((view.top + view.height) / cellHeight) + 1,
  );
  const endCol = Math.min(
    width,
    Math.ceil((view.left + view.width) / cellWidth) + 1,
  );
  return (
    <div
      className={"xlsx-preview" + (large ? " expanded" : "")}
      ref={host}
      onScroll={measure}
      aria-label={t("首个工作表")}
      tabIndex={0}
      data-file-preview-state="ready"
      onPointerDown={(e) => {
        if (
          large ||
          e.pointerType !== "mouse" ||
          e.button !== 0 ||
          e.ctrlKey ||
          e.metaKey
        )
          return;
        const el = e.currentTarget;
        if (
          el.scrollWidth <= el.clientWidth + 1 &&
          el.scrollHeight <= el.clientHeight + 1
        )
          return;
        e.stopPropagation();
        if (e.target === el) return;
        drag.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          left: el.scrollLeft,
          top: el.scrollTop,
          scale: el.getBoundingClientRect().width / el.offsetWidth || 1,
        };
        try {
          el.setPointerCapture(e.pointerId);
        } catch {}
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d?.id !== e.pointerId) return;
        e.currentTarget.scrollTo(
          d.left - (e.clientX - d.x) / d.scale,
          d.top - (e.clientY - d.y) / d.scale,
        );
      }}
      onPointerUp={(e) => {
        if (drag.current?.id === e.pointerId) drag.current = undefined;
      }}
      onPointerCancel={(e) => {
        if (drag.current?.id === e.pointerId) drag.current = undefined;
      }}
      onLostPointerCapture={() => {
        drag.current = undefined;
      }}
    >
      <div
        style={{
          position: "relative",
          width: width * cellWidth,
          height: height * cellHeight,
        }}
      >
        <table
          aria-label={t("首个工作表")}
          style={{
            left: startCol * cellWidth,
            top: startRow * cellHeight,
            width: (endCol - startCol) * cellWidth,
          }}
        >
          <tbody>
            {Array.from({ length: endRow - startRow }, (_, i) => {
              const row = startRow + i;
              return (
                <tr key={row}>
                  {Array.from({ length: endCol - startCol }, (_, j) => {
                    const column = startCol + j;
                    const address = columnName(column) + (row + 1);
                    const original = rows[row]?.[column];
                    const value =
                      edits.get(address)?.value ?? display(original);
                    return (
                      <td key={column} title={address + " · " + value}>
                        {editing ? (
                          <input
                            aria-label={address}
                            value={value}
                            disabled={disabled}
                            maxLength={32767}
                            onChange={(e) =>
                              onEdit(address, {
                                row,
                                column,
                                original,
                                value: e.target.value,
                              })
                            }
                          />
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

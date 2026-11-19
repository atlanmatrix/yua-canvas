import { useEffect, useState } from "react";
import { t } from "./i18n";
import "./xlsx.css";

const maxRows = 200;
const maxColumns = 32;

async function readPreview(blob: Blob) {
  const { readSheet } = await import("read-excel-file/browser");
  const data = await readSheet(blob, 1, { trim: false });
  const width = data[0]?.length ?? 0;
  return {
    clipped: data.length > maxRows || width > maxColumns,
    rows: data
      .slice(0, maxRows)
      .map((row) =>
        row
          .slice(0, maxColumns)
          .map((value) =>
            value instanceof Date
              ? value.toISOString().replace(/T00:00:00\.000Z$/, "")
              : String(value ?? ""),
          ),
      ),
  };
}

const previews = new WeakMap<Blob, ReturnType<typeof readPreview>>();

export function XlsxPreview({
  blob,
  large = false,
}: {
  blob?: Blob;
  large?: boolean;
}) {
  const [result, setResult] = useState<{
    source: Blob;
    preview?: Awaited<ReturnType<typeof readPreview>>;
  }>();
  useEffect(() => {
    if (!blob) return;
    let active = true;
    const pending = previews.get(blob) ?? readPreview(blob);
    previews.set(blob, pending);
    pending.then(
      (preview) => {
        if (active) setResult({ source: blob, preview });
      },
      () => {
        if (active) setResult({ source: blob });
      },
    );
    return () => {
      active = false;
    };
  }, [blob]);

  if (blob && result?.source !== blob)
    return (
      <div className="xlsx-status" data-file-preview-state="loading">
        {t("正在读取工作表…")}
      </div>
    );
  const preview = blob && result?.preview;
  if (!preview?.rows.length)
    return (
      <div className="xlsx-status" data-file-preview-state="ready">
        {t(preview ? "首个工作表为空" : "无法预览此工作簿")}
      </div>
    );

  const rows = large ? preview.rows : preview.rows.slice(0, 8);
  return (
    <div
      className={large ? "xlsx-preview expanded" : "xlsx-preview"}
      data-file-preview-state="ready"
    >
      <table>
        <caption>
          {large && preview.clipped
            ? t("首个工作表（预览前 {0} 行、{1} 列）", maxRows, maxColumns)
            : t("首个工作表")}
        </caption>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {(large ? row : row.slice(0, 6)).map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

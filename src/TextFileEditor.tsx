import { useEffect, useState, type ReactNode } from "react";
import { Download, Pencil, Eye, Save } from "lucide-react";
import type { Card } from "./storage";
import { Markdown } from "./Markdown";
export type TextFormat = {
  encoding: "utf-8" | "utf-16le" | "utf-16be";
  bom: boolean;
  newline: "\n" | "\r\n" | "\r";
};
export async function decodeTextFile(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const encoding =
    bytes[0] === 255 && bytes[1] === 254
      ? "utf-16le"
      : bytes[0] === 254 && bytes[1] === 255
        ? "utf-16be"
        : "utf-8";
  const bom =
    encoding !== "utf-8" ||
    (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191);
  const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  const newline = (text.match(/\r\n|\r|\n/)?.[0] ||
    "\n") as TextFormat["newline"];
  return {
    text: text.replace(/\r\n?/g, "\n"),
    format: { encoding, bom, newline } as TextFormat,
  };
}
export function encodeTextFile(
  text: string,
  format: TextFormat,
  mime: string,
): Blob {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replaceAll("\n", format.newline);
  if (format.encoding === "utf-8")
    return new Blob(
      [
        ...(format.bom ? [new Uint8Array([239, 187, 191])] : []),
        new TextEncoder().encode(normalized),
      ],
      { type: mime },
    );
  const bytes = new Uint8Array(normalized.length * 2 + (format.bom ? 2 : 0));
  const little = format.encoding === "utf-16le";
  if (format.bom) bytes.set(little ? [255, 254] : [254, 255]);
  const data = new DataView(bytes.buffer);
  for (let i = 0; i < normalized.length; i++)
    data.setUint16(
      i * 2 + (format.bom ? 2 : 0),
      normalized.charCodeAt(i),
      little,
    );
  return new Blob([bytes], { type: mime });
}
export function TextFileEditor({
  card,
  preview,
  onSave,
  onDownload,
}: {
  card: Card;
  preview: ReactNode;
  onSave: (blob: Blob) => void;
  onDownload: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(""),
    [original, setOriginal] = useState(""),
    [format, setFormat] = useState<TextFormat>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setFormat(undefined);
    setError("");
    decodeTextFile(card.blob!)
      .then((result) => {
        if (active) {
          setText(result.text);
          setOriginal(result.text);
          setFormat(result.format);
        }
      })
      .catch(() => {
        if (active) setError("无法解码此文件，原文件仍可下载");
      });
    return () => {
      active = false;
    };
  }, [card.blob]);
  const save = () => {
    if (!format || text === original) return;
    onSave(
      encodeTextFile(
        text,
        format,
        card.blob?.type || card.mime || "text/plain",
      ),
    );
    setOriginal(text);
  };
  return (
    <>
      <div className="file-edit-controls">
        <button
          className={!editing ? "active" : ""}
          aria-label="预览文件"
          aria-pressed={!editing}
          onClick={() => setEditing(false)}
        >
          <Eye size={15} />
          预览
        </button>
        <button
          className={editing ? "active" : ""}
          aria-label="编辑文件"
          aria-pressed={editing}
          disabled={!format}
          onClick={() => setEditing(true)}
        >
          <Pencil size={15} />
          编辑
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="detail-content">
        {editing ? (
          <textarea
            className="file-content-editor"
            aria-label="文件内容"
            value={text}
            autoFocus
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (
                (e.ctrlKey || e.metaKey) &&
                e.key === "Enter" &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                e.stopPropagation();
                save();
              }
            }}
          />
        ) : text !== original ? (
          /\.(md|markdown|mdown)$/i.test(card.title) ||
          card.mime === "text/markdown" ? (
            <Markdown>{text}</Markdown>
          ) : (
            <pre className="file-text">{text}</pre>
          )
        ) : (
          preview
        )}
      </div>
      <div className="modal-bottom file-edit-footer">
        <small>{card.mime || "文件"}</small>
        <div>
          <button className="button" onClick={onDownload}>
            <Download size={15} />
            下载原文件
          </button>
          <button
            className="primary"
            disabled={!format || text === original}
            onClick={save}
          >
            <Save size={15} />
            保存文件
          </button>
        </div>
      </div>
    </>
  );
}

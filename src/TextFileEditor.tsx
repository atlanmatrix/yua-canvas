import { t as tr } from "./i18n";
import { useEffect, useState, type ReactNode } from "react";
import { Download, Pencil, Eye, Save } from "lucide-react";
import type { Card } from "./storage";
import { Markdown } from "./Markdown";
import { fileMime } from "./files";
import { CodePreview } from "./CodePreview";
import { languageForFile } from "./textFormats";
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
  onSave: (blob: Blob, name?: string) => void;
  onDownload: () => void;
}) {
  const [editing, setEditing] = useState(!!card.editableFile),
    [name, setName] = useState(card.title),
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
    if (!format || !name.trim() || (text === original && name === card.title))
      return;
    onSave(
      encodeTextFile(
        text,
        format,
        card.editableFile
          ? fileMime(name.trim())
          : card.blob?.type || card.mime || "text/plain",
      ),
      name.trim(),
    );
    setOriginal(text);
  };
  return (
    <>
      <div className="file-edit-controls">
        {card.editableFile && (
          <input
            aria-label={tr("文件名")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <button
          className={!editing ? "active" : ""}
          aria-label={tr("预览文件")}
          aria-pressed={!editing}
          onClick={() => setEditing(false)}
        >
          <Eye size={15} />
          {tr("预览")}
        </button>
        <button
          className={editing ? "active" : ""}
          aria-label={tr("编辑文件")}
          aria-pressed={editing}
          disabled={!format}
          onClick={() => setEditing(true)}
        >
          <Pencil size={15} />
          {tr("编辑")}
        </button>
      </div>
      {error && <p role="alert">{tr(error)}</p>}
      <div className="detail-content">
        {editing ? (
          <textarea
            className="file-content-editor"
            aria-label={tr("文件内容")}
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
            <CodePreview source={text} language={languageForFile(name)} />
          )
        ) : (
          preview
        )}
      </div>
      <div className="modal-bottom file-edit-footer">
        <small>{card.mime || tr("文件")}</small>
        <div>
          <button className="button" onClick={onDownload}>
            <Download size={15} />
            {tr("下载原文件")}
          </button>
          <button
            className="primary"
            disabled={
              !format ||
              !name.trim() ||
              (text === original && name === card.title)
            }
            onClick={save}
          >
            <Save size={15} />
            {tr("保存文件")}
          </button>
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { Box, Pencil, X } from "lucide-react";
import type { Card } from "./storage";
import { MINIATURE_EXAMPLE, miniatureUrl } from "./miniatureScene";
import {
  useMiniatureCapture,
  type MiniatureSnapshot,
} from "./miniatureCapture";

export function Miniature({
  card,
  onEdit,
  onSnapshot,
}: {
  card: Card;
  onEdit?: () => void;
  onSnapshot?: (snapshot: MiniatureSnapshot) => void;
}) {
  const src = miniatureUrl(card.text);
  const capture = useMiniatureCapture(card, onSnapshot);
  const [cover, setCover] = useState("");
  useEffect(() => {
    if (!capture.snapshot.cover) {
      setCover("");
      return;
    }
    const url = URL.createObjectURL(capture.snapshot.cover);
    setCover(url);
    return () => URL.revokeObjectURL(url);
  }, [capture.snapshot.cover]);
  const { interactive, frame } = capture;
  return (
    <div className="miniature" ref={capture.container}>
      <div className="miniature-heading">
        <Box size={16} />
        <span title={card.title}>{card.title || "Miniature"}</span>
        {onEdit && (
          <button aria-label="编辑 miniature" title="编辑场景" onClick={onEdit}>
            <Pencil size={15} />
          </button>
        )}
        <button
          aria-label={interactive ? "结束场景交互" : "交互 3D 场景"}
          aria-pressed={interactive}
          disabled={!src}
          onClick={capture.toggle}
        >
          {interactive ? "结束交互" : "交互"}
        </button>
      </div>
      {src &&
        !interactive &&
        (cover ? (
          <img
            className="miniature-cover"
            src={cover}
            alt={card.title || "3D 场景封面"}
            draggable={false}
          />
        ) : (
          <div className="miniature-placeholder">
            <Box size={38} />
            <span>{capture.failed ? "暂无静态预览" : "正在生成预览…"}</span>
          </div>
        ))}
      {src && frame ? (
        <iframe
          key={frame.id}
          ref={capture.iframe}
          className={
            "miniature-frame" + (!interactive ? " miniature-capture-frame" : "")
          }
          title={card.title || "3D 场景"}
          src={frame.url}
          width="100%"
          height="480"
          loading="eager"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          allow="fullscreen"
          allowFullScreen
          tabIndex={interactive ? 0 : -1}
          aria-hidden={!interactive}
          inert={!interactive}
          onLoad={capture.loaded}
        />
      ) : !src ? (
        <p role="alert">场景地址无效</p>
      ) : null}
    </div>
  );
}

export function MiniatureDialog({
  card,
  onSave,
  onClose,
}: {
  card: Card;
  onSave: (title: string, src: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [value, setValue] = useState(card.text);
  const [error, setError] = useState("");
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="modal miniature-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={card.id ? "编辑 miniature" : "添加 miniature"}
        onSubmit={(e) => {
          e.preventDefault();
          // Read attributes only; pasted HTML is never inserted into the page.
          const frame = value.trim().startsWith("<")
            ? new DOMParser()
                .parseFromString(value, "text/html")
                .querySelector("iframe")
            : null;
          const src = miniatureUrl(
            frame ? frame.getAttribute("src") || "" : value,
          );
          if (!src) {
            setError(
              "请输入有效的 HTTP / HTTPS 场景地址，或包含该地址的 iframe 代码",
            );
            return;
          }
          onSave(
            title.trim() || frame?.getAttribute("title")?.trim() || "Miniature",
            src,
          );
        }}
      >
        <div className="modal-heading">
          <span>
            <Box size={18} />
            {card.id ? "编辑 miniature" : "添加 miniature"}
          </span>
          <button type="button" aria-label="关闭 miniature" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          场景名称
          <input
            aria-label="场景名称"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          场景 URL 或 iframe 代码
          <textarea
            autoFocus
            aria-label="场景 URL 或 iframe 代码"
            value={value}
            rows={5}
            placeholder="https://… 或 <iframe src=…></iframe>"
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="modal-bottom">
          <button
            className="button"
            type="button"
            onClick={() => {
              setValue(MINIATURE_EXAMPLE.src);
              setTitle(MINIATURE_EXAMPLE.title);
              setError("");
            }}
          >
            使用示例场景
          </button>
          <button className="primary" type="submit">
            保存场景
          </button>
        </div>
      </form>
    </div>
  );
}

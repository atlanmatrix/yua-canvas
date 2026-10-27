import { useEffect, useRef, useState } from "react";
import { Box, X } from "lucide-react";
import type { Card } from "./storage";
import { MINIATURE_EXAMPLE, miniatureUrl } from "./miniatureScene";
import {
  useMiniatureCapture,
  type MiniatureSnapshot,
} from "./miniatureCapture";

export function Miniature({
  card,
  active,
  onActiveChange,
  onSelect,
  onLabelChange,
  onSnapshot,
}: {
  card: Card;
  active?: boolean;
  onActiveChange?: (active: boolean) => void;
  onSelect?: () => void;
  onLabelChange?: (field: "title" | "text", value: string) => void;
  onSnapshot?: (snapshot: MiniatureSnapshot) => void;
}) {
  const src = miniatureUrl(card.text);
  const capture = useMiniatureCapture(card, onSnapshot);
  const [localActive, setLocalActive] = useState(false);
  const activated = active ?? localActive;
  const setActive = onActiveChange ?? setLocalActive;
  const [editing, setEditing] = useState<"title" | "text">();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const finished = useRef(false);
  useEffect(() => {
    if (activated) capture.activate();
    else capture.deactivate();
  }, [activated, src, card.blob, card.miniatureView]);
  useEffect(() => {
    if (!activated) return;
    const outside = (e: PointerEvent) => {
      if (!capture.container.current?.contains(e.target as Node))
        setActive(false);
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [activated, setActive]);
  const edit = (field: "title" | "text") => {
    if (!onLabelChange) return;
    setActive(false);
    onSelect?.();
    finished.current = false;
    setValue(card[field]);
    setError("");
    setEditing(field);
  };
  const save = () => {
    if (!editing || finished.current) return;
    const next =
      editing === "text" ? miniatureUrl(value) : value.trim() || "Miniature";
    if (!next) {
      setError("请输入有效的 HTTP / HTTPS 场景地址");
      return;
    }
    finished.current = true;
    setEditing(undefined);
    if (next !== card[editing]) onLabelChange?.(editing, next);
  };
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
    <div
      className="miniature"
      data-active={interactive}
      data-editing={!!editing}
    >
      <div
        className="miniature-model"
        ref={capture.container}
        role="group"
        aria-label={`3D 场景 ${card.title || "Miniature"}`}
        tabIndex={0}
        title="双击激活，点击模型区域外结束交互"
        onPointerDown={(e) => {
          if (!onSelect) e.stopPropagation();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!e.ctrlKey && !e.metaKey && src) {
            onSelect?.();
            setActive(true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && src) {
            e.preventDefault();
            e.stopPropagation();
            onSelect?.();
            setActive(true);
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            setActive(false);
          }
        }}
      >
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
              "miniature-frame" +
              (!interactive ? " miniature-capture-frame" : "")
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
      <div
        className="miniature-labels"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {(["title", "text"] as const).map((field) =>
          editing === field ? (
            <div key={field} className="miniature-label-field">
              <input
                className="connection-label-editor miniature-label-editor"
                aria-label={field === "title" ? "场景名称" : "场景链接"}
                aria-invalid={!!error}
                value={value}
                maxLength={field === "title" ? 200 : 20000}
                autoFocus
                onFocus={(e) => e.target.select()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError("");
                }}
                onBlur={save}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    save();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    finished.current = true;
                    setEditing(undefined);
                    setError("");
                  }
                }}
              />
              {error && <span role="alert">{error}</span>}
            </div>
          ) : (
            <div
              key={field}
              className={`connection-label miniature-label miniature-${field === "title" ? "name" : "url"}`}
              onPointerDown={(e) => {
                if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
              }}
              onClick={() => onSelect?.()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!e.ctrlKey && !e.metaKey) edit(field);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target === e.currentTarget) {
                  e.preventDefault();
                  e.stopPropagation();
                  edit(field);
                }
              }}
              tabIndex={onLabelChange ? 0 : undefined}
              title={card[field] + (onLabelChange ? "（双击修改）" : "")}
            >
              {field === "text" && src ? (
                <a
                  className="note-link miniature-link"
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  draggable={false}
                  onClick={(e) => {
                    if (
                      e.detail &&
                      (onLabelChange || (!e.ctrlKey && !e.metaKey))
                    )
                      e.preventDefault();
                  }}
                  onAuxClick={(e) => e.preventDefault()}
                >
                  {card.text}
                </a>
              ) : field === "title" ? (
                card.title || "Miniature"
              ) : (
                card.text
              )}
            </div>
          ),
        )}
      </div>
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

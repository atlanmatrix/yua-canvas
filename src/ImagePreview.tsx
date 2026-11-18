import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  Info,
  X,
} from "./icons";
import { t as tr } from "./i18n";
import type { Board, Card } from "./storage";
import "./image-preview.css";

export function canvasImages(board: Board) {
  return board.cards.filter((card) => {
    if (card.kind !== "image" || card.masked || card.locked) return false;
    const visited = new Set<string>();
    let group = card.group;
    while (group && !visited.has(group)) {
      visited.add(group);
      const parent = board.groups.find((item) => item.id === group);
      if (parent?.masked) return false;
      group = parent?.parent;
    }
    return true;
  });
}

function PreviewImage({
  card,
  thumbnail = false,
  onDimensions,
}: {
  card: Card;
  thumbnail?: boolean;
  onDimensions?: (width: number, height: number) => void;
}) {
  const [asset, setAsset] = useState<{ blob: Blob; url: string }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!card.blob) return;
    const url = URL.createObjectURL(card.blob);
    setAsset({ blob: card.blob, url });
    return () => URL.revokeObjectURL(url);
  }, [card.blob]);
  const url = asset?.blob === card.blob ? asset?.url : undefined;
  return failed || !card.blob ? (
    <FileWarning size={thumbnail ? 22 : 40} aria-label={tr("图片无法加载")} />
  ) : (
    <img
      src={url}
      alt=""
      aria-label={thumbnail ? undefined : card.title}
      loading={thumbnail ? "lazy" : "eager"}
      decoding="async"
      draggable={false}
      onLoad={(event) => {
        const image = event.currentTarget;
        onDimensions?.(image.naturalWidth, image.naturalHeight);
      }}
      onError={() => setFailed(true)}
    />
  );
}

export function ImagePreview({
  images,
  current,
  onChange,
  onClose,
  onDownload,
}: {
  images: Card[];
  current: Card;
  onChange: (id: string) => void;
  onClose: () => void;
  onDownload: (card: Card) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const thumbnails = useRef<HTMLElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [dimensions, setDimensions] = useState<{
    blob?: Blob;
    width: number;
    height: number;
  }>();
  const index = images.findIndex((card) => card.id === current.id);
  const change = (offset: number) => {
    if (images.length > 1)
      onChange(images[(index + offset + images.length) % images.length].id);
  };
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  useEffect(() => {
    thumbnails.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current.id]);
  return (
    <dialog
      ref={dialog}
      className="image-preview"
      role="dialog"
      aria-label={tr("图片预览")}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Tab") {
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            );
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          change(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <div className="image-preview-actions">
        <button
          aria-label={tr("图片信息")}
          aria-expanded={showInfo}
          aria-controls="image-preview-info"
          onClick={() => setShowInfo((value) => !value)}
        >
          <Info size={20} />
        </button>
        <button
          aria-label={tr("下载原文件")}
          onClick={() => onDownload(current)}
        >
          <Download size={20} />
        </button>
        <button autoFocus aria-label={tr("关闭预览")} onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      <div
        className="image-preview-stage"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <PreviewImage
          key={current.id}
          card={current}
          onDimensions={(width, height) =>
            setDimensions({ blob: current.blob, width, height })
          }
        />
      </div>
      {images.length > 1 && (
        <>
          <button
            className="image-preview-previous"
            aria-label={tr("上一张图片")}
            onClick={() => change(-1)}
          >
            <ChevronLeft size={26} />
          </button>
          <button
            className="image-preview-next"
            aria-label={tr("下一张图片")}
            onClick={() => change(1)}
          >
            <ChevronRight size={26} />
          </button>
        </>
      )}
      {showInfo && (
        <aside
          id="image-preview-info"
          className="image-preview-info"
          aria-label={tr("图片信息")}
        >
          <dl>
            <div>
              <dt>{tr("图片名称")}</dt>
              <dd>{current.title}</dd>
            </div>
            <div>
              <dt>{tr("分辨率")}</dt>
              <dd>
                {dimensions?.blob === current.blob && dimensions
                  ? `${dimensions.width} × ${dimensions.height}`
                  : tr("未知")}
              </dd>
            </div>
            <div>
              <dt>{tr("文件类型")}</dt>
              <dd>{current.mime || current.blob?.type || tr("未知")}</dd>
            </div>
            <div>
              <dt>{tr("文件大小")}</dt>
              <dd>
                {current.blob
                  ? `${(current.blob.size / 1024).toFixed(1)} KB`
                  : tr("未知")}
              </dd>
            </div>
          </dl>
        </aside>
      )}
      <nav
        ref={thumbnails}
        className="image-preview-thumbnails"
        aria-label={tr("当前画布图片")}
      >
        {images.map((card) => (
          <button
            key={card.id}
            aria-label={tr("预览图片：{0}", card.title)}
            aria-current={card.id === current.id ? "true" : undefined}
            onClick={() => onChange(card.id)}
          >
            <PreviewImage card={card} thumbnail />
          </button>
        ))}
      </nav>
    </dialog>
  );
}

import { t as tr } from "./i18n";
import { Paintbrush, Undo2, Trash2, Eye, EyeOff, LogOut } from "lucide-react";
export function PaintControls({
  color,
  width,
  hidden,
  canUndo,
  hasStrokes,
  onColor,
  onWidth,
  onUndo,
  onClear,
  onHidden,
  onExit,
}: {
  color: string;
  width: number;
  hidden: boolean;
  canUndo: boolean;
  hasStrokes: boolean;
  onColor: (v: string) => void;
  onWidth: (v: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onHidden: () => void;
  onExit: () => void;
}) {
  return (
    <div
      className="paint-controls"
      role="toolbar"
      aria-label={tr("绘画工具栏")}
    >
      <Paintbrush size={18} aria-hidden="true" />
      <div className="brush-controls" role="group" aria-label={tr("画笔设置")}>
        <input
          type="color"
          aria-label={tr("画笔颜色")}
          value={color}
          onChange={(e) => onColor(e.target.value)}
        />
        <input
          type="range"
          min="1"
          max="24"
          aria-label={tr("画笔粗细")}
          value={width}
          onChange={(e) => onWidth(Number(e.target.value))}
        />
        <output>{width}</output>
      </div>
      <span className="paint-controls-divider" />
      <button
        aria-label={tr("撤销绘画")}
        title={tr("撤销绘画")}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 size={18} />
      </button>
      <button
        aria-label={tr("清空绘画")}
        title={tr("清空绘画")}
        disabled={!hasStrokes}
        onClick={onClear}
      >
        <Trash2 size={18} />
      </button>
      <button
        aria-label={hidden ? tr("显示绘画") : tr("隐藏绘画")}
        title={hidden ? tr("显示绘画") : tr("隐藏绘画")}
        aria-pressed={hidden}
        onClick={onHidden}
      >
        {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
      </button>
      <button
        aria-label={tr("退出绘画")}
        title={tr("退出绘画 (Esc)")}
        onClick={onExit}
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}

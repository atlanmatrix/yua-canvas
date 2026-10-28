import { t as tr } from "./i18n";
import { useEffect, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
  Highlighter,
} from "lucide-react";
import { FONT_FAMILIES, type TextStyle } from "./presentation";
export function TextFormatToolbar({
  style = {},
  background,
  onChange,
}: {
  style?: TextStyle;
  background: string;
  onChange: (style: TextStyle, background?: string) => void;
}) {
  const update = (patch: Partial<TextStyle>) =>
    onChange({ ...style, ...patch });
  const [fontSize, setFontSize] = useState(String(style.fontSize || 13));
  useEffect(() => setFontSize(String(style.fontSize || 13)), [style.fontSize]);
  return (
    <div
      role="toolbar"
      aria-label={tr("文本格式")}
      className="text-format-toolbar canvas-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") e.stopPropagation();
      }}
    >
      <select
        aria-label={tr("字体")}
        value={style.fontFamily || "monospace"}
        onChange={(e) => update({ fontFamily: e.target.value })}
      >
        {FONT_FAMILIES.map((v, i) => (
          <option key={v} value={v}>
            {[tr("等宽"), tr("无衬线"), tr("衬线"), "Georgia"][i]}
          </option>
        ))}
      </select>
      <input
        type="number"
        min="8"
        max="96"
        aria-label={tr("字号")}
        value={fontSize}
        onBlur={() => setFontSize(String(style.fontSize || 13))}
        onChange={(e) => {
          setFontSize(e.target.value);
          const v = Number(e.target.value);
          if (v >= 8 && v <= 96) update({ fontSize: v });
        }}
      />
      {(
        [
          ["bold", tr("加粗"), Bold],
          ["italic", tr("倾斜"), Italic],
          ["underline", tr("下划线"), Underline],
          ["strikethrough", tr("删除线"), Strikethrough],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          type="button"
          key={key}
          aria-label={label}
          title={label}
          aria-pressed={!!style[key]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => update({ [key]: !style[key] })}
        >
          <Icon size={16} />
        </button>
      ))}
      <label title={tr("文字颜色")}>
        <Palette size={16} />
        <input
          type="color"
          aria-label={tr("文字颜色")}
          value={style.color || "#334155"}
          onChange={(e) => update({ color: e.target.value })}
        />
      </label>
      <label title={tr("背景色")}>
        <Highlighter size={16} />
        <input
          type="color"
          aria-label={tr("文本背景色")}
          value={background}
          onChange={(e) => onChange(style, e.target.value)}
        />
      </label>
    </div>
  );
}

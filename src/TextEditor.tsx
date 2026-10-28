import { t as tr } from "./i18n";
import { textCss, type TextStyle } from "./presentation";
import { useLayoutEffect, useRef } from "react";

export function TextEditor({
  text,
  mode,
  textStyle,
  onChange,
  onFinish,
}: {
  text: string;
  mode?: "wrap" | "scroll";
  textStyle?: TextStyle;
  onChange: (text: string) => void;
  onFinish: (cancelled?: boolean) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = input.current!;
    element.focus({ preventScroll: true });
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);
  return (
    <textarea
      ref={input}
      className="text-editor canvas-editor"
      aria-label={tr("文本内容")}
      style={textCss(textStyle)}
      spellCheck={false}
      value={text}
      wrap={mode === "scroll" ? "off" : "soft"}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        if (
          !(e.relatedTarget as Element | null)?.closest(".text-format-toolbar")
        )
          onFinish();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) {
          e.stopPropagation();
          return;
        }
        if (
          e.key === "Escape" ||
          (e.key === "Enter" && (e.metaKey || e.ctrlKey))
        ) {
          e.preventDefault();
          e.stopPropagation();
          onFinish(e.key === "Escape");
        }
      }}
    />
  );
}

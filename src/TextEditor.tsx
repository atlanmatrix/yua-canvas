import { useLayoutEffect, useRef } from "react";

export function TextEditor({
  text,
  mode,
  onChange,
  onFinish,
}: {
  text: string;
  mode?: "wrap" | "scroll";
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
      className="text-editor"
      aria-label="文本内容"
      spellCheck={false}
      value={text}
      wrap={mode === "scroll" ? "off" : "soft"}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onFinish()}
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

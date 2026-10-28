import { t as tr } from "./i18n";
import { useEffect, useState } from "react";
import { Diagram } from "./Markdown";

export function MermaidEditor({
  source,
  onSave,
  onClose,
}: {
  source: string;
  onSave: (source: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(source);
  const [preview, setPreview] = useState(source);
  useEffect(() => {
    const timer = setTimeout(() => setPreview(value), 200);
    return () => clearTimeout(timer);
  }, [value]);
  const save = () => {
    if (!value.trim()) return;
    onSave(value.trim());
    onClose();
  };
  return (
    <>
      <div className="mermaid-editor-content">
        <textarea
          autoFocus
          spellCheck={false}
          aria-label={tr("Mermaid 代码")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
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
        <div className="mermaid-preview">
          <Diagram source={preview} language="mermaid" standalone />
        </div>
      </div>
      <div className="modal-bottom">
        <button className="button" onClick={onClose}>
          {tr("取消")}
        </button>
        <button className="primary" disabled={!value.trim()} onClick={save}>
          {tr("保存图表")}
        </button>
      </div>
    </>
  );
}

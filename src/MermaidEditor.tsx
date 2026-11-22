import { t as tr } from "./i18n";
import { useEffect, useState } from "react";
import { ModalBackdrop } from "./ModalBackdrop";
import { X } from "./icons";
import { Diagram } from "./Markdown";

export function MermaidEditor({
  text,
  onSave,
  onClose,
}: {
  text: string;
  onSave: (source: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(text);
  const [preview, setPreview] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setPreview(value), 200);
    return () => clearTimeout(timer);
  }, [value]);
  const save = () => {
    if (!value.trim()) return;
    onSave(value.trim());
  };
  return (
    <ModalBackdrop className="modal-backdrop diagram-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={tr("编辑 Mermaid")}
      >
        <div className="modal-heading">
          <span>Mermaid</span>
          <button aria-label={tr("关闭详情")} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
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
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
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
      </section>
    </ModalBackdrop>
  );
}

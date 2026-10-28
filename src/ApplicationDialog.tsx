import { useState } from "react";
import { X } from "lucide-react";
import {
  isApplicationKind,
  normalizeLocalPath,
  validApplicationText,
  type ApplicationKind,
} from "./appAssociations";

export type ApplicationDraft = {
  kind: ApplicationKind;
  x: number;
  y: number;
  id?: string;
  text: string;
};
export function ApplicationDialog({
  draft,
  onSave,
  onClose,
  onSetup,
}: {
  draft: ApplicationDraft;
  onSave: (text: string) => void;
  onClose: () => void;
  onSetup: () => void;
}) {
  const [value, setValue] = useState(draft.text);
  const [error, setError] = useState("");
  const name = draft.kind === "vscode" ? "VS Code" : "iTerm2";
  const save = () => {
    if (
      !isApplicationKind(draft.kind) ||
      !validApplicationText(draft.kind, value)
    ) {
      setError(
        draft.kind === "vscode"
          ? "请输入完整的本地路径，例如 /Users/name/project"
          : "请输入命令，命令内容最多 24KB",
      );
      return;
    }
    onSave(draft.kind === "vscode" ? normalizeLocalPath(value) : value);
  };
  return (
    <div className="modal-backdrop">
      <form
        className="modal application-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${draft.id ? "配置" : "新建"} ${name} 关联`}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="modal-heading">
          <h2>{name}</h2>
          <button type="button" aria-label="关闭应用关联" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {draft.kind === "vscode" ? (
          <label>
            本地路径
            <input
              autoFocus
              aria-label="本地路径"
              placeholder="/Users/name/project"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
            />
          </label>
        ) : (
          <label>
            命令
            <textarea
              autoFocus
              aria-label="iTerm2 命令"
              spellCheck={false}
              rows={8}
              placeholder={"cd /Users/name/project\nnpm run dev"}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
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
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="modal-bottom">
          {draft.kind === "iterm2" && (
            <button
              type="button"
              className="button local-launcher-setup-link"
              onClick={onSetup}
            >
              本机打开器设置
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary">
            保存关联
          </button>
        </div>
      </form>
    </div>
  );
}

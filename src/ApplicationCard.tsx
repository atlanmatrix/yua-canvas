import { Copy, Play } from "lucide-react";
import type { Card } from "./storage";
import { localPathName } from "./appAssociations";

export function ApplicationCard({
  card,
  readonly = false,
  onOpen,
  onCopy,
}: {
  card: Card;
  readonly?: boolean;
  onOpen?: (fromKeyboard: boolean) => void;
  onCopy?: () => void;
}) {
  if (card.kind === "vscode" && readonly)
    return (
      <div className="vscode-pill app-association-readonly">
        <span>使用 VS Code 打开 {localPathName(card.text)}</span>
      </div>
    );
  if (card.kind === "vscode")
    return (
      <button
        className="vscode-pill"
        disabled={readonly}
        title={card.text}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.detail < 2 && !e.ctrlKey && !e.metaKey && !e.shiftKey)
            onOpen?.(e.detail === 0);
        }}
      >
        <span>使用 VS Code 打开 {localPathName(card.text)}</span>
      </button>
    );
  return (
    <div className="app-terminal">
      <div className="app-terminal-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <pre
        onWheel={(e) => {
          if (
            !e.ctrlKey &&
            !e.metaKey &&
            e.currentTarget.scrollHeight > e.currentTarget.clientHeight
          )
            e.stopPropagation();
        }}
      >
        <code>{card.text}</code>
      </pre>
      {!readonly && (
        <div
          className="app-terminal-actions"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button aria-label="复制命令" title="复制命令" onClick={onCopy}>
            <Copy size={16} />
          </button>
          <button
            aria-label="执行命令"
            title="在 iTerm2 中执行"
            onClick={(e) => {
              if (e.detail < 2) onOpen?.(e.detail === 0);
            }}
          >
            <Play size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

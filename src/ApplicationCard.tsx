import { t as tr } from "./i18n";
import { VSCodeIcon } from "./VSCodeIcon";
import { Copy, Play, ChevronRight } from "lucide-react";
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
        <VSCodeIcon />
        <span>
          {tr("使用 VS Code 打开 ")}
          {localPathName(card.text)}
        </span>
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
        <VSCodeIcon />
        <span>
          {tr("使用 VS Code 打开 ")}
          {localPathName(card.text)}
        </span>
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
        <code>
          {card.text.split("\n").map((line, index, lines) => (
            <span className="app-terminal-line" key={index}>
              <ChevronRight
                className="app-terminal-prompt"
                size={14}
                aria-hidden="true"
              />
              <span>
                {line}
                {index < lines.length - 1 ? "\n" : ""}
              </span>
            </span>
          ))}
        </code>
      </pre>
      {!readonly && (
        <div
          className="app-terminal-actions"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            aria-label={tr("复制命令")}
            title={tr("复制命令")}
            onClick={onCopy}
          >
            <Copy size={16} />
          </button>
          <button
            aria-label={tr("执行命令")}
            title={tr("在 iTerm2 中执行")}
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

import { t as tr } from "./i18n";
import { VSCodeIcon } from "./VSCodeIcon";
import { ChevronRight } from "./icons";
import type { Card } from "./storage";
import { localPathName } from "./appAssociations";

export function ApplicationCard({ card }: { card: Card }) {
  if (card.kind === "vscode")
    return (
      <div className="vscode-pill">
        <VSCodeIcon />
        <span>
          {tr("使用 VS Code 打开 ")}
          {localPathName(card.text)}
        </span>
      </div>
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
    </div>
  );
}

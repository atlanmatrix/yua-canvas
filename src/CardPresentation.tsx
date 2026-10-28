import { useState, useRef, useLayoutEffect, type ReactNode } from "react";
import {
  Type,
  Image,
  FileText,
  ListTodo,
  PanelsTopLeft,
  Box,
  Network,
  Code2,
  Terminal,
  EyeOff,
} from "lucide-react";
import { type Card, type Group, type Board, groupTreeIds } from "./storage";
import { cardRect } from "./geometry";
import { NoteText } from "./NoteText";
import { Diagram } from "./Markdown";
import { Attachment } from "./Attachment";
import { Miniature } from "./Miniature";
import { ApplicationCard } from "./ApplicationCard";
export function TypeIcon({ card }: { card: Card }) {
  const Icon = {
    text: Type,
    image: Image,
    file: FileText,
    todo: ListTodo,
    canvas: PanelsTopLeft,
    miniature: Box,
    mermaid: Network,
    vscode: Code2,
    iterm2: Terminal,
  }[card.kind];
  return (
    <div className="component-type-icon" aria-label={`${card.kind} 组件`}>
      <Icon size={24} />
    </div>
  );
}
export function Mask() {
  return (
    <div className="component-mask" aria-label="已遮罩">
      <EyeOff size={28} />
    </div>
  );
}
export function Remark({ text }: { text?: string }) {
  return text ? (
    <aside
      className="component-remark"
      aria-label="备注"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {text}
    </aside>
  ) : null;
}
export function PreviewFrame({
  card,
  editing,
  children,
}: {
  card: Card;
  editing?: boolean;
  children: ReactNode;
}) {
  const r = cardRect(card),
    width = card.width || 240,
    height = card.height || 250;
  const scaled =
    !editing &&
    card.kind !== "canvas" &&
    card.kind !== "miniature" &&
    card.displayMode === "medium";
  const element = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: r.width, height: r.height });
  useLayoutEffect(() => {
    const el = element.current;
    if (!el || !scaled) return;
    const measure = () =>
      setSize((previous) =>
        el.clientWidth === previous.width && el.clientHeight === previous.height
          ? previous
          : { width: el.clientWidth, height: el.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scaled]);
  const scale = scaled
    ? Math.min(1, size.width / width, size.height / height)
    : 1;
  return (
    <div
      ref={element}
      className={`component-viewport ${editing ? "component-editing" : ""}`}
    >
      <div
        className="component-content"
        style={{
          width: scaled ? width : "100%",
          height: scaled ? height : "100%",
          transform: scaled
            ? `translate(${(size.width - width * scale) / 2}px,${(size.height - height * scale) / 2}px) scale(${scale})`
            : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
export function presentationHidden(board: Board, group?: string): boolean {
  const visited = new Set<string>();
  while (group && !visited.has(group)) {
    visited.add(group);
    const g = board.groups.find((g) => g.id === group);
    if (!g) return false;
    if (g.masked || g.displayMode === "list") return true;
    group = g.parent;
  }
  return false;
}
export function groupFrame(g: Group) {
  const b = g.bounds || { x: 0, y: 0, width: 300, height: 300 };
  return g.displayMode === "list"
    ? { ...b, width: Math.max(640, b.width), height: Math.max(360, b.height) }
    : b;
}
export function StaticContent({
  card,
  onPdfPageChange,
  onRunApplication,
  onCopyCommands,
  onOpenCanvas,
  onToggleTask,
  activeMiniature,
  onActiveMiniatureChange,
}: {
  card: Card;
  onPdfPageChange?: (page: number) => void;
  onRunApplication?: (card: Card) => void;
  onCopyCommands?: (text: string) => void;
  onOpenCanvas?: (card: Card) => void;
  onToggleTask?: (card: Card, id: string) => void;
  activeMiniature?: boolean;
  onActiveMiniatureChange?: (active: boolean) => void;
}) {
  if (card.kind === "text")
    return (
      <NoteText
        text={card.text}
        mode={card.textMode}
        textStyle={card.textStyle}
      />
    );
  if (card.kind === "mermaid")
    return (
      <div className="mermaid-preview">
        <Diagram source={card.text} language="mermaid" standalone />
      </div>
    );
  if (card.kind === "vscode" || card.kind === "iterm2")
    return (
      <ApplicationCard
        card={card}
        readonly={!onRunApplication}
        onOpen={() => onRunApplication?.(card)}
        onCopy={() => onCopyCommands?.(card.text)}
      />
    );
  if (card.kind === "todo")
    return (
      <div className="todo-list">
        {card.tasks?.map((t) => (
          <div
            key={t.id}
            data-task-id={t.id}
            className={`todo-row ${t.done ? "completed" : ""}`}
          >
            <input
              type="checkbox"
              aria-label={t.text}
              checked={t.done}
              readOnly={!onToggleTask}
              onChange={() => onToggleTask?.(card, t.id)}
            />
            <span data-task-text>{t.text}</span>
          </div>
        ))}
      </div>
    );
  if (card.kind === "canvas")
    return onOpenCanvas ? (
      <button
        className="group-canvas-open"
        aria-label={`进入子画布 ${card.title}`}
        onClick={() => onOpenCanvas(card)}
      >
        <PanelsTopLeft size={36} />
        {card.title}
      </button>
    ) : (
      <TypeIcon card={card} />
    );
  if (card.kind === "miniature" && onActiveMiniatureChange)
    return (
      <Miniature
        card={card}
        active={activeMiniature}
        onActiveChange={onActiveMiniatureChange}
      />
    );
  if (card.kind === "miniature" && !card.blob) return <TypeIcon card={card} />;
  return (
    <Attachment
      onPdfPageChange={onPdfPageChange}
      card={card.kind === "miniature" ? { ...card, kind: "image" } : card}
    />
  );
}
export function GroupList({
  group,
  cards,
  onSelect,
  onOpen,
  onContextMenu,
  renderContent,
}: {
  group: Group;
  cards: Card[];
  onSelect?: (id: string) => void;
  onOpen?: (card: Card, event?: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent, card: Card) => void;
  renderContent?: (card: Card) => ReactNode;
}) {
  const [local, setLocal] = useState<string>();
  const active =
    cards.find((c) => c.id === (local || group.activeCard)) || cards[0];
  return (
    <div
      className="group-list"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
      }}
    >
      <nav aria-label="分组组件列表">
        {cards.map((c) => (
          <button
            key={c.id}
            data-context-card-id={c.id}
            aria-pressed={c === active}
            onClick={() => {
              setLocal(c.id);
              onSelect?.(c.id);
            }}
            onContextMenu={(e) => onContextMenu?.(e, c)}
          >
            <TypeIcon card={c} />
            <span>
              {c.masked
                ? "已遮罩"
                : c.title ||
                  c.text.slice(0, 40) ||
                  (c.kind === "todo" ? "任务" : "组件")}
            </span>
          </button>
        ))}
      </nav>
      <div
        className="group-list-detail"
        data-context-card-id={active?.id}
        onContextMenu={(e) => active && onContextMenu?.(e, active)}
        onDoubleClick={(e) => active && !active.masked && onOpen?.(active, e)}
      >
        {active ? (
          <>
            <div
              className={`group-list-card card-${active.kind}`}
              style={{
                width: cardRect(active).width,
                height: cardRect(active).height,
                background: active.color,
              }}
            >
              {active.masked ? (
                <Mask />
              ) : active.displayMode === "small" ? (
                <TypeIcon card={active} />
              ) : (
                <PreviewFrame card={active}>
                  {renderContent?.(active) || <StaticContent card={active} />}
                </PreviewFrame>
              )}
            </div>
            {!active.masked && active.remark && (
              <div className="group-list-remark">{active.remark}</div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
export function groupCards(board: Board, id: string) {
  const ids = groupTreeIds(board.groups, id);
  return board.cards.filter((c) => {
    if (!c.group || !ids.has(c.group)) return false;
    let ancestor: string | undefined = c.group;
    const seen = new Set<string>();
    while (ancestor && ancestor !== id && !seen.has(ancestor)) {
      seen.add(ancestor);
      const g = board.groups.find((g) => g.id === ancestor);
      if (g?.masked) return false;
      ancestor = g?.parent;
    }
    return true;
  });
}

import { FlowchartPreview } from "./Flowchart";
import { MindMap } from "./MindMap";
import { AgentCard } from "./AgentCard";
import { t as tr } from "./i18n";
import {
  useState,
  useRef,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Type,
  Bot,
  Image,
  FileText,
  ListTodo,
  PanelsTopLeft,
  Box,
  Network,
  Workflow,
  Code2,
  Terminal,
  EyeOff,
} from "./icons";
import { type Card, type Group, type Board, groupTreeIds } from "./storage";
import {
  cardRect,
  contentCardSize,
  documentLayout,
  pdfGeometry,
} from "./geometry";
import { NoteText } from "./NoteText";
import { Diagram } from "./Markdown";
import { Attachment } from "./Attachment";
import { Miniature } from "./Miniature";
import { ApplicationCard } from "./ApplicationCard";
import { ToolCard, TOOL_ICONS } from "./ToolCard";
import { isToolKind } from "./tools";
import { surfaceColor, customColor } from "./presentation";
import { isTextFile } from "./clipboard";
import { LockedContent } from "./ComponentLock";

export function isDiagramKind(kind: Card["kind"]) {
  return kind === "mindmap" || kind === "mermaid" || kind === "flowchart";
}

export function diagramFrameStyle(card: Card): CSSProperties | undefined {
  if (
    !isDiagramKind(card.kind) ||
    card.masked ||
    card.locked ||
    card.displayMode === "small"
  ) return;
  return {
    background: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    boxShadow: "none",
    padding: 0,
    overflow: "visible",
    maxHeight: "none",
  };
}

export function TodoHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card-top">
      <span className="todo-title">
        <ListTodo size={13} />
        {children || <span title={title || undefined}>{title || "TODO"}</span>}
      </span>
    </div>
  );
}

export function TypeIcon({
  card,
  showName = false,
}: {
  card: Card;
  showName?: boolean;
}) {
  if (card.locked) return <LockedContent />;
  const Icon = {
    text: Type,
    image: Image,
    file: FileText,
    todo: ListTodo,
    canvas: PanelsTopLeft,
    miniature: Box,
    mindmap: Network,
    mermaid: Network,
    flowchart: Workflow,
    vscode: Code2,
    iterm2: Terminal,
    agent: Bot,
    ...TOOL_ICONS,
  }[card.kind];
  return (
    <div className="component-type-icon" aria-label={tr("{0} 组件", card.kind)}>
      <Icon size={24} />
      {showName && card.title && <span title={card.title}>{card.title}</span>}
    </div>
  );
}
export function Mask() {
  return (
    <div className="component-mask" aria-label={tr("已遮罩")}>
      <EyeOff size={28} />
    </div>
  );
}
export function Remark({ text }: { text?: string }) {
  return text ? (
    <aside
      className="component-remark"
      aria-label={tr("备注")}
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
    natural = contentCardSize(card),
    document = documentLayout(card);
  // Mind maps measure their content directly. Other cards include two frame edges.
  const edges = card.kind === "mindmap" ? 0 : 2;
  const width = Math.max(1, natural.width - edges),
    height = Math.max(1, natural.height - edges);
  const scaled =
    card.kind === "mindmap"
      ? card.displayMode === "medium" || card.displayMode === "custom"
      : !pdfGeometry(card) &&
        // Text and interactive controls reflow at their real CSS font size. Scaling
        // their natural-size preview makes 13px text smaller than a 13px note,
        // independently of screen density. Images and diagrams retain fit scaling.
        (card.kind === "image" ||
          card.kind === "mermaid" ||
          (card.kind === "file" && !isTextFile(card))) &&
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
  }, [scaled, r.width, r.height, width, height]);
  const scale = scaled ? Math.min(size.width / width, size.height / height) : 1;
  return (
    <div
      ref={element}
      style={
        document
          ? ({
              "--document-padding": `${document.insetY}px ${document.insetX}px`,
            } as CSSProperties)
          : undefined
      }
      data-document={document ? true : undefined}
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
  onOpenCanvas,
  onToggleTask,
  onUnlock,
  onToolChange,
  activeMiniature,
  onActiveMiniatureChange,
}: {
  card: Card;
  onPdfPageChange?: (page: number) => void;
  onOpenCanvas?: (card: Card) => void;
  onToggleTask?: (card: Card, id: string) => void;
  onUnlock?: (card: Card) => void;
  onToolChange?: (card: Card, text: string) => void;
  activeMiniature?: boolean;
  onActiveMiniatureChange?: (active: boolean) => void;
}) {
  if (card.locked)
    return (
      <LockedContent onUnlock={onUnlock ? () => onUnlock(card) : undefined} />
    );
  if (card.kind === "agent")
    return (
      <AgentCard
        card={card}
        onChange={onToolChange ? (text) => onToolChange(card, text) : undefined}
      />
    );
  if (isToolKind(card.kind))
    return (
      <ToolCard
        card={card}
        onChange={onToolChange ? (text) => onToolChange(card, text) : undefined}
      />
    );
  if (card.kind === "text")
    return (
      <NoteText
        text={card.text}
        mode={card.textMode}
        textStyle={card.textStyle}
        textRuns={card.textRuns}
        linkDisabled={card.linkDisabled}
      />
    );
  if (card.kind === "mindmap") return <MindMap text={card.text} />;
  if (card.kind === "flowchart") return <FlowchartPreview text={card.text} />;
  if (card.kind === "mermaid")
    return (
      <div className="mermaid-preview">
        <Diagram source={card.text} language="mermaid" standalone />
      </div>
    );
  if (card.kind === "vscode" || card.kind === "iterm2")
    return <ApplicationCard card={card} />;
  if (card.kind === "todo")
    return (
      <>
        <TodoHeading title={card.title} />
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
      </>
    );
  if (card.kind === "canvas")
    return onOpenCanvas ? (
      <button
        className="group-canvas-open"
        aria-label={tr("进入子画布 {0}", card.title)}
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
      <nav aria-label={tr("分组组件列表")}>
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
                ? tr("已遮罩")
                : c.title ||
                  c.text.slice(0, 40) ||
                  (c.kind === "todo" ? tr("任务") : tr("组件"))}
            </span>
          </button>
        ))}
      </nav>
      <div
        className="group-list-detail"
        data-context-card-id={active?.id}
        tabIndex={active && !active.masked ? 0 : undefined}
        onContextMenu={(e) => active && onContextMenu?.(e, active)}
        onDoubleClick={(e) => active && !active.masked && onOpen?.(active, e)}
        onKeyDown={(e) => {
          if (
            active &&
            !active.masked &&
            e.target === e.currentTarget &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            e.stopPropagation();
            onOpen?.(active);
          }
        }}
      >
        {active ? (
          <>
            <div
              className={`group-list-card card-${active.kind}`}
              data-custom-color={customColor(active.color)}
              style={{
                width: cardRect(active).width,
                height: cardRect(active).height,
                background: surfaceColor(active.color),
                ...diagramFrameStyle(active),
              }}
            >
              {active.masked ? (
                <Mask />
              ) : active.displayMode === "small" ? (
                <TypeIcon card={active} showName />
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

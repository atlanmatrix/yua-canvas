import { MindMap } from "./MindMap";
import { cardPorts } from "./connectionPorts";
import { AgentCard } from "./AgentCard";
import { LockedContent } from "./ComponentLock";
import React, { memo, useEffect, useState } from "react";
import {
  ListTodo,
  FileText,
  Check,
  MoreHorizontal,
  PanelsTopLeft,
  Plus,
  WrapText,
  ArrowLeftRight,
  Download,
  Copy,
  Play,
  ArrowUpRight,
} from "./icons";
import type { Card, Task } from "./storage";
import { replaceBoard, type useCanvasWorkspace } from "./workspace";
import { cardRect, textSize, TEXT_MAX_WIDTH } from "./geometry";
import { isTextFile, isMarkdownFile, isPdfFile } from "./clipboard";
import { sameEndpoint, type Endpoint } from "./connections";
import { isApplicationKind } from "./appAssociations";
import { ApplicationCard } from "./ApplicationCard";
import { Attachment } from "./Attachment";
import { Diagram } from "./Markdown";
import { Miniature } from "./Miniature";
import { miniatureViewUrl } from "./miniatureScene";
import { NoteText } from "./NoteText";
import { noteCardHref } from "./noteLinks";
import { TextEditor } from "./TextEditor";
import { TodoEditor } from "./TodoEditor";
import { GroupNameEditor } from "./GroupNameEditor";
import {
  mindMapFrameStyle,
  PreviewFrame,
  Mask,
  TypeIcon,
  Remark,
} from "./CardPresentation";

import type { TextRun } from "./presentation";
import { todoFocusAt } from "./todoCaret";
import { previewMetrics } from "./previewCache";
import { ToolCard } from "./ToolCard";
import { isToolKind } from "./tools";
import { surfaceColor, customColor } from "./presentation";
import { t as tr, usePreferences } from "./i18n";
import type { MindMapData } from "./mindMapData";
export type CanvasCardActions = {
  selectMind: (card: string, id: string) => void;
  insertMind: (card: string, id: string, sibling: boolean) => void;
  changeMind: (card: string, update: (map: MindMapData) => MindMapData) => void;
  setBoard: ReturnType<typeof useCanvasWorkspace>["setBoard"];
  updateRoot: ReturnType<typeof useCanvasWorkspace>["updateRoot"];
  setMenu: (
    menu: {
      x: number;
      y: number;
      id: string;
      kind: "card" | "group" | "canvas";
      noteLinkIcon?: boolean;
      mindNode?: string;
    } | null,
  ) => void;
  setSelectedGroup: (id?: string) => void;
  setSelectedConnection: (id?: string) => void;
  setSelection: React.Dispatch<React.SetStateAction<string[]>>;
  setDetail: (id?: string) => void;
  setActiveMiniature: (id?: string) => void;
  setRenamingCanvas: (id?: string) => void;
  pointerDown: (e: React.PointerEvent, id?: string, group?: string) => void;
  resizeCard: (e: React.PointerEvent, card: Card, edge: string) => void;
  chooseConnectionTarget: (from: Endpoint) => void;
  startConnection: (e: React.PointerEvent, endpoint: Endpoint) => void;
  runApplication: (card: Card) => void;
  copyCommands: (text: string) => Promise<boolean>;
  openCard: (
    card: Card,
    task?: string,
    offset?: number,
    append?: boolean,
  ) => void;
  updateCards: (fn: (cards: Card[]) => Card[]) => void;
  navigateCanvas: (path: string[]) => void;
  changeText: (id: string, text: string, runs: TextRun[]) => void;
  changeTodo: (id: string, tasks: Task[]) => void;
  finishEditing: (id: string, cancelled?: boolean) => void;
  downloadCard: (card: Card) => void;
};
function CopyCommandButton({ copy }: { copy: () => Promise<boolean> }) {
  const [copiedAt, setCopiedAt] = useState(0);
  useEffect(() => {
    if (!copiedAt) return;
    const timer = setTimeout(() => setCopiedAt(0), 1500);
    return () => clearTimeout(timer);
  }, [copiedAt]);
  return (
    <button
      type="button"
      aria-label={tr("复制命令")}
      title={tr(copiedAt ? "命令已复制" : "复制命令")}
      data-copied={copiedAt ? true : undefined}
      onClick={async () => setCopiedAt((await copy()) ? performance.now() : 0)}
    >
      {copiedAt ? <Check size={17} /> : <Copy size={17} />}
    </button>
  );
}
const emptyOffsets: Record<string, { y: number; visible: boolean }> = {};
export const CanvasCard = memo(function CanvasCard({
  card: c,
  activeMindNode,
  selected,
  menuOpen = false,
  dropTarget = false,
  touchMode = false,
  editing,
  editingTask,
  editingTaskOffset,
  renaming,
  miniatureActive,
  preview3D,
  groupName,
  path,
  connectionTarget,
  connectionSource,
  taskOffsets = emptyOffsets,
  lastPointerMoved,
  actions,
}: {
  card: Card;
  selected: boolean;
  activeMindNode?: string;
  menuOpen?: boolean;
  dropTarget?: boolean;
  touchMode?: boolean;
  editing: boolean;
  editingTask?: string;
  editingTaskOffset?: number;
  renaming: boolean;
  miniatureActive: boolean;
  preview3D: boolean;
  groupName: string;
  path: string[];
  connectionTarget?: Endpoint & { pullX: number; pullY: number };
  connectionSource?: boolean;
  taskOffsets?: Record<string, { y: number; visible: boolean }>;
  lastPointerMoved: React.RefObject<boolean>;
  actions: CanvasCardActions;
}) {
  previewMetrics.cardRenders++;
  usePreferences();
  const {
    setBoard,
    setMenu,
    setSelectedGroup,
    setSelectedConnection,
    setSelection,
    setDetail,
    setActiveMiniature,
    setRenamingCanvas,
    pointerDown,
    resizeCard,
    startConnection,
    runApplication,
    copyCommands,
    openCard,
    updateCards,
    navigateCanvas,
    changeText,
    changeTodo,
    finishEditing,
    downloadCard,
  } = actions;
  const workspace = { updateRoot: actions.updateRoot };
  const updateAspect = (width: number, height: number) => {
    const ratio = width / height;
    if (
      !Number.isFinite(ratio) ||
      ratio < 0.001 ||
      ratio > 1000 ||
      Math.abs((c.contentAspectRatio || 0) - ratio) < 0.000001
    )
      return;
    setBoard(
      (b) => ({
        ...b,
        cards: b.cards.map((card) =>
          card.id === c.id ? { ...card, contentAspectRatio: ratio } : card,
        ),
      }),
      { recordHistory: false, preserveLayout: true },
    );
  };
  const mindFrame = mindMapFrameStyle(c);
  const ports = mindFrame && activeMindNode ? [] : cardPorts(c);
  const [lastPort, setLastPort] = useState<Endpoint>();
  const portTabStop =
    ports.find(
      ({ endpoint }) =>
        lastPort &&
        sameEndpoint(endpoint, lastPort) &&
        (!endpoint.task ||
          taskOffsets[`${c.id}:${endpoint.task}`]?.visible !== false),
    )?.endpoint ?? ports[0]?.endpoint;
  const address = !editing && noteCardHref(c);
  const rect = cardRect(editing ? { ...c, linkDisabled: true } : c);
  return (
    <article
      key={c.id}
      data-testid="card"
      data-card-id={c.id}
      data-mind-frame={mindFrame ? true : undefined}
      data-mind-active={mindFrame && activeMindNode ? true : undefined}
      data-connection-source={connectionSource || undefined}
      data-drop-target={dropTarget || undefined}
      data-menu-open={menuOpen || undefined}
      data-custom-color={customColor(c.color)}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest(".canvas-editor")) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedGroup(undefined);
        setSelectedConnection(undefined);
        if (!selected) setSelection([c.id]);
        const mindNode = (e.target as Element).closest<HTMLElement>(
          "[data-mind-node]",
        )?.dataset.mindNode;
        if (mindNode && activeMindNode) actions.selectMind(c.id, mindNode);
        setMenu({
          mindNode,
          x: e.clientX,
          y: e.clientY,
          id: c.id,
          kind: "card",
          noteLinkIcon: !!(e.target as Element).closest(".note-link-icon"),
        });
      }}
      className={
        (c.masked ? "is-masked " : "") +
        (c.displayMode === "small" ? "is-small " : "") +
        "card card-" +
        c.kind +
        (c.kind === "file" && isTextFile(c) ? " text-file-card" : "") +
        (isPdfFile(c) ? " pdf-file-card" : "") +
        (isMarkdownFile(c) ? " markdown-file-card" : "") +
        " " +
        (selected ? "selected" : "") +
        (editing || renaming ? " canvas-editing" : "") +
        (address ? " is-link-note" : "")
      }
      tabIndex={-1}
      title={
        c.kind === "vscode" && !c.masked && c.displayMode !== "small"
          ? c.text
          : undefined
      }
      aria-label={
        c.masked
          ? tr("已遮罩组件")
          : c.displayMode === "small"
            ? c.title || tr("{0} 组件", c.kind)
            : c.kind === "text"
              ? c.text.slice(0, 80)
              : c.kind === "mermaid"
                ? tr("Mermaid 图表")
                : c.title || tr("任务")
      }
      data-group-name={groupName || ""}
      style={{
        left: c.x,
        top: c.y,
        width: rect.width,
        height: rect.height,
        background:
          c.kind === "miniature"
            ? "transparent"
            : surfaceColor(
                c.color,
                address ? "var(--surface-muted)" : undefined,
              ),
        ...mindFrame,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (
          (e.target as Element).closest(".markdown-file-preview a") &&
          !e.ctrlKey &&
          !e.metaKey
        )
          return;
        pointerDown(e, c.id);
      }}
      onClick={(e) => {
        if (
          !c.masked &&
          c.displayMode !== "small" &&
          c.editableFile &&
          !lastPointerMoved.current &&
          !(e.target as Element).closest("button,a,input,textarea") &&
          !e.ctrlKey &&
          !e.metaKey
        )
          setDetail(c.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (c.locked) {
          openCard(c);
          return;
        }
        if (c.masked) return;
        if (c.displayMode === "small") {
          setBoard(
            (b) => ({
              ...b,
              cards: b.cards.map((card) =>
                card.id === c.id ? { ...card, displayMode: "medium" } : card,
              ),
            }),
            { preserveLayout: true },
          );
          return;
        }
        if (mindFrame && !e.ctrlKey && !e.metaKey) {
          const node = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>("[data-mind-node]");
          if (node?.dataset.mindNode)
            actions.selectMind(c.id, node.dataset.mindNode);
          else openCard(c);
          return;
        }
        if (c.kind === "vscode") return;
        if (
          c.kind === "canvas" &&
          !e.ctrlKey &&
          !e.metaKey &&
          document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest(".attachment-title")
        ) {
          setRenamingCanvas(c.id);
          return;
        }
        if (c.kind === "todo" && !e.ctrlKey && !e.metaKey) {
          const focus = todoFocusAt(e, e.target as Element);
          openCard(c, focus.task, focus.offset, !focus.task);
          return;
        }
        if (!e.ctrlKey && !e.metaKey)
          openCard(
            c,
            document
              .elementFromPoint(e.clientX, e.clientY)
              ?.closest<HTMLElement>("[data-task-id]")?.dataset.taskId,
          );
      }}
    >
      {c.locked ? (
        <LockedContent onUnlock={() => openCard(c)} />
      ) : c.masked ? (
        <Mask />
      ) : c.displayMode === "small" && !editing ? (
        <TypeIcon card={c} showName />
      ) : (
        <PreviewFrame card={c} editing={editing}>
          {c.kind !== "text" &&
            c.kind !== "image" &&
            c.kind !== "canvas" &&
            c.kind !== "miniature" &&
            c.kind !== "mindmap" &&
            c.kind !== "mermaid" &&
            c.kind !== "agent" &&
            !isToolKind(c.kind) &&
            !isApplicationKind(c.kind) &&
            !isPdfFile(c) &&
            !(c.kind === "file" && isTextFile(c)) && (
              <div className="card-top">
                <span>
                  {c.kind === "todo" ? (
                    <ListTodo size={13} />
                  ) : (
                    <FileText size={13} />
                  )}{" "}
                  {c.kind === "todo" ? "TODO" : "FILE"}
                </span>
              </div>
            )}
          {c.kind === "mindmap" ? (
            <MindMap
              text={c.text}
              active={activeMindNode}
              onSelect={
                activeMindNode
                  ? (id) => actions.selectMind(c.id, id)
                  : undefined
              }
              onChange={
                activeMindNode
                  ? (update) => actions.changeMind(c.id, update)
                  : undefined
              }
              onInsert={
                activeMindNode
                  ? (id, sibling) => actions.insertMind(c.id, id, sibling)
                  : undefined
              }
              onMeasure={(width, height) => {
                if (c.width === width && c.height === height) return;
                setBoard(
                  (b) => ({
                    ...b,
                    cards: b.cards.map((card) =>
                      card.id === c.id ? { ...card, width, height } : card,
                    ),
                  }),
                  { recordHistory: false, preserveLayout: true },
                );
              }}
            />
          ) : c.kind === "agent" ? (
            <AgentCard
              card={c}
              onChange={(text) =>
                updateCards((cards) =>
                  cards.map((card) =>
                    card.id === c.id ? { ...card, text } : card,
                  ),
                )
              }
            />
          ) : isToolKind(c.kind) ? (
            <ToolCard
              card={c}
              onChange={(text) =>
                updateCards((cards) =>
                  cards.map((card) =>
                    card.id === c.id ? { ...card, text } : card,
                  ),
                )
              }
            />
          ) : isApplicationKind(c.kind) ? (
            <ApplicationCard card={c} />
          ) : c.kind === "miniature" ? (
            preview3D ? null : (
              <Miniature
                card={c}
                active={miniatureActive}
                onActiveChange={(active) =>
                  setActiveMiniature(active ? c.id : undefined)
                }
                onSelect={() => {
                  setSelection([c.id]);
                  setSelectedGroup(undefined);
                  setSelectedConnection(undefined);
                }}
                onLabelChange={(field, value) => {
                  updateCards((cards) =>
                    cards.map((card) =>
                      card.id === c.id
                        ? {
                            ...card,
                            [field]: value,
                            ...(field === "text" && card.text !== value
                              ? {
                                  blob: undefined,
                                  mime: undefined,
                                  miniatureView: undefined,
                                }
                              : {}),
                          }
                        : card,
                    ),
                  );
                }}
                onSnapshot={({ view, cover }) => {
                  if (!miniatureViewUrl(c.text, view)) return;
                  workspace.updateRoot(
                    (root) =>
                      replaceBoard(root, path, (board) => {
                        const target = board.cards.find(
                          (card) =>
                            card.id === c.id &&
                            card.kind === "miniature" &&
                            card.text === c.text,
                        );
                        if (
                          !target ||
                          (target.miniatureView === view &&
                            target.blob === cover)
                        )
                          return board;
                        return {
                          ...board,
                          cards: board.cards.map((card) =>
                            card === target
                              ? {
                                  ...card,
                                  miniatureView: view,
                                  blob: cover,
                                  mime: cover?.type,
                                }
                              : card,
                          ),
                        };
                      }),
                    { preserveLayout: true, recordHistory: false },
                  );
                }}
              />
            )
          ) : c.kind === "canvas" ? (
            <>
              <svg
                className="canvas-card-inner-border"
                aria-hidden="true"
                focusable="false"
              >
                <rect x="0.5" y="0.5" rx="10" />
              </svg>
              <div className="canvas-card-preview">
                <button
                  className="canvas-enter"
                  aria-label={tr("进入子画布 {0}", c.title)}
                  title={tr("进入子画布")}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    pointerDown(e, c.id);
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      !e.detail ||
                      (!lastPointerMoved.current &&
                        !e.shiftKey &&
                        !e.ctrlKey &&
                        !e.metaKey)
                    )
                      navigateCanvas([...path, c.id]);
                  }}
                >
                  <PanelsTopLeft size={36} />
                </button>
              </div>
              <div className="attachment-title">
                <PanelsTopLeft size={16} />
                {renaming ? (
                  <GroupNameEditor
                    name={c.title}
                    label={tr("画布名称")}
                    onCancel={() => setRenamingCanvas(undefined)}
                    onSave={(title) => {
                      updateCards((cards) =>
                        cards.map((card) =>
                          card.id === c.id ? { ...card, title } : card,
                        ),
                      );
                      setRenamingCanvas(undefined);
                    }}
                  />
                ) : (
                  <span>{c.title || tr("子画布")}</span>
                )}
              </div>
            </>
          ) : c.kind === "mermaid" ? (
            <div className="mermaid-preview">
              <Diagram
                source={c.text}
                language="mermaid"
                standalone
                onSize={(width, height) => {
                  updateAspect(width, height);
                  if (c.width || c.height) return;
                  const scale = Math.min(1, 800 / width, 1200 / height);
                  setBoard(
                    (b) => ({
                      ...b,
                      cards: b.cards.map((card) =>
                        card.id === c.id && !card.width && !card.height
                          ? {
                              ...card,
                              width: Math.max(180, width * scale + 24),
                              height: Math.max(100, height * scale + 24),
                            }
                          : card,
                      ),
                    }),
                    { recordHistory: false },
                  );
                }}
              />
            </div>
          ) : c.kind === "text" ? (
            editing ? (
              <TextEditor
                text={c.text}
                mode={c.textMode}
                textStyle={c.textStyle}
                textRuns={c.textRuns}
                onChange={(text, runs) => changeText(c.id, text, runs)}
                onFinish={(cancelled) => finishEditing(c.id, cancelled)}
              />
            ) : (
              <NoteText
                text={c.text}
                linkDisabled={c.linkDisabled}
                onLinkMenu={(button) => {
                  const rect = button.getBoundingClientRect();
                  setSelectedGroup(undefined);
                  setSelectedConnection(undefined);
                  setSelection([c.id]);
                  setMenu({
                    id: c.id,
                    kind: "card",
                    x: rect.left,
                    y: rect.bottom + 4,
                    noteLinkIcon: true,
                  });
                }}
                mode={c.textMode}
                textStyle={c.textStyle}
                textRuns={c.textRuns}
              />
            )
          ) : c.kind === "todo" ? (
            editing ? (
              <TodoEditor
                tasks={c.tasks || []}
                initialTask={editingTask}
                initialOffset={editingTaskOffset}
                onChange={(tasks) => changeTodo(c.id, tasks)}
                onFinish={(cancelled) => finishEditing(c.id, cancelled)}
              />
            ) : (
              <div
                className="todo-list"
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest("input"))
                    e.stopPropagation();
                }}
              >
                {(c.tasks || []).map((task) => (
                  <div
                    key={task.id}
                    data-task-id={task.id}
                    className={`todo-row ${task.done ? "completed" : ""}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={task.text}
                      checked={task.done}
                      onChange={() =>
                        updateCards((cards) =>
                          cards.map((card) =>
                            card.id === c.id
                              ? {
                                  ...card,
                                  tasks: card.tasks?.map((t) =>
                                    t.id === task.id
                                      ? { ...t, done: !t.done }
                                      : t,
                                  ),
                                }
                              : card,
                          ),
                        )
                      }
                    />
                    <span data-task-text>{task.text}</span>
                  </div>
                ))}
              </div>
            )
          ) : c.kind === "image" ? (
            <Attachment card={c} />
          ) : isPdfFile(c) || isMarkdownFile(c) ? (
            <Attachment
              card={c}
              onPdfAspectChange={updateAspect}
              onPdfPageChange={(pdfPage) => {
                setBoard(
                  (b) => ({
                    ...b,
                    cards: b.cards.map((card) =>
                      card.id === c.id ? { ...card, pdfPage } : card,
                    ),
                  }),
                  { recordHistory: false },
                );
              }}
            />
          ) : (
            <>
              <Attachment card={c} />
              <div className="attachment-title">
                <FileText size={16} />
                <span>{c.title}</span>
              </div>
            </>
          )}
          {c.kind === "file" && !isTextFile(c) && !isPdfFile(c) && (
            <footer>
              <span>{c.group ? groupName : ""}</span>
              <span>
                {selected ? <Check size={13} /> : <MoreHorizontal size={16} />}
              </span>
            </footer>
          )}
        </PreviewFrame>
      )}
      {!c.masked && <Remark text={c.remark} />}
      {ports.map(({ endpoint, label, row }) => {
        const { side, task } = endpoint;
        const magnet =
          connectionTarget && sameEndpoint(connectionTarget, endpoint)
            ? connectionTarget
            : undefined;
        const offset = task ? taskOffsets[`${c.id}:${task}`] : undefined;
        return (
          <button
            key={JSON.stringify(endpoint)}
            style={
              {
                "--magnet-x": `${magnet?.pullX ?? 0}px`,
                "--magnet-y": `${magnet?.pullY ?? 0}px`,
                top:
                  row !== undefined
                    ? (offset?.y ?? 54 + row * 32) - 1
                    : undefined,
                visibility: offset && !offset.visible ? "hidden" : undefined,
              } as React.CSSProperties
            }
            className={`connection-port ${task ? "task-port " : ""}port-${side} ${magnet ? "target-active" : ""}`}
            aria-label={label}
            aria-haspopup="dialog"
            tabIndex={
              endpoint === portTabStop && (!mindFrame || selected) ? 0 : -1
            }
            onFocus={() => setLastPort(endpoint)}
            onKeyDown={(e) => {
              if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
              const step = {
                ArrowUp: -1,
                ArrowLeft: -1,
                ArrowDown: 1,
                ArrowRight: 1,
              }[e.key];
              if (!step) return;
              e.preventDefault();
              e.stopPropagation();
              const siblings = Array.from(
                e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                  ":scope > .connection-port",
                ),
              ).filter(
                (port) => getComputedStyle(port).visibility === "visible",
              );
              const index = siblings.indexOf(e.currentTarget);
              siblings[
                (index + step + siblings.length) % siblings.length
              ]?.focus({ preventScroll: true });
            }}
            data-port-card={c.id}
            data-port-side={side}
            data-port-task={task}
            onPointerDown={(e) => startConnection(e, endpoint)}
            onClick={(e) => {
              if (e.detail === 0) actions.chooseConnectionTarget(endpoint);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Plus size={12} aria-hidden="true" />
          </button>
        );
      })}
      <div
        className="card-toolbar"
        role="toolbar"
        aria-label={tr("组件操作")}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {!c.masked &&
          !c.locked &&
          c.displayMode !== "small" &&
          isApplicationKind(c.kind) && (
            <>
              {c.kind === "iterm2" && (
                <CopyCommandButton copy={() => copyCommands(c.text)} />
              )}
              <button
                type="button"
                aria-label={tr(
                  c.kind === "vscode" ? "在 VS Code 中打开" : "执行命令",
                )}
                title={tr(
                  c.kind === "vscode"
                    ? "在 VS Code 中打开"
                    : "在 iTerm2 中执行",
                )}
                onClick={(e) => {
                  if (e.detail < 2 && !e.ctrlKey && !e.metaKey && !e.shiftKey)
                    runApplication(c);
                }}
              >
                {c.kind === "vscode" ? (
                  <ArrowUpRight size={17} />
                ) : (
                  <Play size={17} />
                )}
              </button>
            </>
          )}
        {!c.masked &&
          !c.locked &&
          c.displayMode !== "small" &&
          c.kind === "text" && (
            <button
              className="text-display-toggle"
              aria-label={
                c.textMode === "scroll"
                  ? tr("切换为换行模式")
                  : tr("切换为滚动模式")
              }
              title={c.textMode === "scroll" ? tr("换行") : tr("滚动")}
              aria-pressed={c.textMode === "scroll"}
              onClick={() => {
                const textMode = c.textMode === "scroll" ? "wrap" : "scroll";
                updateCards((cards) =>
                  cards.map((card) =>
                    card.id === c.id
                      ? {
                          ...card,
                          textMode,
                          textAutoHeight: true,
                          ...textSize(
                            card.text,
                            textMode,
                            card.width || TEXT_MAX_WIDTH,
                            card.textStyle,
                            card.textRuns,
                          ),
                        }
                      : card,
                  ),
                );
              }}
            >
              {c.textMode === "scroll" ? (
                <WrapText size={17} />
              ) : (
                <ArrowLeftRight size={17} />
              )}
            </button>
          )}
        {!c.masked &&
          c.displayMode !== "small" &&
          !isApplicationKind(c.kind) && (
            <button
              className="card-download"
              aria-label={tr(
                "下载 {0}",
                c.title ||
                  (c.kind === "todo"
                    ? "任务"
                    : c.kind === "mermaid"
                      ? "Mermaid"
                      : "文本"),
              )}
              title={tr("下载")}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                downloadCard(c);
              }}
            >
              <Download size={17} />
            </button>
          )}
        <button
          className="card-more"
          aria-label={tr("更多组件操作")}
          title={tr("更多")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpen) {
              setMenu(null);
              return;
            }
            const bounds = e.currentTarget.getBoundingClientRect();
            setSelectedGroup(undefined);
            setSelectedConnection(undefined);
            if (!selected) setSelection([c.id]);
            setMenu({
              x: bounds.left,
              y: bounds.bottom + 8,
              id: c.id,
              kind: "card",
            });
          }}
        >
          <MoreHorizontal size={17} />
        </button>
      </div>
      {c.displayMode !== "small" &&
        selected &&
        (touchMode
          ? ["ne", "nw", "se", "sw"]
          : address ||
              (c.kind === "text" && c.textAutoHeight) ||
              c.kind === "vscode"
            ? ["e", "w"]
            : ["n", "s", "e", "w", "ne", "nw", "se", "sw"]
        ).map((edge) => (
          <div
            key={edge}
            className={`card-resize resize-handle resize-${edge}`}
            data-testid={`card-resize-${edge}`}
            onPointerDown={(e) => resizeCard(e, c, edge)}
          />
        ))}
    </article>
  );
});

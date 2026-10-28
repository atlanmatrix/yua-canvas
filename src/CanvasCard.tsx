import React, { memo } from "react";
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
} from "lucide-react";
import type { Card, Task } from "./storage";
import { replaceBoard, type useCanvasWorkspace } from "./workspace";
import { cardRect, textSize, TEXT_MAX_WIDTH } from "./geometry";
import { isTextFile, isMarkdownFile, isPdfFile } from "./clipboard";
import { type Side, type Endpoint } from "./connections";
import { isApplicationKind } from "./appAssociations";
import { ApplicationCard } from "./ApplicationCard";
import { Attachment } from "./Attachment";
import { Diagram } from "./Markdown";
import { Miniature } from "./Miniature";
import { miniatureViewUrl } from "./miniatureScene";
import { NoteText } from "./NoteText";
import { TextEditor } from "./TextEditor";
import { TodoEditor } from "./TodoEditor";
import { GroupNameEditor } from "./GroupNameEditor";
import { PreviewFrame, Mask, TypeIcon, Remark } from "./CardPresentation";
import { TextFormatToolbar } from "./TextFormatToolbar";
import type { TextStyle } from "./presentation";
import { todoFocusAt } from "./todoCaret";
import { previewMetrics } from "./previewCache";
export type CanvasCardActions = {
  setBoard: ReturnType<typeof useCanvasWorkspace>["setBoard"];
  updateRoot: ReturnType<typeof useCanvasWorkspace>["updateRoot"];
  setMenu: (
    menu: {
      x: number;
      y: number;
      id: string;
      kind: "card" | "group" | "canvas";
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
  startConnection: (e: React.PointerEvent, endpoint: Endpoint) => void;
  runApplication: (card: Card) => void;
  copyCommands: (text: string) => void;
  openCard: (
    card: Card,
    task?: string,
    offset?: number,
    append?: boolean,
  ) => void;
  updateCards: (fn: (cards: Card[]) => Card[]) => void;
  navigateCanvas: (path: string[]) => void;
  changeText: (id: string, text: string) => void;
  changeTodo: (id: string, tasks: Task[]) => void;
  finishEditing: (id: string, cancelled?: boolean) => void;
  changeTextFormat: (id: string, style: TextStyle, color?: string) => void;
  downloadCard: (card: Card) => void;
};
const emptyOffsets: Record<string, { y: number; visible: boolean }> = {};
export const CanvasCard = memo(function CanvasCard({
  card: c,
  selected,
  editing,
  editingTask,
  editingTaskOffset,
  renaming,
  miniatureActive,
  preview3D,
  groupName,
  path,
  connectionTarget,
  taskOffsets = emptyOffsets,
  lastPointerMoved,
  actions,
}: {
  card: Card;
  selected: boolean;
  editing: boolean;
  editingTask?: string;
  editingTaskOffset?: number;
  renaming: boolean;
  miniatureActive: boolean;
  preview3D: boolean;
  groupName: string;
  path: string[];
  connectionTarget?: Endpoint;
  taskOffsets?: Record<string, { y: number; visible: boolean }>;
  lastPointerMoved: React.RefObject<boolean>;
  actions: CanvasCardActions;
}) {
  previewMetrics.cardRenders++;
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
    changeTextFormat,
    downloadCard,
  } = actions;
  const workspace = { updateRoot: actions.updateRoot };
  const activePort = (id: string, side: Side, task?: string) =>
    connectionTarget?.card === id &&
    connectionTarget.side === side &&
    connectionTarget.task === task;
  return (
    <article
      key={c.id}
      data-testid="card"
      data-card-id={c.id}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest(".canvas-editor")) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedGroup(undefined);
        setSelectedConnection(undefined);
        if (!selected) setSelection([c.id]);
        setMenu({
          x: e.clientX,
          y: e.clientY,
          id: c.id,
          kind: "card",
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
        (editing ? " canvas-editing" : "")
      }
      tabIndex={-1}
      aria-label={
        c.masked
          ? "已遮罩组件"
          : c.displayMode === "small"
            ? `${c.kind} 组件`
            : c.kind === "text"
              ? c.text.slice(0, 80)
              : c.kind === "mermaid"
                ? "Mermaid 图表"
                : c.title || "任务"
      }
      data-group-name={groupName || ""}
      style={{
        left: c.x,
        top: c.y,
        width: cardRect(c).width,
        height: cardRect(c).height,
        background: c.kind === "miniature" ? "transparent" : c.color,
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
          c.kind === "vscode" &&
          !lastPointerMoved.current &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.shiftKey &&
          e.detail < 2 &&
          !(e.target as Element).closest(".connection-port,.resize-handle")
        )
          runApplication(c);
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
        if (c.kind === "vscode") return;
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
      {c.masked ? (
        <Mask />
      ) : c.displayMode === "small" && !editing ? (
        <TypeIcon card={c} />
      ) : (
        <PreviewFrame card={c} editing={editing}>
          {c.kind !== "text" &&
            c.kind !== "image" &&
            c.kind !== "canvas" &&
            c.kind !== "miniature" &&
            c.kind !== "mermaid" &&
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
          {isApplicationKind(c.kind) ? (
            <ApplicationCard
              card={c}
              onOpen={(fromKeyboard) => {
                if (
                  c.kind !== "vscode" ||
                  fromKeyboard ||
                  !lastPointerMoved.current
                )
                  runApplication(c);
              }}
              onCopy={() => void copyCommands(c.text)}
            />
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
                  aria-label={`进入子画布 ${c.title}`}
                  title="进入子画布"
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
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
                    label="画布名称"
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
                  <span>{c.title || "子画布"}</span>
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
                onChange={(text) => changeText(c.id, text)}
                onFinish={(cancelled) => finishEditing(c.id, cancelled)}
              />
            ) : (
              <NoteText
                text={c.text}
                mode={c.textMode}
                textStyle={c.textStyle}
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
      {!c.masked && c.kind === "text" && editing && (
        <TextFormatToolbar
          style={c.textStyle}
          background={c.color}
          onChange={(style, color) => changeTextFormat(c.id, style, color)}
        />
      )}
      {(c.kind === "todo" ? ["n", "s"] : ["n", "e", "s", "w"]).map((value) => {
        const side = value as Side;
        return (
          <button
            key={side}
            className={`connection-port port-${side} ${activePort(c.id, side) ? "target-active" : ""}`}
            aria-label={`连接 ${c.masked || c.displayMode === "small" ? "组件" : c.title || c.text.slice(0, 20) || "任务"} ${side}`}
            data-port-card={c.id}
            data-port-side={side}
            onPointerDown={(e) => startConnection(e, { card: c.id, side })}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Plus size={12} />
          </button>
        );
      })}
      {!c.masked &&
        c.displayMode !== "small" &&
        c.kind === "todo" &&
        (c.tasks || []).flatMap((task, index) =>
          ["w", "e"].map((value) => {
            const side = value as Side,
              offset = taskOffsets[`${c.id}:${task.id}`];
            return (
              <button
                key={`${task.id}:${side}`}
                className={`connection-port task-port port-${side} ${activePort(c.id, side, task.id) ? "target-active" : ""}`}
                style={{
                  top: (offset?.y ?? 54 + index * 32) - 1,
                  visibility: offset && !offset.visible ? "hidden" : undefined,
                }}
                aria-label={`连接任务 ${task.text} ${side}`}
                data-port-card={c.id}
                data-port-side={side}
                data-port-task={task.id}
                onPointerDown={(e) =>
                  startConnection(e, {
                    card: c.id,
                    task: task.id,
                    side,
                  })
                }
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Plus size={12} />
              </button>
            );
          }),
        )}
      {!c.masked && c.displayMode !== "small" && c.kind === "text" && (
        <button
          className="text-display-toggle"
          aria-label={
            c.textMode === "scroll" ? "切换为换行模式" : "切换为滚动模式"
          }
          title={c.textMode === "scroll" ? "换行" : "滚动"}
          aria-pressed={c.textMode === "scroll"}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
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
      {!c.masked && c.displayMode !== "small" && !isApplicationKind(c.kind) && (
        <button
          className="card-download"
          aria-label={`下载 ${c.title || (c.kind === "todo" ? "任务" : c.kind === "mermaid" ? "Mermaid" : "文本")}`}
          title="下载"
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
      {c.displayMode !== "small" &&
        selected &&
        ((c.kind === "text" && c.textAutoHeight) || c.kind === "vscode"
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

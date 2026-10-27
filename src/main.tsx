import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ListTodo,
  Box,
  PanelsTopLeft,
  ArrowLeft,
  Pencil,
  Plus,
  ArrowUpRight,
  Upload,
  Download,
  Type,
  ImagePlus,
  FileUp,
  Minus,
  Maximize,
  Folder,
  FolderUp,
  WrapText,
  ArrowLeftRight,
  Check,
  Copy,
  Scissors,
  Pin,
  ClipboardPaste,
  X,
  Trash2,
  FileText,
  MoreHorizontal,
  Unlink,
} from "lucide-react";
import {
  type Board,
  type Card,
  type Task,
  type Rect,
  type Group,
  attachParents,
  groupTreeIds,
  groupDepth,
  groupBounds,
  containingGroup,
  emptyBoard,
  readBoard,
  saveBoard,
  readCanvasClipboard,
  saveCanvasClipboard,
  readView,
  readNavigation,
  exportBoard,
} from "./storage";
import {
  exportWorkspace,
  readCanvasImport,
  workspaceCounts,
  type CanvasImport,
} from "./workspaceBackup";
import { Markdown } from "./Markdown";
import { NoteText, linkTarget } from "./NoteText";
import { TextEditor } from "./TextEditor";
import { TodoEditor } from "./TodoEditor";
import { TextFileEditor } from "./TextFileEditor";
import {
  CanvasContextMenu,
  ContextSubmenu,
  ColorPalette,
  MenuSection,
} from "./CanvasContextMenu";
import { ConnectionView } from "./ConnectionView";
import { cardsFromFiles } from "./files";
import { archiveSelection, createArchive, isZip, readArchive } from "./archive";
import {
  clipboardCopy,
  canvasClipboard,
  FileClipboardUnsupported,
  isTextFile,
} from "./clipboard";
import {
  useCanvasWorkspace,
  newBoard,
  canvasCard,
  replaceBoard,
} from "./workspace";
import {
  selectedFragment,
  duplicateFragment,
  type Fragment,
} from "./fragments";
import {
  cardRect,
  textSize,
  TEXT_MAX_WIDTH,
  settleGroups,
  adjacentCard,
  type ArrowDirection,
} from "./geometry";
import { cardDownload } from "./downloads";
import { type Endpoint, type Side, endpointPoint, curve } from "./connections";
import { useAutosave } from "./autosave";
import { ConnectionArrow } from "./ConnectionArrow";
import {
  captureTransfer,
  directoriesFragment,
  nodesFromFiles,
  type ImportNode,
} from "./directories";
import { CanvasOverview } from "./CanvasOverview";
import { Canvas3D } from "./Canvas3D";
import { PinBar } from "./PinBar";
import { HelpDialog } from "./HelpDialog";
import { type PinnedItem } from "./pins";
import { useMinimapGeometry } from "./minimapGeometry";
import "./style.css";
import { PwaControls } from "./PwaControls";
import { registerPwa } from "./pwa";
void registerPwa();
import { CloudPanel } from "./CloudPanel";
import { ShareViewer } from "./ShareViewer";
import { Miniature, MiniatureDialog } from "./Miniature";
import { miniatureViewUrl } from "./miniatureScene";
const uid = () => crypto.randomUUID();
const colors = ["#ffffff"];
function Attachment({ card, large = false }: { card: Card; large?: boolean }) {
  const [asset, setAsset] = useState<{
      url: string;
      blob: Blob;
      mime?: string;
    }>(),
    [fileText, setFileText] = useState("");
  const url =
    asset && asset.blob === card.blob && asset.mime === card.mime
      ? asset.url
      : "";
  useEffect(() => {
    if (!card.blob || !isTextFile(card)) return;
    let active = true;
    const limit = large ? 1024 * 1024 : 64 * 1024;
    card.blob
      .slice(0, limit)
      .arrayBuffer()
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        const encoding =
          bytes[0] === 255 && bytes[1] === 254
            ? "utf-16le"
            : bytes[0] === 254 && bytes[1] === 255
              ? "utf-16be"
              : "utf-8";
        const text = new TextDecoder(encoding).decode(bytes, {
          stream: card.blob!.size > limit,
        });
        if (active) setFileText(text);
      })
      .catch(() => {
        if (active) setFileText("");
      });
    return () => {
      active = false;
    };
  }, [large, card.blob, card.mime, card.title]);
  useEffect(() => {
    if (!card.blob) return;
    // The stored Blob type is preserved independently of the declared preview
    // type. Always give the PDF viewer a PDF URL, including mismatched imports.
    const preview =
      card.mime === "application/pdf"
        ? card.blob.slice(0, card.blob.size, "application/pdf")
        : card.blob;
    const u = URL.createObjectURL(preview);
    setAsset({ url: u, blob: card.blob, mime: card.mime });
    return () => URL.revokeObjectURL(u);
  }, [card.blob, card.mime]);
  if (!large && card.kind === "file" && isTextFile(card))
    return (
      <pre
        className="file-content-thumbnail"
        aria-label={`${card.title} 内容预览`}
      >
        {fileText}
      </pre>
    );
  if (
    large &&
    (/\.(md|markdown|mdown)$/i.test(card.title) ||
      card.mime === "text/markdown")
  )
    return <Markdown>{fileText}</Markdown>;
  if (large && fileText)
    return (
      <pre className="file-text">
        {fileText}
        {(card.blob?.size || 0) > 1024 * 1024
          ? "\n…（仅预览前 1 MB，完整内容请下载）"
          : ""}
      </pre>
    );
  if (card.kind === "image")
    return (
      <img
        className={large ? "detail-image" : "thumbnail"}
        src={url || undefined}
        alt={card.title}
      />
    );
  if (large && card.mime === "application/pdf")
    return <iframe title={card.title} src={url || undefined} className="pdf" />;
  if (large && card.mime?.startsWith("video/"))
    return <video controls src={url || undefined} />;
  if (large && card.mime?.startsWith("audio/"))
    return <audio controls src={url || undefined} />;
  return (
    <div className="file-preview">
      <FileText size={large ? 64 : 38} />
      <span>{card.title.split(".").pop()?.toUpperCase() || "FILE"}</span>
      <small>{((card.blob?.size || 0) / 1024).toFixed(1)} KB</small>
    </div>
  );
}
function GroupNameEditor({
  name,
  onSave,
  onCancel,
  label = "分组名称",
}: {
  name: string;
  label?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name),
    finished = useRef(false);
  const save = () => {
    if (finished.current) return;
    finished.current = true;
    if (value.trim()) onSave(value.trim());
    else onCancel();
  };
  return (
    <input
      className="group-name-editor"
      aria-label={label}
      autoFocus
      maxLength={200}
      value={value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={save}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          finished.current = true;
          onCancel();
        }
      }}
    />
  );
}
function App({ preview3D = false }: { preview3D?: boolean }) {
  const workspace = useCanvasWorkspace();
  const {
    board,
    root,
    path,
    names,
    navigation,
    view,
    setView,
    setBoard,
    restore,
    begin,
    end,
    undo,
    redo,
    cancel,
  } = workspace;
  const latestWorkspace = useRef({ root, view, navigation });
  latestWorkspace.current = { root, view, navigation };
  const [dragCursor, setDragCursor] = useState(false);
  const [linkModifier, setLinkModifier] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [pending3DOpen, setPending3DOpen] = useState<{
    path: string[];
    card: string;
  }>();
  const [linkDraft, setLinkDraft] = useState<{
      from: Endpoint;
      to?: Endpoint;
      point: { x: number; y: number };
    } | null>(null),
    [selectedConnection, setSelectedConnection] = useState<string>(),
    [taskOffsets, setTaskOffsets] = useState<
      Record<string, { y: number; visible: boolean }>
    >({});
  const [selectedGroup, setSelectedGroup] = useState<string>(),
    [editingGroup, setEditingGroup] = useState<string>(),
    [menu, setMenu] = useState<{
      x: number;
      y: number;
      id: string;
      kind: "card" | "group" | "canvas";
    } | null>(null);
  const internalCopy = useRef<{
    token: string;
    fragment: Fragment;
    offset: number;
  } | null>(null);
  const [ready, setReady] = useState(false),
    [saveStatus, setSaveStatus] = useState("正在读取"),
    [selection, setSelection] = useState<string[]>([]),
    [tool, setTool] = useState<"select" | "hand">("select"),
    [detail, setDetail] = useState<string>(),
    [miniatureDraft, setMiniatureDraft] = useState<Card>(),
    [activeMiniature, setActiveMiniature] = useState<string>(),
    [renamingCanvas, setRenamingCanvas] = useState<string>(),
    [editingCard, setEditingCard] = useState<string>(),
    [editingTask, setEditingTask] = useState<string>(),
    [groupDialog, setGroupDialog] = useState<{
      name: string;
      id?: string;
    } | null>(null),
    [createPreview, setCreatePreview] = useState<{
      kind: Card["kind"];
      x: number;
      y: number;
    } | null>(null),
    [copyFiles, setCopyFiles] = useState<Card[]>([]),
    [toast, setToast] = useState(""),
    [confirmImport, setConfirmImport] = useState<CanvasImport | null>(null),
    [importBusy, setImportBusy] = useState(false),
    [marquee, setMarquee] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null);
  const editSession = useRef<{
    id: string;
    value: string;
    original: string;
    tasks?: Task[];
    hasContent: boolean;
    fresh: boolean;
  } | null>(null);
  const surface = useRef<HTMLDivElement>(null),
    connectionEditors = useRef<HTMLDivElement>(null),
    connectionLabels = useRef<SVGSVGElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    directoryInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    pendingUpload = useRef<{ x: number; y: number } | undefined>(undefined),
    suppressToolbarClick = useRef(false),
    gesture = useRef<{
      kind: "pan" | "move" | "select" | "resize" | "create" | "link";
      from?: Endpoint;
      createKind?: Card["kind"];
      button?: number;
      link?: string;
      toggleCard?: string;
      context?: { id: string; kind: "card" | "group" | "canvas" };
      groupId?: string;
      groupIds?: Set<string>;
      groups?: Group[];
      bounds?: Rect;
      edge?: string;
      cardId?: string;
      x: number;
      y: number;
      view: typeof view;
      cards: Card[];
      ids: string[];
      startX: number;
      startY: number;
      moved: boolean;
    } | null>(null),
    space = useRef(false);
  const latestBoard = useRef(board);
  latestBoard.current = board;
  const clipboardBusy = useRef(false);
  const activeCanvasKey = useRef(board.id || "");
  activeCanvasKey.current = board.id || "";
  const { viewport, projection } = useMinimapGeometry(board, view, surface);
  const cancelGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    setDragCursor(false);
    setMarquee(null);
    setCreatePreview(null);
    setLinkDraft(null);
    if (g?.kind === "create") suppressToolbarClick.current = true;
    if (g?.moved && (g.kind === "move" || g.kind === "resize"))
      setBoard((b) => settleGroups(b, g.groupId ? [] : g.ids));
    if (g) end();
  };
  useLayoutEffect(() => {
    const el = surface.current;
    if (!el) return;
    const measure = () => {
      const next: Record<string, { y: number; visible: boolean }> = {};
      el.querySelectorAll<HTMLElement>(".card-todo").forEach((card) => {
        const box = card.getBoundingClientRect(),
          list = card.querySelector(".todo-list")!.getBoundingClientRect();
        card.querySelectorAll<HTMLElement>("[data-task-id]").forEach((row) => {
          const r = row.getBoundingClientRect(),
            center = (r.top + r.bottom) / 2;
          next[`${card.dataset.cardId}:${row.dataset.taskId}`] = {
            y: Math.max(
              8,
              Math.min(box.height / view.z - 8, (center - box.top) / view.z),
            ),
            visible: center >= list.top && center <= list.bottom,
          };
        });
      });
      setTaskOffsets((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    el.querySelectorAll(".card-todo,.todo-list,[data-task-id]").forEach((row) =>
      observer.observe(row),
    );
    el.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure, true);
    };
  }, [board.cards, view.z]);
  const notify = (message: string) => {
    setCopyFiles([]);
    setToast(message);
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), copyFiles.length ? 15000 : 4000);
    return () => clearTimeout(t);
  }, [toast, copyFiles.length]);
  useEffect(() => {
    Promise.all([
      readBoard(),
      readView(),
      readNavigation(),
      readCanvasClipboard(),
    ])
      .then(([b, savedView, savedNavigation, clipboard]) => {
        if (clipboard) internalCopy.current = clipboard;
        restore(b || emptyBoard, savedView, savedNavigation);
        setReady(true);
        setSaveStatus("已保存至本地");
      })
      .catch(() => {
        setSaveStatus("本地存储不可用");
        notify("无法读取浏览器存储，请检查浏览器设置后刷新。");
      });
  }, []);
  useAutosave(root, view, ready && !importBusy, setSaveStatus, navigation);
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        (gesture.current?.kind === "pan" && gesture.current.button === 2)
      )
        e.preventDefault();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const inputs = [fileInput.current, imageInput.current];
    const cancel = () => {
      pendingUpload.current = undefined;
    };
    inputs.forEach((input) => input?.addEventListener("cancel", cancel));
    return () =>
      inputs.forEach((input) => input?.removeEventListener("cancel", cancel));
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".context-menu")) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);
  const dissolveGroup = (id: string) => {
    setBoard((b) => {
      const parent = b.groups.find((g) => g.id === id)?.parent;
      return {
        ...b,
        groups: attachParents(b.groups.filter((g) => g.id !== id)),
        cards: b.cards.map((c) =>
          c.group === id ? { ...c, group: parent } : c,
        ),
      };
    });
    setSelectedGroup(undefined);
    setMenu(null);
  };
  const updateCards = (fn: (cards: Card[]) => Card[]) =>
    setBoard((b) => ({ ...b, cards: fn(b.cards) }));
  const deleteItems = (ids: string[], groupId?: string) => {
    const family = groupId ? groupTreeIds(board.groups, groupId) : undefined;
    const cardIds = new Set(ids);
    setBoard((b) => ({
      ...b,
      groups: family
        ? b.groups.filter((group) => !family.has(group.id))
        : b.groups,
      cards: b.cards.filter(
        (card) =>
          !cardIds.has(card.id) && (!card.group || !family?.has(card.group)),
      ),
    }));
    setSelection([]);
    setSelectedGroup(undefined);
    setSelectedConnection(undefined);
    setMenu(null);
  };
  const removeSelected = () => {
    if (selectedConnection) {
      setBoard((b) => ({
        ...b,
        connections: b.connections?.filter(
          (connection) => connection.id !== selectedConnection,
        ),
      }));
      setSelectedConnection(undefined);
      setMenu(null);
    } else if (selectedGroup || selection.length)
      deleteItems(selectedGroup ? [] : selection, selectedGroup);
  };
  const center = () => {
    const r = surface.current!.getBoundingClientRect();
    const p = {
      x: (r.width / 2 - view.x) / view.z - 120,
      y: (r.height / 2 - view.y) / view.z - 100,
    };
    return p;
  };
  const addNodes = async (
    nodes: ImportNode[],
    point?: { x: number; y: number },
  ) => {
    if (!nodes.length) throw Error("浏览器未提供目录内容，请使用导入目录");
    const p = point || center();
    const destination = board.id || "";
    try {
      const incoming = nodes.flatMap((node) =>
        node.kind === "file" ? [node.file] : [],
      );
      const directories = nodes.filter(
        (node): node is Extract<ImportNode, { kind: "directory" }> =>
          node.kind === "directory",
      );
      const archives = incoming.filter(isZip);
      const next = await cardsFromFiles(
        incoming.filter((f) => !isZip(f)),
        p,
      );
      const fragments = await Promise.all(
        archives.map((file) => readArchive(file, p)),
      );
      if (directories.length)
        fragments.push({
          ...(await directoriesFragment(
            directories,
            next.length
              ? {
                  x:
                    Math.max(
                      ...next.map((card) => card.x + cardRect(card).width),
                    ) + 32,
                  y: p.y,
                }
              : p,
          )),
          hasMetadata: false,
        });
      let added: string[] = [];
      let directoryGroup: string | undefined;
      let imported: Board | undefined;
      setBoard(
        (b) => {
          let updated = {
            ...b,
            cards: [
              ...b.cards,
              ...next.map((c) => ({
                ...c,
                group: containingGroup(c, b.groups),
              })),
            ],
          };
          added = next.map((c) => c.id);
          for (const fragment of fragments) {
            const result = duplicateFragment(
              updated,
              fragment,
              0,
              fragment.hasMetadata,
            );
            updated = result.board;
            added.push(...result.cards);
            if (nodes.length === 1 && directories.length === 1)
              directoryGroup = result.group;
          }
          imported = updated;
          return updated;
        },
        { preserveLayout: fragments.some((fragment) => fragment.hasMetadata) },
      );
      if (activeCanvasKey.current !== destination) return;
      setSelection(directoryGroup ? [] : added);
      setSelectedGroup(directoryGroup);
      if ((archives.length || directories.length) && imported)
        fit(imported.cards, imported.groups, directories.length > 0);
      notify(`已添加 ${added.length} 个元素`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "文件导入失败");
    }
  };
  const addFiles = async (
    files: FileList | File[] | null,
    point?: { x: number; y: number },
  ) => {
    if (!files?.length) return;
    try {
      await addNodes(nodesFromFiles(Array.from(files)), point);
    } catch (error) {
      notify(error instanceof Error ? error.message : "目录读取失败");
    }
  };
  const addTransfer = async (
    nodes: Promise<ImportNode[]>,
    point?: { x: number; y: number },
  ) => {
    try {
      await addNodes(await nodes, point);
    } catch (error) {
      notify(error instanceof Error ? error.message : "目录读取失败");
    }
  };
  const pasteClipboard = (
    clipboard: DataTransfer,
    point?: { x: number; y: number },
  ) => {
    const marker = new DOMParser()
      .parseFromString(clipboard.getData("text/html"), "text/html")
      .querySelector("[data-yua-copy]")
      ?.getAttribute("data-yua-copy");
    if (internalCopy.current && marker === internalCopy.current.token) {
      const fragment = internalCopy.current.fragment;
      const positions = [
        ...fragment.cards,
        ...fragment.groups.flatMap((g) => (g.bounds ? [g.bounds] : [])),
      ];
      const offset = point
        ? {
            x: point.x - Math.min(...positions.map((p) => p.x)),
            y: point.y - Math.min(...positions.map((p) => p.y)),
          }
        : internalCopy.current.offset;
      const result = duplicateFragment(latestBoard.current, fragment, offset);
      internalCopy.current.offset += 30;
      setBoard(result.board);
      if (result.group && !point) {
        const family = groupTreeIds(result.board.groups, result.group);
        fit(
          result.board.cards.filter((c) => result.cards.includes(c.id)),
          result.board.groups.filter((g) => family.has(g.id)),
        );
      }
      setSelection(result.group ? [] : result.cards);
      setSelectedGroup(result.group);
      notify("已粘贴");
      return true;
    }
    const transfer = captureTransfer(clipboard);
    if (transfer.hasFiles) {
      void addTransfer(transfer.nodes, point);
      return true;
    }
    const text = clipboard.getData("text/plain");
    if (!text.trim()) return false;
    const id = uid();
    setBoard((b) => ({
      ...b,
      cards: [
        ...b.cards,
        {
          id,
          kind: "text",
          title: "",
          text,
          color: colors[0],
          ...(point || center()),
          ...textSize(text),
          textMode: "wrap",
          textAutoHeight: true,
        },
      ],
    }));
    setSelection([id]);
    setSelectedGroup(undefined);
    return true;
  };
  const pasteFromMenu = async (point: { x: number; y: number }) => {
    const destination = activeCanvasKey.current;
    setMenu(null);
    try {
      if (!navigator.clipboard?.read) throw Error("当前浏览器不支持读取剪贴板");
      const items = await navigator.clipboard.read();
      const data = new DataTransfer();
      for (const item of items) {
        for (const type of ["text/plain", "text/html"]) {
          if (item.types.includes(type))
            data.setData(type, await (await item.getType(type)).text());
        }
        const type = item.types.includes("image/png")
          ? "image/png"
          : item.types.find((t) => !["text/plain", "text/html"].includes(t));
        if (type) {
          const blob = await item.getType(type);
          data.items.add(
            new File(
              [blob],
              type === "image/png" ? "粘贴图片.png" : "粘贴附件",
              { type },
            ),
          );
        }
      }
      if (activeCanvasKey.current !== destination) return;
      if (!pasteClipboard(data, point)) notify("剪贴板没有可粘贴的内容");
    } catch {
      notify("无法读取剪贴板，请允许访问，或使用 ⌘/Ctrl + V 粘贴");
    }
  };
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target;
      if (
        !ready ||
        preview3D ||
        document.querySelector('[role="dialog"]') ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest(
              'input, textarea, [contenteditable]:not([contenteditable="false"])',
            )))
      )
        return;
      if (event.clipboardData && pasteClipboard(event.clipboardData))
        event.preventDefault();
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [ready, addFiles, board, preview3D]);
  const finishEditing = (id: string, cancelled = false) => {
    const session = editSession.current;
    if (!session || session.id !== id) return;
    editSession.current = null;
    setEditingCard(undefined);
    const tasks = session.tasks
      ?.filter((task) => task.text.trim())
      .map((task) => ({ ...task, text: task.text.trim() }));
    const value = tasks ? JSON.stringify(tasks) : session.value;
    if (
      cancelled ||
      (session.fresh ? !session.hasContent : value === session.original)
    ) {
      cancel();
      if (session.fresh) setSelection([]);
    } else {
      if (tasks)
        updateCards((cards) =>
          cards.map((card) => (card.id === id ? { ...card, tasks } : card)),
        );
      end();
    }
  };
  const editCard = (card: Card, fresh = false, task?: string) => {
    if (editSession.current) finishEditing(editSession.current.id);
    begin();
    if (fresh)
      setBoard((b) => ({
        ...b,
        cards: [
          ...b.cards,
          { ...card, group: containingGroup(card, b.groups) },
        ],
      }));
    const tasks = card.kind === "todo" ? card.tasks || [] : undefined;
    const value = tasks ? JSON.stringify(tasks) : card.text;
    editSession.current = {
      id: card.id,
      value,
      original: value,
      tasks,
      hasContent: tasks
        ? tasks.some((task) => !!task.text.trim())
        : !!card.text.trim(),
      fresh,
    };
    setEditingCard(card.id);
    setEditingTask(task);
    setSelection([card.id]);
    setSelectedGroup(undefined);
    setSelectedConnection(undefined);
    setMenu(null);
  };
  const addText = (point?: { x: number; y: number }) => {
    editCard(
      {
        id: uid(),
        kind: "text",
        title: "",
        text: "",
        color: colors[0],
        ...(point || center()),
        ...textSize(""),
        textMode: "wrap",
        textAutoHeight: true,
      },
      true,
    );
  };
  const changeText = (id: string, text: string) => {
    if (editSession.current?.id !== id) return;
    editSession.current.value = text;
    editSession.current.hasContent = !!text.trim();
    updateCards((cards) =>
      cards.map((card) =>
        card.id === id
          ? {
              ...card,
              text,
              ...textSize(text, card.textMode, card.width || TEXT_MAX_WIDTH),
              textAutoHeight: true,
            }
          : card,
      ),
    );
  };
  const changeTodo = (id: string, tasks: Task[]) => {
    if (editSession.current?.id !== id) return;
    editSession.current.tasks = tasks;
    editSession.current.value = JSON.stringify(tasks);
    editSession.current.hasContent = tasks.some((task) => !!task.text.trim());
    updateCards((cards) =>
      cards.map((card) => (card.id === id ? { ...card, tasks } : card)),
    );
  };
  const clearCanvasUI = () => {
    if (editSession.current) finishEditing(editSession.current.id);
    cancelGesture();
    setSelection([]);
    setSelectedGroup(undefined);
    setSelectedConnection(undefined);
    setMenu(null);
    setDetail(undefined);
    setMiniatureDraft(undefined);
    setActiveMiniature(undefined);
    setEditingGroup(undefined);
    setRenamingCanvas(undefined);
    setGroupDialog(null);
    setConfirmImport(null);
    setToast("");
  };
  const navigateCanvas = (next: string[]) => {
    clearCanvasUI();
    workspace.navigate(next);
  };
  const addCanvas = (point = center()) => {
    const card = canvasCard(newBoard(), "子画布", point);
    setBoard((b) => ({
      ...b,
      cards: [...b.cards, { ...card, group: containingGroup(card, b.groups) }],
    }));
    setSelection([card.id]);
    setSelectedGroup(undefined);
    setMenu(null);
  };
  const createFromMenu = (kind: Card["kind"] | "group") => {
    if (!menu || !ready || !surface.current) return;
    const rect = surface.current.getBoundingClientRect();
    const point = {
      x: (menu.x - rect.left - view.x) / view.z,
      y: (menu.y - rect.top - view.y) / view.z,
    };
    setMenu(null);
    if (kind === "text") addText(point);
    else if (kind === "todo") addTodo(point);
    else if (kind === "canvas") addCanvas(point);
    else if (kind === "miniature") addMiniature(point);
    else if (kind === "group") {
      const id = uid();
      setBoard((b) => ({
        ...b,
        groups: attachParents([
          ...b.groups,
          { id, name: "分组", bounds: { ...point, width: 360, height: 240 } },
        ]),
      }));
      setSelection([]);
      setSelectedGroup(id);
      setSelectedConnection(undefined);
      setEditingGroup(id);
    } else {
      pendingUpload.current = point;
      (kind === "image" ? imageInput : fileInput).current?.click();
    }
  };
  const createParentCanvas = () => {
    if (!workspace.canCreateParent) return;
    clearCanvasUI();
    workspace.wrapParent();
  };
  const addMiniature = (point?: { x: number; y: number }) => {
    const middle = center();
    setMiniatureDraft({
      id: "",
      kind: "miniature",
      title: "",
      text: "",
      color: colors[0],
      width: 640,
      height: 520,
      ...(point || { x: middle.x - 200, y: middle.y - 205 }),
    });
    setMenu(null);
  };
  const openCard = (card: Card, task?: string) => {
    if (card.kind === "canvas") navigateCanvas([...path, card.id]);
    else if (card.kind === "miniature") setActiveMiniature(card.id);
    else if (card.kind === "text" || card.kind === "todo")
      editCard(card, false, task);
    else setDetail(card.id);
  };
  const addTodo = (point?: { x: number; y: number }) => {
    editCard(
      {
        id: uid(),
        kind: "todo",
        title: "",
        text: "",
        color: colors[0],
        tasks: [{ id: uid(), text: "", done: false }],
        ...(point || center()),
      },
      true,
    );
  };
  const closePreview3D = () => {
    history.replaceState(null, "", location.pathname + location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  useEffect(() => {
    if (
      preview3D ||
      !ready ||
      !pending3DOpen ||
      JSON.stringify(path) !== JSON.stringify(pending3DOpen.path)
    )
      return;
    setPending3DOpen(undefined);
    const card = board.cards.find((c) => c.id === pending3DOpen.card);
    if (!card) return;
    const r = cardRect(card),
      viewport = surface.current?.getBoundingClientRect();
    if (viewport) {
      const z = Math.max(
        0.2,
        Math.min(
          1,
          (viewport.width - 120) / r.width,
          (viewport.height - 170) / r.height,
        ),
      );
      setView({
        z,
        x: viewport.width / 2 - (r.x + r.width / 2) * z,
        y: viewport.height / 2 - (r.y + r.height / 2) * z,
      });
    }
    setSelection([card.id]);
    openCard(card);
  }, [preview3D, ready, pending3DOpen, board, JSON.stringify(path)]);
  const zoom = (factor: number) => {
    const r = surface.current!.getBoundingClientRect();
    setView((v) => {
      const z = Math.min(3, Math.max(0.2, v.z * factor));
      return {
        z,
        x: r.width / 2 - ((r.width / 2 - v.x) * z) / v.z,
        y: r.height / 2 - ((r.height / 2 - v.y) * z) / v.z,
      };
    });
  };
  const fit = (
    cards = board.cards,
    groups = board.groups,
    includeEmpty = false,
  ) => {
    const grouped = cards.filter((card) => card.group);
    const frames = groups
      .filter(
        (g) =>
          g.bounds &&
          (includeEmpty ||
            !grouped.length ||
            grouped.some((card) =>
              groupTreeIds(groups, g.id).has(card.group!),
            )),
      )
      .map((g) => g.bounds!);
    const rects = [...cards.map(cardRect), ...frames];
    if (!rects.length) {
      setView({ x: 65, y: 55, z: 1 });
      return;
    }
    const r = surface.current!.getBoundingClientRect();
    const left = Math.min(...rects.map((c) => c.x)),
      top = Math.min(...rects.map((c) => c.y)),
      right = Math.max(...rects.map((c) => c.x + c.width)),
      bottom = Math.max(...rects.map((c) => c.y + c.height));
    const z = Math.min(
      1.2,
      Math.max(
        0.2,
        Math.min(
          (r.width - 120) / (right - left),
          (r.height - 150) / (bottom - top),
        ),
      ),
    );
    setView({
      z,
      x: (r.width - (right - left) * z) / 2 - left * z,
      y: (r.height - (bottom - top) * z) / 2 - top * z,
    });
  };
  const visible = board.cards;
  const pointerDown = (
    e: React.PointerEvent,
    id?: string,
    groupId?: string,
  ) => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    const modifierPan =
      e.button === 2 || (e.button === 0 && (e.ctrlKey || e.metaKey));
    if (
      (e.target as HTMLElement).closest("button,input,textarea,label") &&
      !groupId &&
      !modifierPan
    )
      return;
    if (e.button === 1 || modifierPan) e.preventDefault();
    const r = surface.current!.getBoundingClientRect();
    const pan =
      tool === "hand" || space.current || e.button === 1 || modifierPan;
    let ids = selection;
    const family = groupId ? groupTreeIds(board.groups, groupId) : undefined;
    if (!pan) setSelectedConnection(undefined);
    if (groupId && !pan) {
      ids = board.cards
        .filter((c) => c.group && family!.has(c.group))
        .map((c) => c.id);
      setSelection([]);
      setSelectedGroup(groupId);
    } else if (id && !pan) {
      setSelectedGroup(undefined);
      if (e.shiftKey) {
        ids = selection.includes(id)
          ? selection.filter((v) => v !== id)
          : [...selection, id];
      } else if (!selection.includes(id)) ids = [id];
      setSelection(ids);
    } else if (!pan && !e.shiftKey) {
      setSelection([]);
      setSelectedGroup(undefined);
    }
    const x = (e.clientX - r.left - view.x) / view.z,
      y = (e.clientY - r.top - view.y) / view.z;
    const target = e.target as Element,
      cardTarget = target.closest("[data-card-id]"),
      groupTarget = target.closest(".group-title")?.closest("[data-group-id]"),
      link =
        e.button === 0 && (e.ctrlKey || e.metaKey)
          ? target.closest<HTMLAnchorElement>("a.note-link")?.href
          : undefined;
    gesture.current = {
      kind: pan ? "pan" : id || groupId ? "move" : "select",
      button: e.button,
      link,
      toggleCard:
        e.button === 0 &&
        (e.ctrlKey || e.metaKey) &&
        !link &&
        tool !== "hand" &&
        !space.current &&
        !target.closest("button,input,textarea,label,.resize-handle")
          ? cardTarget?.getAttribute("data-card-id") || undefined
          : undefined,
      context: cardTarget
        ? { id: cardTarget.getAttribute("data-card-id")!, kind: "card" }
        : groupTarget
          ? { id: groupTarget.getAttribute("data-group-id")!, kind: "group" }
          : e.button === 2
            ? { id: "", kind: "canvas" }
            : undefined,
      x: e.clientX,
      y: e.clientY,
      view,
      cards: board.cards,
      ids: pan ? [] : id || groupId ? ids : e.shiftKey ? selection : [],
      startX: x,
      startY: y,
      moved: false,
      groupId: !pan ? groupId : undefined,
      groupIds: !pan ? family : undefined,
      groups: board.groups,
      bounds: groupId
        ? board.groups.find((g) => g.id === groupId)?.bounds
        : undefined,
    };
    setDragCursor(pan || !!id || !!groupId);
    if (!pan && (id || groupId)) begin();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const resizeGroup = (
    e: React.PointerEvent,
    groupId: string,
    bounds: Rect,
    edge: string,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    begin();
    gesture.current = {
      kind: "resize",
      groupId,
      bounds,
      edge,
      x: e.clientX,
      y: e.clientY,
      view,
      cards: board.cards,
      ids: [],
      startX: 0,
      startY: 0,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const resizeCard = (e: React.PointerEvent, c: Card, edge: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    begin();
    gesture.current = {
      kind: "resize",
      cardId: c.id,
      bounds: cardRect(c),
      edge,
      x: e.clientX,
      y: e.clientY,
      view,
      cards: board.cards,
      ids: [c.id],
      startX: 0,
      startY: 0,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const nearbyPort = (
    x: number,
    y: number,
    from: Endpoint,
  ): Endpoint | undefined => {
    let nearest: Endpoint | undefined,
      distance = 24;
    surface.current
      ?.querySelectorAll<HTMLElement>("[data-port-card]")
      .forEach((port) => {
        if (
          port.dataset.portCard === from.card ||
          getComputedStyle(port).visibility === "hidden"
        )
          return;
        const r = port.getBoundingClientRect();
        const d = Math.hypot(
          x - (r.left + r.width / 2),
          y - (r.top + r.height / 2),
        );
        if (
          d < distance &&
          document
            .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            ?.closest("[data-port-card]") === port
        ) {
          distance = d;
          nearest = {
            card: port.dataset.portCard!,
            side: port.dataset.portSide as Side,
            task: port.dataset.portTask || undefined,
          };
        }
      });
    return nearest;
  };
  const activePort = (card: string, side: Side, task?: string) =>
    linkDraft?.to?.card === card &&
    linkDraft.to.side === side &&
    linkDraft.to.task === task;
  const startConnection = (e: React.PointerEvent, from: Endpoint) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedConnection(undefined);
    setSelection([]);
    setSelectedGroup(undefined);
    setLinkDraft({
      from,
      point: endpointPoint(from, board.cards, taskOffsets),
    });
    gesture.current = {
      kind: "link",
      from,
      x: e.clientX,
      y: e.clientY,
      view,
      cards: board.cards,
      ids: [],
      startX: 0,
      startY: 0,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const startToolbarDrag = (e: React.PointerEvent, kind: Card["kind"]) => {
    if (e.button !== 0 || !ready) return;
    suppressToolbarClick.current = false;
    setDragCursor(true);
    gesture.current = {
      kind: "create",
      createKind: kind,
      x: e.clientX,
      y: e.clientY,
      view,
      cards: board.cards,
      ids: [],
      startX: 0,
      startY: 0,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const toolbarClick = (action: () => void) => {
    if (!suppressToolbarClick.current) action();
    suppressToolbarClick.current = false;
  };
  const pointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
    if (g.kind === "link" && g.from) {
      const r = surface.current!.getBoundingClientRect();
      const to = nearbyPort(e.clientX, e.clientY, g.from);
      setLinkDraft({
        from: g.from,
        to,
        point: to
          ? endpointPoint(to, board.cards, taskOffsets)
          : {
              x: (e.clientX - r.left - view.x) / view.z,
              y: (e.clientY - r.top - view.y) / view.z,
            },
      });
      return;
    }
    if (g.kind === "create" && g.moved) {
      suppressToolbarClick.current = true;
      setCreatePreview({ kind: g.createKind!, x: e.clientX, y: e.clientY });
    }
    if (g.kind === "pan" && ((g.button !== 2 && !g.toggleCard) || g.moved))
      setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    if (g.kind === "resize" && g.cardId && g.bounds) {
      const original = g.cards.find((c) => c.id === g.cardId)!;
      const b = g.bounds,
        edge = g.edge!;
      let width = Math.max(
        64,
        Math.min(
          original.kind === "text" ? TEXT_MAX_WIDTH : 8000,
          b.width +
            (edge.includes("e")
              ? dx / g.view.z
              : edge.includes("w")
                ? -dx / g.view.z
                : 0),
        ),
      );
      let height = Math.max(
        32,
        b.height +
          (edge.includes("s")
            ? dy / g.view.z
            : edge.includes("n")
              ? -dy / g.view.z
              : 0),
      );
      if (original.kind === "image") {
        const ratio = b.width / b.height;
        if (edge === "n" || edge === "s") width = height * ratio;
        else height = width / ratio;
      }
      if (original.kind === "text" && original.textAutoHeight)
        height = textSize(original.text, original.textMode, width).height;
      const next = {
        ...original,
        width,
        height,
        x: edge.includes("w") ? b.x + b.width - width : b.x,
        y: edge.includes("n") ? b.y + b.height - height : b.y,
      };
      setBoard((b) => {
        const cards = b.cards.map((c) => (c.id === next.id ? next : c));
        return { ...b, cards };
      });
    }
    if (g.kind === "resize" && g.bounds && !g.cardId) {
      const b = g.bounds,
        edge = g.edge!;
      const width = Math.max(
        160,
        b.width +
          (edge.includes("e")
            ? dx / g.view.z
            : edge.includes("w")
              ? -dx / g.view.z
              : 0),
      );
      const height = Math.max(
        120,
        b.height +
          (edge.includes("s")
            ? dy / g.view.z
            : edge.includes("n")
              ? -dy / g.view.z
              : 0),
      );
      const bounds = {
        x: edge.includes("w") ? b.x + b.width - width : b.x,
        y: edge.includes("n") ? b.y + b.height - height : b.y,
        width,
        height,
      };
      setBoard((b) => ({
        ...b,
        groups: b.groups.map((group) =>
          group.id === g.groupId ? { ...group, bounds } : group,
        ),
      }));
    }
    if (g.kind === "move" && g.moved)
      setBoard((b) => {
        const proposed: Board = {
          ...b,
          cards: b.cards.map((c) => {
            const original = g.cards.find((a) => a.id === c.id);
            return g.ids.includes(c.id) && original
              ? {
                  ...c,
                  x: original.x + dx / g.view.z,
                  y: original.y + dy / g.view.z,
                }
              : c;
          }),
          groups:
            g.groupId && g.groupIds
              ? b.groups.map((group) => {
                  const original = g.groups?.find(
                    (item) => item.id === group.id,
                  )?.bounds;
                  return g.groupIds!.has(group.id) && original
                    ? {
                        ...group,
                        bounds: {
                          ...original,
                          x: original.x + dx / g.view.z,
                          y: original.y + dy / g.view.z,
                        },
                      }
                    : group;
                })
              : b.groups,
        };
        return proposed;
      });
    if (g.kind === "select") {
      const x = Math.min(g.startX, g.startX + dx / g.view.z),
        y = Math.min(g.startY, g.startY + dy / g.view.z),
        w = Math.abs(dx / g.view.z),
        h = Math.abs(dy / g.view.z);
      setMarquee({ x, y, w, h });
      setSelection([
        ...new Set([
          ...g.ids,
          ...visible
            .filter(
              (c) =>
                c.x < x + w &&
                c.x + cardRect(c).width > x &&
                c.y < y + h &&
                c.y + cardRect(c).height > y,
            )
            .map((c) => c.id),
        ]),
      ]);
    }
  };
  const pointerUp = (e: React.PointerEvent) => {
    setDragCursor(false);
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    setCreatePreview(null);
    if (
      g?.link &&
      !g.moved &&
      e.type !== "pointercancel" &&
      Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) <= 4
    ) {
      window.open(g.link, "_blank", "noopener,noreferrer");
    }
    if (
      g?.toggleCard &&
      !g.moved &&
      e.type !== "pointercancel" &&
      Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) <= 4
    ) {
      const id = g.toggleCard;
      setSelectedGroup(undefined);
      setSelectedConnection(undefined);
      setSelection((ids) =>
        ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
      );
    }
    if (g?.kind === "link" && g.from) {
      setLinkDraft(null);
      if (e.type !== "pointercancel") {
        const hit = document.elementFromPoint(e.clientX, e.clientY),
          port = hit?.closest<HTMLElement>("[data-port-card]"),
          cardNode = hit?.closest<HTMLElement>("[data-card-id]");
        let to = nearbyPort(e.clientX, e.clientY, g.from);
        if (!to && port)
          to = {
            card: port.dataset.portCard!,
            side: port.dataset.portSide as Side,
            task: port.dataset.portTask || undefined,
          };
        else if (!to && cardNode) {
          const target = board.cards.find(
            (c) => c.id === cardNode.dataset.cardId,
          )!;
          const r = cardNode.getBoundingClientRect(),
            distances: [Side, number][] = [
              ["w", Math.abs(e.clientX - r.left)],
              ["e", Math.abs(e.clientX - r.right)],
              ["n", Math.abs(e.clientY - r.top)],
              ["s", Math.abs(e.clientY - r.bottom)],
            ];
          to = {
            card: target.id,
            side: distances.sort((a, b) => a[1] - b[1])[0][0],
          };
        }
        if (to && to.card !== g.from.card) {
          const from = g.from,
            target = to;
          setBoard((b) => {
            const existing = (b.connections || []).some(
              (c) =>
                c.from.card === from.card &&
                c.from.side === from.side &&
                c.from.task === from.task &&
                c.to.card === target.card &&
                c.to.side === target.side &&
                c.to.task === target.task,
            );
            return existing
              ? b
              : {
                  ...b,
                  connections: [
                    ...(b.connections || []),
                    { id: uid(), from, to: target },
                  ],
                };
          });
        }
      }
      return;
    }
    if (
      g?.kind === "pan" &&
      g.button === 2 &&
      !g.moved &&
      e.type !== "pointercancel" &&
      g.context
    ) {
      setSelectedConnection(undefined);
      if (g.context.kind === "group") {
        setSelectedGroup(g.context.id);
        setSelection([]);
      } else if (g.context.kind === "card") {
        setSelectedGroup(undefined);
        if (!selection.includes(g.context.id)) setSelection([g.context.id]);
      }
      setMenu({ ...g.context, x: e.clientX, y: e.clientY });
    }
    if (g?.kind === "create" && g.moved && e.type !== "pointercancel") {
      const r = surface.current!.getBoundingClientRect();
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom &&
        !hit?.closest(
          '.toolbar,.floating-top,.pin-bar,.zoom-controls,.help-button,.canvas-overview,[role="dialog"]',
        )
      ) {
        const point = {
          x: (e.clientX - r.left - view.x) / view.z - 120,
          y: (e.clientY - r.top - view.y) / view.z - 125,
        };
        if (g.createKind === "canvas") addCanvas(point);
        else if (g.createKind === "text") addText(point);
        else if (g.createKind === "todo") addTodo(point);
        else if (g.createKind === "miniature") addMiniature(point);
        else {
          pendingUpload.current = point;
          (g.createKind === "image" ? imageInput : fileInput).current?.click();
        }
      }
    }
    if (g?.moved && (g.kind === "move" || g.kind === "resize")) {
      setBoard((b) => settleGroups(b, g.groupId ? [] : g.ids));
    }
    if (g && g.kind !== "create") end();
  };
  const fitGroup = (id: string) =>
    setBoard((b) => {
      const family = groupTreeIds(b.groups, id);
      const cards = b.cards.filter((c) => c.group && family.has(c.group));
      const frames = b.groups
        .filter((g) => g.id !== id && family.has(g.id) && g.bounds)
        .map((g) => g.bounds!);
      if (!cards.length && !frames.length) return b;
      return {
        ...b,
        groups: attachParents(
          b.groups.map((g) =>
            g.id === id ? { ...g, bounds: groupBounds(cards, frames) } : g,
          ),
        ),
      };
    });
  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const downloadCard = async (card: Card) => {
    if (card.kind === "canvas" && card.canvas) {
      download(
        new Blob([await exportBoard(card.canvas)], {
          type: "application/json",
        }),
        `${card.title || "子画布"}.canvas.json`,
      );
      return;
    }
    const file = cardDownload(card);
    download(file.blob, file.name);
  };
  const changeBackground = (color: string) => {
    if (!menu) return;
    const target = menu;
    const ids = new Set(
      selection.includes(target.id) ? selection : [target.id],
    );
    setBoard((b) =>
      target.kind === "group"
        ? {
            ...b,
            groups: b.groups.map((group) =>
              group.id === target.id ? { ...group, color } : group,
            ),
          }
        : {
            ...b,
            cards: b.cards.map((card) =>
              ids.has(card.id) ? { ...card, color } : card,
            ),
          },
    );
    setMenu(null);
  };
  const copySelected = async (
    cardIds?: string[],
    options?: { cut?: boolean; groupId?: string },
  ) => {
    if (clipboardBusy.current) return;
    const group = options?.groupId || (cardIds ? undefined : selectedGroup);
    const cutting = !!options?.cut;
    const destination = activeCanvasKey.current;
    const fragment = selectedFragment(board, cardIds || selection, group);
    if (!fragment.cards.length && !fragment.groups.length) return;
    const token = uid();
    clipboardBusy.current = true;
    notify(cutting ? "正在剪切…" : "正在复制…");
    internalCopy.current = { token, fragment, offset: cutting ? 0 : 30 };
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw Error("当前浏览器不支持系统剪贴板");
      let copy;
      let unsupported: Card[] = [];
      try {
        if (!group) copy = clipboardCopy(fragment.cards);
      } catch (error) {
        if (error instanceof FileClipboardUnsupported)
          unsupported = error.files;
        else if (!cutting && fragment.cards.length <= 1) throw error;
      }
      const text = fragment.cards
        .map(
          (c) =>
            c.text || c.title || (c.tasks || []).map((t) => t.text).join("\n"),
        )
        .join("\n\n");
      await navigator.clipboard.write(canvasClipboard(copy, token, text));
      if (cutting) {
        await saveCanvasClipboard({ token, fragment, offset: 0 });
        if (
          activeCanvasKey.current !== destination ||
          latestBoard.current !== board
        ) {
          notify("已复制；原画布发生变化，未删除原内容");
          return;
        }
        deleteItems(
          fragment.cards.map((c) => c.id),
          group,
        );
        notify(group ? "已剪切分组" : "已剪切");
        return;
      }
      if (unsupported.length) {
        notify("已复制，可在画布中粘贴；系统文件请下载原文件");
        setCopyFiles(unsupported);
      } else {
        const files = fragment.cards.filter((c) => c.kind === "file" && c.blob);
        notify(
          group
            ? "已复制分组"
            : copy?.message
              ? files.length
                ? `${copy.message}；保存文件请下载原文件`
                : copy.message
              : "已复制",
        );
        if (files.length) setCopyFiles(files);
      }
    } catch (error) {
      if (internalCopy.current?.token === token) internalCopy.current = null;
      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError")
      )
        notify(
          cutting
            ? "剪切失败，原内容已保留，请允许剪贴板访问后重试"
            : "复制失败，请允许此网站访问剪贴板后重试",
        );
      else {
        const files = fragment.cards.filter((c) => c.kind === "file" && c.blob);
        notify(
          files.length
            ? "无法复制文件正文（编码或格式不支持），请下载原文件"
            : error instanceof Error
              ? `${cutting ? "剪切失败，原内容已保留" : "复制失败"}：${error.message}`
              : "复制失败，请重试",
        );
        if (files.length) setCopyFiles(files);
      }
    } finally {
      clipboardBusy.current = false;
    }
  };
  const downloadSelected = async (ids: string[], groupId?: string) => {
    if (archiveBusy) return;
    setArchiveBusy(true);
    try {
      const fragment = archiveSelection(board, ids, groupId);
      download(
        await createArchive(fragment),
        `yua-canvas-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "打包下载失败");
    } finally {
      setArchiveBusy(false);
    }
  };
  const exportAll = async () => {
    try {
      const snapshot = latestWorkspace.current;
      download(
        new Blob(
          [
            await exportWorkspace({
              board: snapshot.root,
              view: snapshot.view,
              navigation: snapshot.navigation,
            }),
          ],
          { type: "application/json" },
        ),
        `yua-canvas-${new Date().toISOString().slice(0, 10)}.json`,
      );
      notify("工作区已导出，包含全部画布和附件");
    } catch {
      notify("导出失败，请重试");
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    if (isZip(file)) {
      await addFiles([file]);
      return;
    }
    try {
      const destination = board.id || "";
      const imported = await readCanvasImport(await file.text());
      if (activeCanvasKey.current === destination) setConfirmImport(imported);
    } catch (e) {
      notify(e instanceof Error ? e.message : "导入失败");
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (preview3D || importBusy) return;
      setLinkModifier(e.metaKey || e.ctrlKey);
      const key = e.key.toLowerCase(),
        mod = e.ctrlKey || e.metaKey;
      if (key === "escape") {
        cancelGesture();
        if (gesture.current?.kind === "link") gesture.current = null;
        setLinkDraft(null);
        setSelectedConnection(undefined);
        if (gesture.current?.kind === "create") {
          gesture.current = null;
          suppressToolbarClick.current = true;
          setCreatePreview(null);
        }
        setSelectedGroup(undefined);
        setMenu(null);
        setEditingGroup(undefined);
        setRenamingCanvas(undefined);
        setGroupDialog(null);
        setDetail(undefined);
        setMiniatureDraft(undefined);
        setActiveMiniature(undefined);
        setConfirmImport(null);
        setSelection([]);
        (document.activeElement as HTMLElement)?.blur();
        return;
      }
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        target?.isContentEditable ||
        target?.closest("input,textarea,select")
      ) {
        if (mod && key === "enter") {
          const form = target.closest("form");
          if (form) {
            e.preventDefault();
            form.requestSubmit();
          }
        }
        return;
      }
      if (document.querySelector('[role="dialog"]') || !ready || e.altKey)
        return;
      if (mod) {
        if ((key === "arrowup" || key === "arrowdown") && !e.shiftKey) {
          e.preventDefault();
          if (e.repeat || gesture.current || menu) return;
          if (key === "arrowup") {
            if (path.length) navigateCanvas(path.slice(0, -1));
          } else if (selection.length === 1 && !selectedGroup) {
            const child = board.cards.find(
              (card) => card.id === selection[0] && card.kind === "canvas",
            );
            if (child) navigateCanvas([...path, child.id]);
          }
        } else if (key === "c" && (selection.length || selectedGroup)) {
          e.preventDefault();
          void copySelected();
        } else if (key === "x" && (selection.length || selectedGroup)) {
          e.preventDefault();
          void copySelected(undefined, { cut: true });
        } else if (key === "z" || key === "y") {
          e.preventDefault();
          if (gesture.current) return;
          if (key === "y" || e.shiftKey) redo();
          else undo();
          setSelection([]);
          setSelectedGroup(undefined);
          setMenu(null);
        } else if (key === "a") {
          e.preventDefault();
          setSelectedConnection(undefined);
          setSelection(visible.map((c) => c.id));
          setSelectedGroup(undefined);
        } else if (key === "g") {
          e.preventDefault();
          if (e.shiftKey)
            updateCards((cards) =>
              cards.map((c) =>
                selection.includes(c.id) ? { ...c, group: undefined } : c,
              ),
            );
          else if (selection.length > 1) setGroupDialog({ name: "" });
        } else if (key === "d") {
          e.preventDefault();
          const fragment = selectedFragment(board, selection, selectedGroup);
          if (fragment.cards.length || fragment.groups.length) {
            const result = duplicateFragment(board, fragment, 30);
            setBoard(result.board);
            setSelection(result.group ? [] : result.cards);
            setSelectedGroup(result.group);
          }
        } else if (key === "o") {
          e.preventDefault();
          importInput.current?.click();
        } else if (key === "e" && e.shiftKey) {
          e.preventDefault();
          void exportAll();
        }
        return;
      }
      if (e.code === "Space" && !target?.closest("button")) {
        e.preventDefault();
        space.current = true;
        return;
      }
      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        removeSelected();
      } else if (key === "v") setTool("select");
      else if (key === "h") setTool("hand");
      else if (key === "n" && !e.repeat) {
        e.preventDefault();
        addText();
      } else if (key === "t" && !e.repeat) {
        e.preventDefault();
        addTodo();
      } else if (key === "i" && !e.repeat) {
        e.preventDefault();
        imageInput.current?.click();
      } else if (key === "u" && !e.repeat) {
        e.preventDefault();
        fileInput.current?.click();
      } else if (
        key === "enter" &&
        selection.length === 1 &&
        !target?.closest("button")
      ) {
        e.preventDefault();
        const card = board.cards.find((c) => c.id === selection[0]);
        if (card) openCard(card);
      } else if (key === "+" || key === "=") {
        e.preventDefault();
        zoom(1.2);
      } else if (key === "-") {
        e.preventDefault();
        zoom(1 / 1.2);
      } else if (key === "0") {
        e.preventDefault();
        fit(visible);
      } else if (key === "1") {
        e.preventDefault();
        zoom(1 / view.z);
      } else if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key) &&
        selection.length
      ) {
        if (document.querySelector('[role="menu"]') || gesture.current) return;
        e.preventDefault();
        if (!e.shiftKey) {
          if (selection.length !== 1 || selectedGroup) return;
          const next = adjacentCard(
            board.cards,
            selection[0],
            key as ArrowDirection,
          );
          if (!next) return;
          setSelection([next.id]);
          setSelectedConnection(undefined);
          surface.current
            ?.querySelector<HTMLElement>(
              `[data-card-id="${CSS.escape(next.id)}"]`,
            )
            ?.focus({ preventScroll: true });
          const area = surface.current?.getBoundingClientRect();
          if (area) {
            const rect = cardRect(next);
            setView((v) => {
              const reveal = (
                offset: number,
                start: number,
                size: number,
                available: number,
              ) => {
                const leading = offset + start * v.z,
                  trailing = leading + size * v.z;
                if (size * v.z > available - 96)
                  return available / 2 - (start + size / 2) * v.z;
                if (leading < 48) return offset + 48 - leading;
                if (trailing > available - 48)
                  return offset + available - 48 - trailing;
                return offset;
              };
              const x = reveal(v.x, rect.x, rect.width, area.width);
              const y = reveal(v.y, rect.y, rect.height, area.height);
              return x === v.x && y === v.y ? v : { ...v, x, y };
            });
          }
          return;
        }
        const step = 10;
        updateCards((cards) =>
          cards.map((c) =>
            selection.includes(c.id)
              ? {
                  ...c,
                  x:
                    c.x +
                    (key === "arrowright"
                      ? step
                      : key === "arrowleft"
                        ? -step
                        : 0),
                  y:
                    c.y +
                    (key === "arrowdown"
                      ? step
                      : key === "arrowup"
                        ? -step
                        : 0),
                }
              : c,
          ),
        );
      }
    };
    const up = (e: KeyboardEvent) => {
      setLinkModifier(e.metaKey || e.ctrlKey);
      if (e.code === "Space") space.current = false;
    };
    const blur = () => {
      setLinkModifier(false);
      cancelGesture();
      space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });
  const current = board.cards.find(
    (c) => c.id === detail && (c.kind === "image" || c.kind === "file"),
  );
  const updatePinProperties = (
    pin: PinnedItem,
    properties: Pick<Partial<Card>, "pin" | "pinColor">,
  ) => {
    workspace.updateRoot((root) =>
      replaceBoard(root, pin.path, (current) => ({
        ...current,
        ...(pin.kind === "card"
          ? {
              cards: current.cards.map((card) =>
                card.id === pin.id ? { ...card, ...properties } : card,
              ),
            }
          : {
              groups: current.groups.map((group) =>
                group.id === pin.id ? { ...group, ...properties } : group,
              ),
            }),
      })),
    );
  };
  const updatePin = (pin: PinnedItem, name?: string) =>
    updatePinProperties(pin, {
      pin: name,
      ...(!name ? { pinColor: undefined } : {}),
    });
  const jumpToPin = (pin: PinnedItem) => {
    const target = pin.path.reduce(
      (b, id) => b.cards.find((c) => c.id === id)?.canvas || b,
      root,
    );
    const rect =
      pin.kind === "card"
        ? target.cards.find((c) => c.id === pin.id)
        : target.groups.find((g) => g.id === pin.id)?.bounds;
    if (!rect || !surface.current) return;
    const bounds = "kind" in rect ? cardRect(rect) : rect;
    navigateCanvas(pin.path);
    const r = surface.current.getBoundingClientRect();
    const z = Math.max(
      0.2,
      Math.min(
        1.2,
        (r.width - 120) / bounds.width,
        (r.height - 170) / bounds.height,
      ),
    );
    setView({
      z,
      x: r.width / 2 - (bounds.x + bounds.width / 2) * z,
      y: r.height / 2 - (bounds.y + bounds.height / 2) * z,
    });
    if (pin.kind === "card") setSelection([pin.id]);
    else setSelectedGroup(pin.id);
  };
  const menuCard =
    menu?.kind === "card"
      ? board.cards.find((card) => card.id === menu.id)
      : undefined;
  const menuGroup =
    menu?.kind === "group"
      ? board.groups.find((group) => group.id === menu.id)
      : undefined;
  const menuCardIds = menuCard
    ? selection.includes(menuCard.id)
      ? selection
      : [menuCard.id]
    : [];
  return [
    <div
      key="canvas"
      inert={preview3D}
      onPointerMoveCapture={(e) => setLinkModifier(e.metaKey || e.ctrlKey)}
      onPointerDownCapture={(e) => {
        setLinkModifier(e.metaKey || e.ctrlKey);
        if (
          editSession.current &&
          !(e.target as HTMLElement).closest(".canvas-editor")
        )
          finishEditing(editSession.current.id);
      }}
      className={
        "app " +
        (preview3D ? "previewing-3d " : "") +
        (linkModifier ? "link-modifier " : "") +
        (linkDraft ? "connecting " : "") +
        (dragCursor ? "is-grabbing" : "")
      }
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onLostPointerCapture={() => {
        if (gesture.current) cancelGesture();
      }}
    >
      <main>
        <div className="floating-top">
          {path.length > 0 && (
            <nav className="canvas-navigation" aria-label="画布路径">
              <button
                className="floating-button"
                aria-label="返回父画布"
                title="返回父画布"
                onClick={() => navigateCanvas(path.slice(0, -1))}
              >
                <ArrowLeft size={18} />
              </button>
              <span title={names.join(" / ")}>{names.at(-1)}</span>
            </nav>
          )}
          <div className="floating-actions">
            <CloudPanel board={root} ready={ready} restore={restore} />
            <PwaControls
              beforeUpdate={async () => {
                if (!ready) throw Error("画布尚未读取完成，请稍后更新");
                const snapshot = latestWorkspace.current;
                await saveBoard(
                  snapshot.root,
                  snapshot.view,
                  snapshot.navigation,
                );
                if (
                  latestWorkspace.current.root !== snapshot.root ||
                  latestWorkspace.current.view !== snapshot.view
                )
                  throw Error("保存期间画布发生变化，请再次点击更新");
              }}
            />
            <span
              className={
                "save-indicator " + (saveStatus === "保存失败" ? "error" : "")
              }
              data-state={saveStatus}
              title={saveStatus}
              aria-label={saveStatus}
            >
              <span />
            </span>
            <button
              className="floating-button"
              aria-label="导入"
              title="导入 (⌘/Ctrl O)"
              disabled={!ready}
              onClick={() => importInput.current?.click()}
            >
              <Upload size={18} />
            </button>
            <button
              className="floating-button"
              aria-label="导出画布"
              title="导出全部画布 (⌘/Ctrl Shift E)"
              disabled={!ready}
              onClick={exportAll}
            >
              <Download size={18} />
            </button>
          </div>
        </div>
        <PinBar
          key={JSON.stringify(path)}
          board={board}
          path={path}
          onJump={jumpToPin}
          onRename={updatePin}
          onColorChange={(pin, color) =>
            updatePinProperties(pin, {
              pinColor: color === "normal" ? undefined : color,
            })
          }
        />
        <div
          className={"canvas " + (tool === "hand" ? "hand-tool" : "")}
          ref={surface}
          style={{
            backgroundPosition: `${view.x}px ${view.y}px`,
            backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
          }}
          onPointerDownCapture={(e) => {
            if ((e.target as HTMLElement).closest(".canvas-editor")) return;
            if (
              e.button === 2 ||
              (e.button === 0 && (e.ctrlKey || e.metaKey))
            ) {
              if (e.button === 2) setMenu(null);
              e.stopPropagation();
              e.preventDefault();
              pointerDown(e);
            }
          }}
          onContextMenuCapture={(e) => {
            if (
              e.button === 2 &&
              !(e.target as HTMLElement).closest(".canvas-editor")
            ) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onPointerDown={(e) => pointerDown(e)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ kind: "canvas", id: "", x: e.clientX, y: e.clientY });
          }}
          onWheel={(e) => {
            const rightPan =
              gesture.current?.kind === "pan" && gesture.current.button === 2
                ? gesture.current
                : undefined;
            if (e.ctrlKey || e.metaKey || rightPan) {
              const r = surface.current!.getBoundingClientRect(),
                px = e.clientX - r.left,
                py = e.clientY - r.top;
              setView((v) => {
                const z = Math.min(
                  3,
                  Math.max(0.2, v.z * Math.exp(-e.deltaY * 0.006)),
                );
                const next = {
                  z,
                  x: px - ((px - v.x) * z) / v.z,
                  y: py - ((py - v.y) * z) / v.z,
                };
                if (rightPan) {
                  rightPan.view = next;
                  rightPan.x = e.clientX;
                  rightPan.y = e.clientY;
                  rightPan.moved = true;
                }
                return next;
              });
            } else
              setView((v) => ({
                ...v,
                x: v.x - e.deltaX,
                y: v.y - e.deltaY,
              }));
          }}
          onDoubleClick={(e) => {
            if (e.target === surface.current && !e.ctrlKey && !e.metaKey) {
              const r = surface.current!.getBoundingClientRect();
              addText({
                x: (e.clientX - r.left - view.x) / view.z,
                y: (e.clientY - r.top - view.y) / view.z,
              });
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const r = surface.current!.getBoundingClientRect();
            const transfer = captureTransfer(e.dataTransfer);
            if (!transfer.hasFiles) return;
            void addTransfer(transfer.nodes, {
              x: (e.clientX - r.left - view.x) / view.z,
              y: (e.clientY - r.top - view.y) / view.z,
            });
          }}
        >
          <div
            className="world"
            style={{
              transform: `translate(${view.x}px,${view.y}px) scale(${view.z})`,
            }}
          >
            <svg className="connection-layer" aria-label="画布连线">
              {(board.cards.length > 0 || board.groups.length > 0) && (
                <rect
                  className="minimap-boundary"
                  data-testid="minimap-boundary"
                  aria-hidden="true"
                  {...projection.bounds}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <defs>
                <ConnectionArrow
                  id="canvas-connection-arrow"
                  size={10 / view.z}
                  color="#d1d5db"
                />
                <ConnectionArrow
                  id="canvas-connection-arrow-selected"
                  size={10 / view.z}
                  color="#2563eb"
                />
              </defs>
              {(board.connections || [])
                .filter(
                  (c) =>
                    visible.some((card) => card.id === c.from.card) &&
                    visible.some((card) => card.id === c.to.card),
                )
                .map((c) => {
                  return (
                    <ConnectionView
                      key={c.id}
                      connection={c}
                      cards={board.cards}
                      offsets={taskOffsets}
                      selected={selectedConnection === c.id}
                      editorLayer={connectionEditors}
                      labelLayer={connectionLabels}
                      onSelect={() => {
                        setSelectedConnection(c.id);
                        setSelection([]);
                        setSelectedGroup(undefined);
                      }}
                      onLabelChange={(label) =>
                        setBoard((b) => ({
                          ...b,
                          connections: b.connections?.map((connection) =>
                            connection.id === c.id
                              ? { ...connection, label: label || undefined }
                              : connection,
                          ),
                        }))
                      }
                    />
                  );
                })}
              {linkDraft && (
                <path
                  className="connection-path draft"
                  markerEnd="url(#canvas-connection-arrow)"
                  d={curve(
                    endpointPoint(linkDraft.from, board.cards, taskOffsets),
                    linkDraft.point,
                    linkDraft.from.side,
                    linkDraft.from.side === "e"
                      ? "w"
                      : linkDraft.from.side === "w"
                        ? "e"
                        : linkDraft.from.side === "n"
                          ? "s"
                          : "n",
                  )}
                />
              )}
            </svg>
            <svg
              className="connection-label-layer"
              ref={connectionLabels}
              aria-label="连线标签"
            />
            {[...board.groups]
              .sort(
                (a, b) =>
                  groupDepth(board.groups, a.id) -
                  groupDepth(board.groups, b.id),
              )
              .map((g) => {
                const family = groupTreeIds(board.groups, g.id);
                const cards = visible.filter(
                  (c) => c.group && family.has(c.group),
                );
                const bounds = g.bounds!;
                return (
                  <div
                    key={g.id}
                    className={
                      "group-boundary " +
                      (selectedGroup === g.id ? "group-selected" : "")
                    }
                    data-group-id={g.id}
                    data-parent={g.parent || ""}
                    style={{
                      left: bounds.x,
                      top: bounds.y,
                      width: bounds.width,
                      height: bounds.height,
                      background: g.color,
                      ...({
                        "--group-header-color": g.color,
                      } as React.CSSProperties),
                    }}
                  >
                    {editingGroup === g.id ? (
                      <GroupNameEditor
                        name={g.name}
                        onSave={(name) => {
                          setBoard((b) => ({
                            ...b,
                            groups: b.groups.map((group) =>
                              group.id === g.id && group.name !== name
                                ? { ...group, name }
                                : group,
                            ),
                          }));
                          setEditingGroup(undefined);
                        }}
                        onCancel={() => setEditingGroup(undefined)}
                      />
                    ) : (
                      <button
                        className="group-title"
                        aria-label={`拖动分组 ${g.name}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          pointerDown(e, undefined, g.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedGroup(g.id);
                          setSelection([]);
                          setSelectedConnection(undefined);
                          setMenu({
                            x: e.clientX,
                            y: e.clientY,
                            id: g.id,
                            kind: "group",
                          });
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingGroup(g.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingGroup(g.id);
                          }
                        }}
                      >
                        <Folder size={13} />
                        {g.name}
                      </button>
                    )}
                    <button
                      className="group-fit"
                      aria-label={`自适应分组 ${g.name}`}
                      title="自适应"
                      onPointerDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={() => fitGroup(g.id)}
                    >
                      <Maximize size={13} />
                    </button>
                    {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map(
                      (edge) => (
                        <div
                          key={edge}
                          className={`resize-handle resize-${edge}`}
                          data-testid={`resize-${edge}`}
                          onPointerDown={(e) =>
                            resizeGroup(e, g.id, bounds, edge)
                          }
                        />
                      ),
                    )}
                  </div>
                );
              })}
            {visible.map((c) => (
              <article
                key={c.id}
                data-testid="card"
                data-card-id={c.id}
                onContextMenu={(e) => {
                  if ((e.target as HTMLElement).closest(".canvas-editor"))
                    return;
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedGroup(undefined);
                  setSelectedConnection(undefined);
                  if (!selection.includes(c.id)) setSelection([c.id]);
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    id: c.id,
                    kind: "card",
                  });
                }}
                className={
                  "card card-" +
                  c.kind +
                  (c.kind === "file" && isTextFile(c)
                    ? " text-file-card"
                    : "") +
                  " " +
                  (selection.includes(c.id) ? "selected" : "") +
                  (editingCard === c.id ? " canvas-editing" : "")
                }
                tabIndex={-1}
                aria-label={
                  c.kind === "text" ? c.text.slice(0, 80) : c.title || "任务"
                }
                data-group-name={
                  board.groups.find((g) => g.id === c.group)?.name || ""
                }
                style={{
                  left: c.x,
                  top: c.y,
                  width: cardRect(c).width,
                  height: cardRect(c).height,
                  background: c.kind === "miniature" ? "transparent" : c.color,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  pointerDown(e, c.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!e.ctrlKey && !e.metaKey)
                    openCard(
                      c,
                      document
                        .elementFromPoint(e.clientX, e.clientY)
                        ?.closest<HTMLElement>("[data-task-id]")?.dataset
                        .taskId,
                    );
                }}
              >
                {c.kind !== "text" &&
                  c.kind !== "image" &&
                  c.kind !== "canvas" &&
                  c.kind !== "miniature" &&
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
                {c.kind === "miniature" ? (
                  preview3D ? null : (
                    <Miniature
                      card={c}
                      active={activeMiniature === c.id}
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
                      {renamingCanvas === c.id ? (
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
                ) : c.kind === "text" ? (
                  editingCard === c.id ? (
                    <TextEditor
                      text={c.text}
                      mode={c.textMode}
                      onChange={(text) => changeText(c.id, text)}
                      onFinish={(cancelled) => finishEditing(c.id, cancelled)}
                    />
                  ) : (
                    <NoteText text={c.text} mode={c.textMode} />
                  )
                ) : c.kind === "todo" ? (
                  editingCard === c.id ? (
                    <TodoEditor
                      tasks={c.tasks || []}
                      initialTask={editingTask}
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
                          <span>{task.text}</span>
                        </div>
                      ))}
                    </div>
                  )
                ) : c.kind === "image" ? (
                  <Attachment card={c} />
                ) : (
                  <>
                    <Attachment card={c} />
                    <div className="attachment-title">
                      <FileText size={16} />
                      <span>{c.title}</span>
                    </div>
                  </>
                )}
                {c.kind === "file" && !isTextFile(c) && (
                  <footer>
                    <span>
                      {c.group
                        ? board.groups.find((g) => g.id === c.group)?.name
                        : ""}
                    </span>
                    <span>
                      {selection.includes(c.id) ? (
                        <Check size={13} />
                      ) : (
                        <MoreHorizontal size={16} />
                      )}
                    </span>
                  </footer>
                )}
                {(c.kind === "todo" ? ["n", "s"] : ["n", "e", "s", "w"]).map(
                  (value) => {
                    const side = value as Side;
                    return (
                      <button
                        key={side}
                        className={`connection-port port-${side} ${activePort(c.id, side) ? "target-active" : ""}`}
                        aria-label={`连接 ${c.title || c.text.slice(0, 20) || "任务"} ${side}`}
                        data-port-card={c.id}
                        data-port-side={side}
                        onPointerDown={(e) =>
                          startConnection(e, { card: c.id, side })
                        }
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <Plus size={12} />
                      </button>
                    );
                  },
                )}
                {c.kind === "todo" &&
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
                            visibility:
                              offset && !offset.visible ? "hidden" : undefined,
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
                {c.kind === "text" && (
                  <button
                    className="text-display-toggle"
                    aria-label={
                      c.textMode === "scroll"
                        ? "切换为换行模式"
                        : "切换为滚动模式"
                    }
                    title={c.textMode === "scroll" ? "换行" : "滚动"}
                    aria-pressed={c.textMode === "scroll"}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const textMode =
                        c.textMode === "scroll" ? "wrap" : "scroll";
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
                <button
                  className="card-download"
                  aria-label={`下载 ${c.title || (c.kind === "todo" ? "任务" : "文本")}`}
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
                {selection.includes(c.id) &&
                  (c.kind === "text" && c.textAutoHeight
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
            ))}
            <div className="connection-edit-layer" ref={connectionEditors} />
            {marquee && (
              <div
                className="marquee"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h,
                }}
              />
            )}
          </div>
        </div>
        <CanvasOverview
          onPreview3D={() => {
            clearCanvasUI();
            location.hash = "/3d";
          }}
          dragging={dragCursor}
          root={root}
          path={path}
          view={view}
          navigation={navigation}
          onSwitch={navigateCanvas}
          board={board}
          viewport={viewport}
          projection={projection}
          onDragChange={setDragCursor}
          selection={selection}
          offsets={taskOffsets}
          onNavigate={(point) => {
            const r = surface.current!.getBoundingClientRect();
            setView((v) => ({
              ...v,
              x: r.width / 2 - point.x * v.z,
              y: r.height / 2 - point.y * v.z,
            }));
          }}
        />
        <div className="bottom-tools">
          <div className="toolbar">
            <button
              title="添加任务 (T)"
              aria-label="添加任务"
              disabled={!ready}
              onPointerDown={(e) => startToolbarDrag(e, "todo")}
              onClick={() => toolbarClick(() => addTodo())}
            >
              <ListTodo size={20} />
            </button>
            <button
              title="上传图片 (I)"
              aria-label="上传图片"
              disabled={!ready}
              onPointerDown={(e) => startToolbarDrag(e, "image")}
              onClick={() =>
                toolbarClick(() => {
                  pendingUpload.current = undefined;
                  imageInput.current?.click();
                })
              }
            >
              <ImagePlus size={20} />
            </button>
            <button
              title="上传文件 (U)"
              aria-label="上传文件"
              disabled={!ready}
              onPointerDown={(e) => startToolbarDrag(e, "file")}
              onClick={() =>
                toolbarClick(() => {
                  pendingUpload.current = undefined;
                  fileInput.current?.click();
                })
              }
            >
              <FileUp size={20} />
            </button>
            <button
              title="导入目录"
              aria-label="导入目录"
              disabled={!ready}
              onClick={() => directoryInput.current?.click()}
            >
              <FolderUp size={20} />
            </button>
            <button
              title="创建子画布"
              aria-label="创建子画布"
              disabled={!ready}
              onPointerDown={(e) => startToolbarDrag(e, "canvas")}
              onClick={() => toolbarClick(() => addCanvas())}
            >
              <PanelsTopLeft size={20} />
            </button>
            <button
              title="添加 miniature · 3D 场景"
              aria-label="添加 miniature"
              disabled={!ready}
              onPointerDown={(e) => startToolbarDrag(e, "miniature")}
              onClick={() => toolbarClick(() => addMiniature())}
            >
              <Box size={20} />
            </button>
          </div>
        </div>
        <div className="zoom-controls">
          <button
            title="缩小 (-)"
            aria-label="缩小"
            onClick={() => zoom(1 / 1.2)}
          >
            <Minus size={16} />
          </button>
          <button title="重置缩放 (1)" onClick={() => zoom(1 / view.z)}>
            {Math.round(view.z * 100)}%
          </button>
          <button title="放大 (+)" aria-label="放大" onClick={() => zoom(1.2)}>
            <Plus size={16} />
          </button>
          <i />
          <button
            title="适应内容 (0)"
            aria-label="适应所有内容"
            onClick={() => fit()}
          >
            <Maximize size={16} />
          </button>
        </div>
        <HelpDialog />
      </main>
      <input
        ref={fileInput}
        data-testid="files"
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(e.target.files, pendingUpload.current);
          pendingUpload.current = undefined;
          e.target.value = "";
        }}
      />
      <input
        ref={imageInput}
        data-testid="images"
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(e.target.files, pendingUpload.current);
          pendingUpload.current = undefined;
          e.target.value = "";
        }}
      />
      <input
        ref={directoryInput}
        data-testid="directories"
        type="file"
        multiple
        hidden
        {...{ webkitdirectory: "" }}
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={importInput}
        data-testid="import"
        type="file"
        accept=".json,.zip,application/json,application/zip"
        hidden
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {menu && (
        <CanvasContextMenu x={menu.x} y={menu.y}>
          {menu.kind === "canvas" ? (
            <>
              <MenuSection label="新建内容">
                <ContextSubmenu key={`${menu.x}:${menu.y}`} label="新建">
                  <button
                    role="menuitem"
                    disabled={!ready}
                    onClick={() => createFromMenu("text")}
                  >
                    <Type size={14} />
                    文本
                  </button>
                  <button
                    role="menuitem"
                    disabled={!ready}
                    onClick={() => createFromMenu("todo")}
                  >
                    <ListTodo size={14} />
                    任务
                  </button>
                  <button
                    role="menuitem"
                    disabled={!ready}
                    onClick={() => createFromMenu("image")}
                  >
                    <ImagePlus size={14} />
                    图片
                  </button>
                  <button
                    role="menuitem"
                    disabled={!ready}
                    onClick={() => createFromMenu("file")}
                  >
                    <FileUp size={14} />
                    文件
                  </button>
                  <button
                    role="menuitem"
                    disabled={!ready}
                    onClick={() => createFromMenu("canvas")}
                  >
                    <PanelsTopLeft size={14} />
                    子画布
                  </button>
                  <button
                    role="menuitem"
                    disabled={!ready}
                    onClick={() => createFromMenu("miniature")}
                  >
                    <Box size={14} />
                    Miniature
                  </button>
                  <button
                    role="menuitem"
                    disabled={!ready}
                    onClick={() => createFromMenu("group")}
                  >
                    <Folder size={14} />
                    分组
                  </button>
                </ContextSubmenu>
              </MenuSection>
              <MenuSection label="内容操作">
                {(selection.length > 0 || selectedGroup) && (
                  <button
                    role="menuitem"
                    disabled={archiveBusy}
                    onClick={() => {
                      setMenu(null);
                      void downloadSelected(selection, selectedGroup);
                    }}
                  >
                    <Download size={14} />
                    下载
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    const r = surface.current!.getBoundingClientRect();
                    void pasteFromMenu({
                      x: (menu.x - r.left - view.x) / view.z,
                      y: (menu.y - r.top - view.y) / view.z,
                    });
                  }}
                >
                  <ClipboardPaste size={14} />
                  粘贴
                </button>
              </MenuSection>
              <MenuSection label="画布层级">
                <button
                  role="menuitem"
                  disabled={!path.length}
                  onClick={() => navigateCanvas(path.slice(0, -1))}
                >
                  <ArrowLeft size={14} />
                  返回父画布
                </button>
                <button
                  role="menuitem"
                  disabled={!workspace.canCreateParent}
                  onClick={createParentCanvas}
                >
                  <FolderUp size={14} />
                  创建父画布
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    const r = surface.current!.getBoundingClientRect();
                    addCanvas({
                      x: (menu.x - r.left - view.x) / view.z,
                      y: (menu.y - r.top - view.y) / view.z,
                    });
                  }}
                >
                  <PanelsTopLeft size={14} />
                  创建子画布
                </button>
              </MenuSection>
            </>
          ) : (
            <>
              {menuCard && (
                <MenuSection label="内容操作">
                  {(menuCard.kind === "text" ||
                    menuCard.kind === "canvas" ||
                    menuCard.kind === "miniature") && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        const href =
                          menuCard.kind === "text"
                            ? linkTarget(menuCard.text)
                            : undefined;
                        setMenu(null);
                        if (href)
                          window.open(href, "_blank", "noopener,noreferrer");
                        else openCard(menuCard);
                      }}
                    >
                      <ArrowUpRight size={14} />
                      打开
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      void copySelected([menuCard.id]);
                    }}
                  >
                    <Copy size={14} />
                    复制
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      void copySelected(menuCardIds, { cut: true });
                    }}
                  >
                    <Scissors size={14} />
                    剪切
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      updatePin(
                        {
                          path,
                          id: menuCard.id,
                          kind: "card",
                          name: menuCard.pin || "",
                        },
                        menuCard.pin
                          ? undefined
                          : (
                              menuCard.title ||
                              menuCard.text ||
                              (menuCard.kind === "todo" ? "任务" : "组件")
                            )
                              .slice(0, 100)
                              .trim() || "组件",
                      );
                      setMenu(null);
                    }}
                  >
                    <Pin size={14} />
                    {menuCard.pin ? "取消 Pin" : "Pin"}
                  </button>
                  {menuCard.kind === "canvas" && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenu(null);
                        setRenamingCanvas(menuCard.id);
                      }}
                    >
                      <Pencil size={14} />
                      重命名
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      if (menuCardIds.length > 1)
                        void downloadSelected(menuCardIds);
                      else void downloadCard(menuCard);
                    }}
                  >
                    <Download size={14} />
                    下载
                  </button>
                </MenuSection>
              )}
              {menuGroup && (
                <MenuSection label="内容操作">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      void copySelected([], { groupId: menuGroup.id });
                    }}
                  >
                    <Copy size={14} />
                    复制
                  </button>
                  <button
                    role="menuitem"
                    disabled={archiveBusy}
                    onClick={() => {
                      setMenu(null);
                      void downloadSelected([], menuGroup.id);
                    }}
                  >
                    <Download size={14} />
                    下载
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      void copySelected([], {
                        cut: true,
                        groupId: menuGroup.id,
                      });
                    }}
                  >
                    <Scissors size={14} />
                    剪切
                  </button>
                </MenuSection>
              )}
              {menuGroup && (
                <MenuSection label="定位">
                  <button
                    role="menuitem"
                    onClick={() => {
                      updatePin(
                        {
                          path,
                          id: menuGroup.id,
                          kind: "group",
                          name: menuGroup.name,
                        },
                        menuGroup.pin
                          ? undefined
                          : menuGroup.name.slice(0, 100).trim() || "分组",
                      );
                      setMenu(null);
                    }}
                  >
                    <Pin size={14} />
                    {menuGroup.pin ? "取消 Pin" : "Pin"}
                  </button>
                </MenuSection>
              )}
              <MenuSection label="分组操作">
                {menu.kind === "card" ? (
                  <>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenu(null);
                        setGroupDialog({ name: "" });
                      }}
                    >
                      <Folder size={14} />
                      创建分组
                    </button>
                    {board.cards.some(
                      (card) => menuCardIds.includes(card.id) && card.group,
                    ) && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenu(null);
                          updateCards((cards) =>
                            cards.map((card) =>
                              menuCardIds.includes(card.id)
                                ? { ...card, group: undefined }
                                : card,
                            ),
                          );
                        }}
                      >
                        <Unlink size={14} />
                        移出分组
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    role="menuitem"
                    onClick={() => dissolveGroup(menu.id)}
                  >
                    <Unlink size={14} />
                    解散分组
                  </button>
                )}
              </MenuSection>
              <MenuSection label="外观">
                <ColorPalette
                  value={menuCard?.color || menuGroup?.color}
                  onChange={changeBackground}
                />
              </MenuSection>
              <MenuSection label="删除操作">
                <button
                  className="danger"
                  role="menuitem"
                  onClick={() =>
                    deleteItems(
                      menuCardIds,
                      menu.kind === "group" ? menu.id : undefined,
                    )
                  }
                >
                  <Trash2 size={14} />
                  删除
                </button>
              </MenuSection>
            </>
          )}
        </CanvasContextMenu>
      )}
      {groupDialog && (
        <div className="modal-backdrop">
          <form
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-label="分组命名"
            onSubmit={(e) => {
              e.preventDefault();
              if (!groupDialog.name.trim()) return;
              const id = groupDialog.id || uid();
              setBoard((b) => {
                const next: Board = {
                  ...b,
                  groups: groupDialog.id
                    ? b.groups.map((g) =>
                        g.id === id
                          ? { ...g, name: groupDialog.name.trim() }
                          : g,
                      )
                    : [
                        ...b.groups,
                        {
                          id,
                          name: groupDialog.name.trim(),
                          bounds: groupBounds(
                            b.cards.filter((c) => selection.includes(c.id)),
                          ),
                        },
                      ],
                  cards: groupDialog.id
                    ? b.cards
                    : b.cards.map((c) =>
                        selection.includes(c.id) ? { ...c, group: id } : c,
                      ),
                };
                return { ...next, groups: attachParents(next.groups) };
              });
              setGroupDialog(null);
            }}
          >
            <div className="modal-heading">
              <span>
                <Folder size={18} />
                {groupDialog.id ? "重命名分组" : "创建分组"}
              </span>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setGroupDialog(null)}
              >
                <X size={20} />
              </button>
            </div>
            <label>
              分组名称
              <input
                autoFocus
                aria-label="分组名称"
                maxLength={200}
                placeholder="名称"
                value={groupDialog.name}
                onChange={(e) =>
                  setGroupDialog({ ...groupDialog, name: e.target.value })
                }
              />
            </label>
            <div className="modal-bottom">
              {groupDialog.id ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    const id = groupDialog.id;
                    setBoard((b) => ({
                      ...b,
                      groups: attachParents(
                        b.groups.filter((g) => g.id !== id),
                      ),
                      cards: b.cards.map((c) =>
                        c.group === id ? { ...c, group: undefined } : c,
                      ),
                    }));
                    setGroupDialog(null);
                  }}
                >
                  解散分组
                </button>
              ) : null}
              <button className="primary" disabled={!groupDialog.name.trim()}>
                保存分组
              </button>
            </div>
          </form>
        </div>
      )}
      {current && (
        <div className="modal-backdrop">
          <div
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="内容详情"
          >
            <div className="modal-heading">
              <span>{current.title}</span>
              <button
                aria-label="关闭详情"
                onClick={() => setDetail(undefined)}
              >
                <X size={20} />
              </button>
            </div>
            {current.kind === "file" && isTextFile(current) ? (
              <TextFileEditor
                key={current.id}
                card={current}
                preview={<Attachment card={current} large />}
                onDownload={() => download(current.blob!, current.title)}
                onSave={(blob) =>
                  updateCards((cards) =>
                    cards.map((card) =>
                      card.id === current.id
                        ? { ...card, blob, mime: blob.type }
                        : card,
                    ),
                  )
                }
              />
            ) : (
              <>
                <div className="detail-content">
                  <Attachment card={current} large />
                </div>
                <div className="modal-bottom">
                  <small>{current.mime || "文件"}</small>
                  <button
                    className="primary"
                    onClick={() => download(current.blob!, current.title)}
                  >
                    <Download size={15} />
                    下载原文件
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {confirmImport && (
        <div className="modal-backdrop">
          <div
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-label="确认导入"
          >
            <div className="modal-heading">
              <span>
                {confirmImport.workspace ? "还原工作区备份" : "导入画布"}
              </span>
            </div>
            <p>
              {confirmImport.workspace
                ? `将替换整个工作区，包含 ${workspaceCounts(confirmImport.board).canvases} 个画布、${workspaceCounts(confirmImport.board).components} 个组件，并恢复各层视图及所在层级。`
                : `替换当前画布？（${confirmImport.board.cards.length} 项）`}
            </p>
            <div className="modal-bottom">
              <button
                className="button"
                disabled={importBusy}
                onClick={() => setConfirmImport(null)}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={importBusy}
                onClick={async () => {
                  const imported = confirmImport;
                  setImportBusy(true);
                  try {
                    if (imported.workspace) {
                      const snapshot = {
                        board: imported.board,
                        ...imported.workspace,
                      };
                      await saveBoard(
                        snapshot.board,
                        snapshot.view,
                        snapshot.navigation,
                      );
                      clearCanvasUI();
                      setPending3DOpen(undefined);
                      workspace.importSnapshot(snapshot);
                      notify("工作区已完整还原");
                    } else {
                      setBoard(imported.board, { preserveLayout: true });
                      setConfirmImport(null);
                      setSelection([]);
                      setDetail(undefined);
                      fit(imported.board.cards, imported.board.groups);
                      notify("画布已导入");
                    }
                  } catch (error) {
                    notify(
                      "还原失败，原工作区已保留" +
                        (error instanceof Error && error.message
                          ? `：${error.message}`
                          : ""),
                    );
                  } finally {
                    setImportBusy(false);
                  }
                }}
              >
                {importBusy ? "正在还原…" : "确认替换"}
              </button>
            </div>
          </div>
        </div>
      )}
      {miniatureDraft && (
        <MiniatureDialog
          key={miniatureDraft.id}
          card={miniatureDraft}
          onClose={() => setMiniatureDraft(undefined)}
          onSave={(title, src) => {
            const fresh = !miniatureDraft.id;
            const sceneChanged = miniatureDraft.text !== src;
            const resetCover = sceneChanged
              ? { blob: undefined, mime: undefined, miniatureView: undefined }
              : {};
            const card = {
              ...miniatureDraft,
              id: miniatureDraft.id || uid(),
              title,
              text: src,
              ...resetCover,
            };
            setBoard((b) => ({
              ...b,
              cards: fresh
                ? [
                    ...b.cards,
                    { ...card, group: containingGroup(card, b.groups) },
                  ]
                : b.cards.map((c) =>
                    c.id === card.id
                      ? { ...c, title, text: src, ...resetCover }
                      : c,
                  ),
            }));
            setSelection([card.id]);
            setSelectedGroup(undefined);
            setMiniatureDraft(undefined);
          }}
        />
      )}
      {createPreview && (
        <div
          className="creation-preview"
          aria-hidden="true"
          style={{
            left: createPreview.x - 120 * view.z,
            top: createPreview.y - 125 * view.z,
            width: 240 * view.z,
            height: 250 * view.z,
          }}
        >
          {createPreview.kind === "canvas" ? (
            <PanelsTopLeft />
          ) : createPreview.kind === "miniature" ? (
            <Box />
          ) : createPreview.kind === "text" ? (
            <Type />
          ) : createPreview.kind === "todo" ? (
            <ListTodo />
          ) : createPreview.kind === "image" ? (
            <ImagePlus />
          ) : (
            <FileText />
          )}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          {copyFiles.length > 0 && (
            <button
              className="copy-download"
              onClick={() => {
                copyFiles.forEach((c) => {
                  if (c.blob) download(c.blob, c.title);
                });
                setCopyFiles([]);
                setToast("");
              }}
            >
              下载原文件
            </button>
          )}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>,
    preview3D &&
      (ready ? (
        <Canvas3D
          key="preview3d"
          root={root}
          path={path}
          onClose={closePreview3D}
          onOpen={(nextPath, card) => {
            navigateCanvas(nextPath);
            if (card) setPending3DOpen({ path: nextPath, card });
            closePreview3D();
          }}
        />
      ) : (
        <section key="loading3d" className="canvas3d-page" role="status">
          正在读取工作区…
        </section>
      )),
  ];
}
function Router() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => setHash(location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash.startsWith("#/s/") ? (
    <ShareViewer key={hash} token={hash.slice(4)} />
  ) : (
    <App preview3D={hash === "#/3d"} />
  );
}
createRoot(document.getElementById("root")!).render(<Router />);

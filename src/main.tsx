import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ListTodo,
  Plus,
  Search,
  ArrowUpRight,
  Upload,
  Download,
  MousePointer2,
  Hand,
  StickyNote,
  ImagePlus,
  FileUp,
  Minus,
  Maximize,
  Layers,
  Folder,
  Check,
  X,
  Trash2,
  FileText,
  MoreHorizontal,
  Unlink,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  type Board,
  type Card,
  type Task,
  type Rect,
  groupBounds,
  containingGroup,
  emptyBoard,
  readBoard,
  saveBoard,
  exportBoard,
  importBoard,
} from "./storage";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./style.css";
const uid = () => crypto.randomUUID();
const colors = ["#fffdf5", "#eaf0e8", "#f4e8e2", "#e8edf4", "#ede8f4"];
function Attachment({ card, large = false }: { card: Card; large?: boolean }) {
  const [url, setUrl] = useState(""),
    [fileText, setFileText] = useState("");
  useEffect(() => {
    if (
      large &&
      card.blob &&
      (card.mime?.startsWith("text/") ||
        /\.(txt|md|markdown|mdown|json|csv|log|xml|yaml|yml)$/i.test(
          card.title,
        ))
    ) {
      let active = true;
      card.blob
        .slice(0, 1024 * 1024)
        .text()
        .then((t) => {
          if (active) setFileText(t);
        });
      return () => {
        active = false;
      };
    }
  }, [large, card.blob, card.mime, card.title]);
  useEffect(() => {
    if (!card.blob) return;
    const u = URL.createObjectURL(card.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [card.blob]);
  if (
    large &&
    (/\.(md|markdown|mdown)$/i.test(card.title) ||
      card.mime === "text/markdown")
  )
    return (
      <div className="markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ children, ...props }) => (
              <a {...props} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {fileText}
        </ReactMarkdown>
      </div>
    );
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
function App() {
  const [board, setBoard] = useState<Board>(emptyBoard),
    [ready, setReady] = useState(false),
    [saveStatus, setSaveStatus] = useState("正在读取"),
    [selection, setSelection] = useState<string[]>([]),
    [view, setView] = useState({ x: 65, y: 55, z: 1 }),
    [tool, setTool] = useState<"select" | "hand">("select"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 700),
    [detail, setDetail] = useState<string>(),
    [note, setNote] = useState<{
      text: string;
      id?: string;
      color: string;
      point?: { x: number; y: number };
    } | null>(null),
    [todo, setTodo] = useState<{
      id?: string;
      tasks: Task[];
      color: string;
      point?: { x: number; y: number };
    } | null>(null),
    [groupDialog, setGroupDialog] = useState<{
      name: string;
      id?: string;
    } | null>(null),
    [createPreview, setCreatePreview] = useState<{
      kind: Card["kind"];
      x: number;
      y: number;
    } | null>(null),
    [toast, setToast] = useState(""),
    [confirmImport, setConfirmImport] = useState<Board | null>(null),
    [marquee, setMarquee] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null);
  const surface = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    pendingUpload = useRef<{ x: number; y: number } | undefined>(undefined),
    suppressToolbarClick = useRef(false),
    gesture = useRef<{
      kind: "pan" | "move" | "select" | "resize" | "create";
      createKind?: Card["kind"];
      groupId?: string;
      bounds?: Rect;
      edge?: string;
      x: number;
      y: number;
      view: typeof view;
      cards: Card[];
      ids: string[];
      startX: number;
      startY: number;
      moved: boolean;
    } | null>(null),
    space = useRef(false),
    loaded = useRef(false);
  const notify = (message: string) => {
    setToast(message);
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    readBoard()
      .then((b) => {
        if (b) setBoard(b);
        setReady(true);
        loaded.current = true;
        setSaveStatus("已保存至本地");
      })
      .catch(() => {
        setSaveStatus("本地存储不可用");
        notify("无法读取浏览器存储，请检查浏览器设置后刷新。");
      });
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    setSaveStatus("正在保存…");
    const t = setTimeout(() => {
      saveBoard(board)
        .then(() => setSaveStatus("已保存至本地"))
        .catch(() => {
          setSaveStatus("保存失败");
          notify("本地保存失败，可能空间不足。请及时导出备份。");
        });
    }, 250);
    return () => clearTimeout(t);
  }, [board]);
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
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
  const updateCards = (fn: (cards: Card[]) => Card[]) =>
    setBoard((b) => ({ ...b, cards: fn(b.cards) }));
  const removeSelected = () => {
    if (selection.length) {
      updateCards((cards) => cards.filter((c) => !selection.includes(c.id)));
      setSelection([]);
    }
  };
  const center = () => {
    const r = surface.current!.getBoundingClientRect();
    const p = {
      x: (r.width / 2 - view.x) / view.z - 120,
      y: (r.height / 2 - view.y) / view.z - 100,
    };
    let attempts = 0;
    while (
      board.cards.some(
        (c) => Math.abs(c.x - p.x) < 245 && Math.abs(c.y - p.y) < 255,
      ) &&
      attempts++ < 200
    ) {
      p.x += 270;
      if (attempts % 3 === 0) {
        p.x -= 810;
        p.y += 280;
      }
    }
    return p;
  };
  const addFiles = async (
    files: FileList | File[] | null,
    point?: { x: number; y: number },
  ) => {
    if (!files?.length) return;
    const p = point || center();
    const next: Card[] = Array.from(files).map((f, i) => ({
      id: uid(),
      kind: f.type.startsWith("image/") ? "image" : "file",
      title: f.name,
      text: "",
      x: p.x + (i % 4) * 270,
      y: p.y + Math.floor(i / 4) * 290,
      color: colors[0],
      blob: f,
      mime: f.type,
    }));
    setBoard((b) => ({
      ...b,
      cards: [
        ...b.cards,
        ...next.map((c) => ({ ...c, group: containingGroup(c, b.groups) })),
      ],
    }));
    setSelection(next.map((c) => c.id));
    notify(`已添加 ${next.length} 个文件`);
  };
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target;
      if (
        !ready ||
        document.querySelector('[role="dialog"]') ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest(
              'input, textarea, [contenteditable]:not([contenteditable="false"])',
            )))
      )
        return;
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      // Prefer files: browsers can expose the same attachment through both lists.
      const files = clipboard.files.length
        ? Array.from(clipboard.files)
        : Array.from(clipboard.items)
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .filter((file): file is File => file !== null);
      if (!files.length) return;
      event.preventDefault();
      void addFiles(files);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [ready, addFiles]);
  const addNote = (point?: { x: number; y: number }) =>
    setNote({ text: "", color: colors[0], point });
  const openCard = (card: Card) => {
    if (card.kind === "text")
      setNote({ id: card.id, text: card.text, color: card.color });
    else if (card.kind === "todo")
      setTodo({
        id: card.id,
        tasks: card.tasks?.map((t) => ({ ...t })) || [],
        color: card.color,
      });
    else setDetail(card.id);
  };
  const addTodo = (point?: { x: number; y: number }) =>
    setTodo({
      point,
      tasks: [{ id: uid(), text: "", done: false }],
      color: colors[0],
    });
  const submitTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!todo) return;
    const tasks = todo.tasks
      .filter((t) => t.text.trim())
      .map((t) => ({ ...t, text: t.text.trim() }));
    if (!tasks.length) return;
    if (todo.id)
      updateCards((cards) =>
        cards.map((c) =>
          c.id === todo.id ? { ...c, tasks, color: todo.color } : c,
        ),
      );
    else {
      const id = uid();
      setBoard((b) => {
        const cards = b.cards;
        const next: Card[] = [
          ...cards,
          {
            id,
            kind: "todo",
            title: "",
            text: "",
            tasks,
            color: todo.color,
            ...(todo.point || center()),
          },
        ];
        const card = next[next.length - 1];
        card.group = containingGroup(card, b.groups);
        return { ...b, cards: next };
      });
      setSelection([id]);
    }
    setTodo(null);
  };
  const submitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note?.text.trim()) return;
    const n = note!;
    if (n.id)
      updateCards((cards) =>
        cards.map((c) =>
          c.id === n.id
            ? {
                ...c,
                text: n.text,
                color: n.color,
              }
            : c,
        ),
      );
    else {
      const id = uid();
      setBoard((b) => {
        const cards = b.cards;
        const next: Card[] = [
          ...cards,
          {
            id,
            kind: "text",
            title: "",
            text: n.text,
            color: n.color,
            ...(n.point || center()),
          },
        ];
        const card = next[next.length - 1];
        card.group = containingGroup(card, b.groups);
        return { ...b, cards: next };
      });
      setSelection([id]);
    }
    setNote(null);
  };
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
  const fit = (cards = board.cards) => {
    if (!cards.length) {
      setView({ x: 65, y: 55, z: 1 });
      return;
    }
    const r = surface.current!.getBoundingClientRect();
    const left = Math.min(...cards.map((c) => c.x)),
      top = Math.min(...cards.map((c) => c.y)),
      right = Math.max(...cards.map((c) => c.x + 240)),
      bottom = Math.max(...cards.map((c) => c.y + 250));
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
  const visible = board.cards.filter(
    (c) =>
      (filter === "all" ||
        (filter === "text" && c.kind === "text") ||
        (filter === "image" && c.kind === "image") ||
        (filter === "file" && c.kind === "file") ||
        (filter === "todo" && c.kind === "todo") ||
        filter === c.group) &&
      (!query ||
        (
          c.title +
          " " +
          c.text +
          " " +
          (c.tasks || []).map((t) => t.text).join(" ")
        )
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const pointerDown = (
    e: React.PointerEvent,
    id?: string,
    groupId?: string,
  ) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (
      (e.target as HTMLElement).closest("button,input,textarea,label") &&
      !groupId
    )
      return;
    if (e.button === 1) e.preventDefault();
    const r = surface.current!.getBoundingClientRect();
    const pan = tool === "hand" || space.current || e.button === 1;
    let ids = selection;
    if (groupId && !pan) {
      ids = board.cards.filter((c) => c.group === groupId).map((c) => c.id);
      setSelection([]);
    } else if (id && !pan) {
      if (e.shiftKey) {
        ids = selection.includes(id)
          ? selection.filter((v) => v !== id)
          : [...selection, id];
      } else if (!selection.includes(id)) ids = [id];
      setSelection(ids);
    } else if (!pan && !e.shiftKey) setSelection([]);
    const x = (e.clientX - r.left - view.x) / view.z,
      y = (e.clientY - r.top - view.y) / view.z;
    gesture.current = {
      kind: pan ? "pan" : id || groupId ? "move" : "select",
      x: e.clientX,
      y: e.clientY,
      view,
      cards: board.cards,
      ids: pan ? [] : id || groupId ? ids : e.shiftKey ? selection : [],
      startX: x,
      startY: y,
      moved: false,
      groupId: !pan ? groupId : undefined,
      bounds: groupId
        ? board.groups.find((g) => g.id === groupId)?.bounds
        : undefined,
    };
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
  const startToolbarDrag = (e: React.PointerEvent, kind: Card["kind"]) => {
    if (e.button !== 0 || !ready) return;
    suppressToolbarClick.current = false;
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
    if (g.kind === "create" && g.moved) {
      suppressToolbarClick.current = true;
      setCreatePreview({ kind: g.createKind!, x: e.clientX, y: e.clientY });
    }
    if (g.kind === "pan")
      setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    if (g.kind === "resize" && g.bounds) {
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
      setBoard((b) => ({
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
          g.groupId && g.bounds
            ? b.groups.map((group) =>
                group.id === g.groupId
                  ? {
                      ...group,
                      bounds: {
                        ...g.bounds!,
                        x: g.bounds!.x + dx / g.view.z,
                        y: g.bounds!.y + dy / g.view.z,
                      },
                    }
                  : group,
              )
            : b.groups,
      }));
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
                c.x < x + w && c.x + 240 > x && c.y < y + h && c.y + 250 > y,
            )
            .map((c) => c.id),
        ]),
      ]);
    }
  };
  const pointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    setCreatePreview(null);
    if (g?.kind === "create" && g.moved && e.type !== "pointercancel") {
      const r = surface.current!.getBoundingClientRect();
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom &&
        !hit?.closest(
          '.toolbar,.floating-top,.zoom-controls,.selection-bar,.sidebar,[role="dialog"]',
        )
      ) {
        const point = {
          x: (e.clientX - r.left - view.x) / view.z - 120,
          y: (e.clientY - r.top - view.y) / view.z - 125,
        };
        if (g.createKind === "text") addNote(point);
        else if (g.createKind === "todo") addTodo(point);
        else {
          pendingUpload.current = point;
          (g.createKind === "image" ? imageInput : fileInput).current?.click();
        }
      }
    }
    if (g?.kind === "move" && g.moved && !g.groupId) {
      setBoard((b) => ({
        ...b,
        cards: b.cards.map((c) =>
          g.ids.includes(c.id)
            ? { ...c, group: containingGroup(c, b.groups) }
            : c,
        ),
      }));
    }
  };
  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportAll = async () => {
    try {
      download(
        new Blob([await exportBoard(board)], { type: "application/json" }),
        `yua-canvas-${new Date().toISOString().slice(0, 10)}.json`,
      );
      notify("画布已导出，包含所有附件");
    } catch {
      notify("导出失败，请重试");
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      setConfirmImport(await importBoard(await file.text()));
    } catch (e) {
      notify(e instanceof Error ? e.message : "导入失败");
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase(),
        mod = e.ctrlKey || e.metaKey;
      if (key === "escape") {
        if (gesture.current?.kind === "create") {
          gesture.current = null;
          suppressToolbarClick.current = true;
          setCreatePreview(null);
        }
        setNote(null);
        setTodo(null);
        setGroupDialog(null);
        setDetail(undefined);
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
        if (key === "k") {
          e.preventDefault();
          document.querySelector<HTMLInputElement>(".search input")?.focus();
        } else if (key === "a") {
          e.preventDefault();
          setSelection(visible.map((c) => c.id));
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
          const copies = board.cards
            .filter((c) => selection.includes(c.id))
            .map((c) => ({
              ...c,
              id: uid(),
              x: c.x + 30,
              y: c.y + 30,
              group: undefined,
            }));
          if (copies.length) {
            updateCards((cards) => [...cards, ...copies]);
            setSelection(copies.map((c) => c.id));
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
        addNote();
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
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
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
      if (e.code === "Space") space.current = false;
    };
    const blur = () => {
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
  return (
    <div
      className="app"
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      <aside className={"sidebar " + (!sidebar ? "collapsed" : "")}>
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-icon">y</span>
          <span>
            yua<span className="brand-light"> canvas</span>
          </span>
        </a>
        <div className="section-label">素材库</div>
        <nav>
          {[
            { id: "all", name: "全部内容", icon: Layers },
            { id: "text", name: "文字笔记", icon: StickyNote },
            { id: "todo", name: "任务", icon: ListTodo },
            { id: "image", name: "图片", icon: ImagePlus },
            { id: "file", name: "文件", icon: FileText },
          ].map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              className={"nav-item " + (filter === id ? "active" : "")}
              onClick={() => setFilter(id)}
            >
              <Icon size={17} />
              <span>{name}</span>
              <small>
                {
                  board.cards.filter((c) => id === "all" || c.kind === id)
                    .length
                }
              </small>
            </button>
          ))}
        </nav>
        <div className="section-label group-heading">
          我的分组 <span>{board.groups.length}</span>
        </div>
        <div className="groups-list">
          {board.groups.length
            ? board.groups.map((g) => (
                <div className="group-row" key={g.id}>
                  <button
                    className={"nav-item " + (filter === g.id ? "active" : "")}
                    onClick={() => {
                      setFilter(g.id);
                      fit(board.cards.filter((c) => c.group === g.id));
                    }}
                  >
                    <Folder size={16} />
                    <span>{g.name}</span>
                    <small>
                      {board.cards.filter((c) => c.group === g.id).length}
                    </small>
                  </button>
                  <button
                    title="重命名分组"
                    className="group-more"
                    onClick={() => setGroupDialog({ id: g.id, name: g.name })}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              ))
            : null}
        </div>
      </aside>
      <main>
        <div className="floating-top">
          <button
            className="floating-button"
            aria-label={sidebar ? "收起侧栏" : "展开侧栏"}
            title={sidebar ? "收起侧栏" : "展开侧栏"}
            onClick={() => setSidebar(!sidebar)}
          >
            {sidebar ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
          <label className="search">
            <Search size={16} />
            <input
              aria-label="搜索画布"
              placeholder="搜索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button title="清除搜索" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
          </label>
          <div className="floating-actions">
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
              title="导出 (⌘/Ctrl Shift E)"
              disabled={!ready}
              onClick={exportAll}
            >
              <Download size={18} />
            </button>
          </div>
        </div>
        <div
          className={"canvas " + (tool === "hand" ? "hand-tool" : "")}
          ref={surface}
          style={{
            backgroundPosition: `${view.x}px ${view.y}px`,
            backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
          }}
          onPointerDown={(e) => pointerDown(e)}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              const r = surface.current!.getBoundingClientRect(),
                px = e.clientX - r.left,
                py = e.clientY - r.top;
              setView((v) => {
                const z = Math.min(
                  3,
                  Math.max(0.2, v.z * Math.exp(-e.deltaY * 0.006)),
                );
                return {
                  z,
                  x: px - ((px - v.x) * z) / v.z,
                  y: py - ((py - v.y) * z) / v.z,
                };
              });
            } else
              setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
          }}
          onDoubleClick={(e) => {
            if (e.target === surface.current) addNote();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const r = surface.current!.getBoundingClientRect();
            void addFiles(e.dataTransfer.files, {
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
            {board.groups.map((g) => {
              const cards = visible.filter((c) => c.group === g.id);
              if (
                !cards.length &&
                (query || (filter !== "all" && filter !== g.id))
              )
                return null;
              const bounds = g.bounds!;
              return (
                <div
                  key={g.id}
                  className="group-boundary"
                  style={{
                    left: bounds.x,
                    top: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                  }}
                >
                  <button
                    className="group-title"
                    aria-label={`拖动分组 ${g.name}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      pointerDown(e, undefined, g.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setGroupDialog({ id: g.id, name: g.name });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        setGroupDialog({ id: g.id, name: g.name });
                      }
                    }}
                  >
                    <Folder size={13} />
                    {g.name}
                  </button>
                  {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((edge) => (
                    <div
                      key={edge}
                      className={`resize-handle resize-${edge}`}
                      data-testid={`resize-${edge}`}
                      onPointerDown={(e) => resizeGroup(e, g.id, bounds, edge)}
                    />
                  ))}
                </div>
              );
            })}
            {visible.map((c) => (
              <article
                key={c.id}
                data-testid="card"
                className={
                  "card " + (selection.includes(c.id) ? "selected" : "")
                }
                style={{ left: c.x, top: c.y, background: c.color }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  pointerDown(e, c.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  openCard(c);
                }}
              >
                <div className="card-top">
                  <span>
                    {c.kind === "text" ? (
                      <StickyNote size={13} />
                    ) : c.kind === "todo" ? (
                      <ListTodo size={13} />
                    ) : c.kind === "image" ? (
                      <ImagePlus size={13} />
                    ) : (
                      <FileText size={13} />
                    )}{" "}
                    {c.kind === "text"
                      ? "NOTE"
                      : c.kind === "todo"
                        ? "TODO"
                        : c.kind === "image"
                          ? "IMAGE"
                          : "FILE"}
                  </span>
                </div>
                {c.kind === "text" ? (
                  <div className="note-body">
                    <p>{c.text}</p>
                  </div>
                ) : c.kind === "todo" ? (
                  <div
                    className="todo-list"
                    onDoubleClick={(e) => {
                      if ((e.target as HTMLElement).closest("input,label"))
                        e.stopPropagation();
                    }}
                  >
                    {(c.tasks || []).map((task) => (
                      <label
                        key={task.id}
                        className={task.done ? "completed" : ""}
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
                      </label>
                    ))}
                  </div>
                ) : (
                  <>
                    <Attachment card={c} />
                    <div className="attachment-title">{c.title}</div>
                  </>
                )}
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
              </article>
            ))}
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
          {board.cards.length > 0 && !visible.length && (
            <div className="no-results">
              <Search size={28} />
              <button
                className="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                查看全部内容
              </button>
            </div>
          )}
        </div>
        {selection.length > 0 && (
          <div className="selection-bar">
            <strong>已选 {selection.length} 项</strong>
            <span />
            <button
              disabled={selection.length < 2}
              onClick={() => setGroupDialog({ name: "" })}
            >
              <Folder size={15} />
              创建分组
            </button>
            {board.cards.some((c) => selection.includes(c.id) && c.group) && (
              <button
                onClick={() =>
                  updateCards((cards) =>
                    cards.map((c) =>
                      selection.includes(c.id) ? { ...c, group: undefined } : c,
                    ),
                  )
                }
              >
                <Unlink size={15} />
                移出分组
              </button>
            )}
            <button title="删除选中内容" onClick={removeSelected}>
              <Trash2 size={16} />
            </button>
            <button title="取消选择" onClick={() => setSelection([])}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="bottom-tools">
          <div className="toolbar">
            <button
              title="选择 (V)"
              aria-label="选择工具"
              className={tool === "select" ? "chosen" : ""}
              onClick={() => setTool("select")}
            >
              <MousePointer2 size={19} />
            </button>
            <button
              title="移动画布 (H / 空格)"
              aria-label="移动画布"
              className={tool === "hand" ? "chosen" : ""}
              onClick={() => setTool("hand")}
            >
              <Hand size={19} />
            </button>
            <i />
            <button
              title="添加笔记 (N)"
              aria-label="添加笔记"
              disabled={!ready}
              onPointerDown={(e) => startToolbarDrag(e, "text")}
              onClick={() => toolbarClick(() => addNote())}
            >
              <StickyNote size={20} />
            </button>
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
            <i />
            <button
              className="add-button"
              aria-label="新建内容"
              disabled={!ready}
              onPointerDown={(e) => startToolbarDrag(e, "text")}
              onClick={() => toolbarClick(() => addNote())}
            >
              <Plus size={21} />
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
        ref={importInput}
        data-testid="import"
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {note && (
        <div className="modal-backdrop">
          <form
            className="modal note-modal"
            role="dialog"
            aria-modal="true"
            aria-label={note.id ? "编辑笔记" : "新建笔记"}
            onSubmit={submitNote}
          >
            <div className="modal-heading">
              <span>
                <StickyNote size={18} />
                {note.id ? "编辑笔记" : "新建笔记"}
              </span>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setNote(null)}
              >
                <X size={20} />
              </button>
            </div>
            <textarea
              autoFocus
              aria-label="笔记内容"
              placeholder="内容"
              value={note.text}
              onChange={(e) => setNote({ ...note, text: e.target.value })}
            />
            <div className="modal-bottom">
              <div className="colors">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`颜色 ${color}`}
                    className={note.color === color ? "selected-color" : ""}
                    style={{ background: color }}
                    onClick={() => setNote({ ...note, color })}
                  >
                    {note.color === color && <Check size={13} />}
                  </button>
                ))}
              </div>
              <button
                className="primary"
                disabled={!note.text.trim()}
                type="submit"
              >
                保存笔记
                <ArrowUpRight size={15} />
              </button>
            </div>
          </form>
        </div>
      )}
      {todo && (
        <div className="modal-backdrop">
          <form
            className="modal todo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={todo.id ? "编辑任务" : "新建任务"}
            onSubmit={submitTodo}
          >
            <div className="modal-heading">
              <span>
                <ListTodo size={18} />
                {todo.id ? "编辑任务" : "新建任务"}
              </span>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setTodo(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="task-editor">
              {todo.tasks.map((task, index) => (
                <div className="task-editor-row" key={task.id}>
                  <input
                    type="checkbox"
                    aria-label={`完成任务 ${index + 1}`}
                    checked={task.done}
                    onChange={() =>
                      setTodo({
                        ...todo,
                        tasks: todo.tasks.map((t) =>
                          t.id === task.id ? { ...t, done: !t.done } : t,
                        ),
                      })
                    }
                  />
                  <input
                    autoFocus={index === 0}
                    aria-label={`任务内容 ${index + 1}`}
                    placeholder="任务"
                    value={task.text}
                    onChange={(e) =>
                      setTodo({
                        ...todo,
                        tasks: todo.tasks.map((t) =>
                          t.id === task.id ? { ...t, text: e.target.value } : t,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`删除任务 ${index + 1}`}
                    onClick={() =>
                      setTodo({
                        ...todo,
                        tasks: todo.tasks.filter((t) => t.id !== task.id),
                      })
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="modal-bottom">
              <button
                type="button"
                className="button"
                onClick={() =>
                  setTodo({
                    ...todo,
                    tasks: [
                      ...todo.tasks,
                      { id: uid(), text: "", done: false },
                    ],
                  })
                }
              >
                <Plus size={16} />
                添加任务
              </button>
              <button
                type="submit"
                className="primary"
                disabled={!todo.tasks.some((t) => t.text.trim())}
              >
                保存任务
              </button>
            </div>
          </form>
        </div>
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
              setBoard((b) => ({
                ...b,
                groups: groupDialog.id
                  ? b.groups.map((g) =>
                      g.id === id ? { ...g, name: groupDialog.name.trim() } : g,
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
              }));
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
                      groups: b.groups.filter((g) => g.id !== id),
                      cards: b.cards.map((c) =>
                        c.group === id ? { ...c, group: undefined } : c,
                      ),
                    }));
                    setFilter("all");
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
              <span>导入画布</span>
            </div>
            <p>替换当前画布？（{confirmImport.cards.length} 项）</p>
            <div className="modal-bottom">
              <button className="button" onClick={() => setConfirmImport(null)}>
                取消
              </button>
              <button
                className="primary"
                onClick={() => {
                  setBoard(confirmImport);
                  setConfirmImport(null);
                  setSelection([]);
                  setFilter("all");
                  setQuery("");
                  setDetail(undefined);
                  fit(confirmImport.cards);
                  notify("画布已导入");
                }}
              >
                确认替换
              </button>
            </div>
          </div>
        </div>
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
          {createPreview.kind === "text" ? (
            <StickyNote />
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
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

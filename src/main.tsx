import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
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
  ChevronRight,
  MoreHorizontal,
  Unlink,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  type Board,
  type Card,
  emptyBoard,
  readBoard,
  saveBoard,
  exportBoard,
  importBoard,
} from "./storage";
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
        /\.(txt|md|json|csv|log|xml|yaml|yml)$/i.test(card.title))
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
      title: string;
      text: string;
      id?: string;
      color: string;
    } | null>(null),
    [groupDialog, setGroupDialog] = useState<{
      name: string;
      id?: string;
    } | null>(null),
    [toast, setToast] = useState(""),
    [help, setHelp] = useState(false),
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
    gesture = useRef<{
      kind: "pan" | "move" | "select";
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
  const updateCards = (fn: (cards: Card[]) => Card[]) =>
    setBoard((b) => ({ ...b, cards: fn(b.cards) }));
  const removeSelected = () => {
    if (selection.length) {
      updateCards((cards) => cards.filter((c) => !selection.includes(c.id)));
      setSelection([]);
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".search input")?.focus();
        return;
      }
      if (e.key === "Escape") {
        setNote(null);
        setGroupDialog(null);
        setDetail(undefined);
        setHelp(false);
        setConfirmImport(null);
      }
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,button,[role="dialog"]',
        )
      )
        return;
      if (e.code === "Space") {
        space.current = true;
        e.preventDefault();
      }
      if (e.key === "Escape") {
        setSelection([]);
        setDetail(undefined);
        setHelp(false);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection(board.cards.map((c) => c.id));
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (selection.length > 1) setGroupDialog({ name: "" });
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "v")
        setTool("select");
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "h")
        setTool("hand");
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
  }, [selection, board.cards]);
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
    updateCards((c) => [...c, ...next]);
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
  const addNote = () => setNote({ title: "", text: "", color: colors[0] });
  const submitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note?.title.trim() && !note?.text.trim()) return;
    const n = note!;
    if (n.id)
      updateCards((cards) =>
        cards.map((c) =>
          c.id === n.id
            ? {
                ...c,
                title: n.title.trim() || "未命名笔记",
                text: n.text,
                color: n.color,
              }
            : c,
        ),
      );
    else {
      const id = uid();
      updateCards((cards) => [
        ...cards,
        {
          id,
          kind: "text",
          title: n.title.trim() || "未命名笔记",
          text: n.text,
          color: n.color,
          ...center(),
        },
      ]);
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
        filter === c.group) &&
      (!query ||
        (c.title + " " + c.text).toLowerCase().includes(query.toLowerCase())),
  );
  const pointerDown = (e: React.PointerEvent, id?: string) => {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button === 1) e.preventDefault();
    const r = surface.current!.getBoundingClientRect();
    const pan = tool === "hand" || space.current || e.button === 1;
    let ids = selection;
    if (id && !pan) {
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
      kind: pan ? "pan" : id ? "move" : "select",
      x: e.clientX,
      y: e.clientY,
      view,
      cards: board.cards,
      ids: pan ? [] : id ? ids : e.shiftKey ? selection : [],
      startX: x,
      startY: y,
      moved: false,
    };
    surface.current!.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
    if (g.kind === "pan")
      setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    if (g.kind === "move" && g.moved)
      updateCards((cards) =>
        cards.map((c) => {
          const original = g.cards.find((a) => a.id === c.id);
          return g.ids.includes(c.id) && original
            ? {
                ...c,
                x: original.x + dx / g.view.z,
                y: original.y + dy / g.view.z,
              }
            : c;
        }),
      );
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
    gesture.current = null;
    setMarquee(null);
    if (surface.current?.hasPointerCapture(e.pointerId))
      surface.current.releasePointerCapture(e.pointerId);
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
  const sample = () => {
    const p = center();
    updateCards((c) => [
      ...c,
      {
        id: uid(),
        kind: "text",
        title: "让想法，自由发生。",
        text: "一个念头、一张图片、一段摘录。\n\n把零散的灵感放在这里，慢慢看见它们之间的联系。\n\n拖动卡片整理思绪，按住空格探索更远的地方。",
        color: "#eaf0e8",
        x: p.x - 145,
        y: p.y - 25,
      },
      {
        id: uid(),
        kind: "text",
        title: "从这里开始 ↗",
        text: "01  双击空白处，新建笔记\n02  拖入图片或文件\n03  按住 Shift 多选卡片\n04  把相关的想法分组\n\n你的灵感，只属于你。",
        color: "#fffdf5",
        x: p.x + 125,
        y: p.y + 30,
      },
    ]);
  };
  const current = board.cards.find((c) => c.id === detail);
  return (
    <div className="app">
      <aside className={"sidebar " + (!sidebar ? "collapsed" : "")}>
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-icon">y</span>
          <span>
            yua<span className="brand-light"> canvas</span>
          </span>
        </a>
        <div className="workspace-label">
          个人工作空间 <span>LOCAL</span>
        </div>
        <button
          className="board-nav"
          onClick={() => {
            setFilter("all");
            setQuery("");
          }}
        >
          <span className="nav-icon">
            <Layers size={17} />
          </span>
          <span>
            我的灵感画布<small>{board.cards.length} 个灵感，等待连接</small>
          </span>
          <ChevronRight size={15} />
        </button>
        <div className="section-label">素材库</div>
        <nav>
          {[
            { id: "all", name: "全部内容", icon: Layers },
            { id: "text", name: "文字笔记", icon: StickyNote },
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
          {board.groups.length ? (
            board.groups.map((g) => (
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
          ) : (
            <div className="group-placeholder">
              <Folder size={20} />
              <p>把有联系的灵感放在一起</p>
              <small>选择多个卡片，即可创建分组</small>
            </div>
          )}
        </div>
        <div className="local-info">
          <span className="local-dot" />
          <div>
            只在你的浏览器中<small>无需账号，灵感私有</small>
          </div>
        </div>
        <button className="help-button" onClick={() => setHelp(true)}>
          <span>?</span>画布使用指南
          <ArrowUpRight size={14} />
        </button>
        <div className="sidebar-footer">
          MADE FOR YOUR IDEAS <span>✳</span>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumbs">
            <button
              className="icon-button"
              title={sidebar ? "收起侧栏" : "展开侧栏"}
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>我的灵感画布</strong>
          </div>
          <div className="header-actions">
            <span
              className={"saved " + (saveStatus === "保存失败" ? "error" : "")}
            >
              <span />
              {saveStatus}
            </span>
            <button
              className="button subtle"
              disabled={!ready}
              onClick={() => importInput.current?.click()}
            >
              <Upload size={15} />
              导入
            </button>
            <button className="button" disabled={!ready} onClick={exportAll}>
              <Download size={15} />
              导出画布
            </button>
          </div>
        </header>
        <div className="canvas-bar">
          <div>
            <div className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</div>
            <h1>
              我的灵感画布 <span>✳</span>
            </h1>
            <p>收集碎片，连接想法，让灵感生长。</p>
          </div>
          <label className="search">
            <Search size={16} />
            <input
              aria-label="搜索画布"
              placeholder="寻找一个灵感…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button title="清除搜索" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            ) : (
              <kbd>⌘ K</kbd>
            )}
          </label>
        </div>
        <div
          className={"canvas " + (tool === "hand" ? "hand-tool" : "")}
          ref={surface}
          style={{
            backgroundPosition: `${view.x}px ${view.y}px`,
            backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
          }}
          onPointerDown={(e) => pointerDown(e)}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
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
              if (!cards.length) return null;
              const left = Math.min(...cards.map((c) => c.x)) - 20,
                top = Math.min(...cards.map((c) => c.y)) - 45,
                right = Math.max(...cards.map((c) => c.x + 240)) + 20,
                bottom = Math.max(...cards.map((c) => c.y + 250)) + 20;
              return (
                <div
                  key={g.id}
                  className="group-boundary"
                  style={{
                    left,
                    top,
                    width: right - left,
                    height: bottom - top,
                  }}
                >
                  <button
                    onClick={() => setGroupDialog({ id: g.id, name: g.name })}
                  >
                    <Folder size={13} />
                    {g.name}
                  </button>
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
                  setDetail(c.id);
                }}
              >
                <div className="card-top">
                  <span>
                    {c.kind === "text" ? (
                      <StickyNote size={13} />
                    ) : c.kind === "image" ? (
                      <ImagePlus size={13} />
                    ) : (
                      <FileText size={13} />
                    )}{" "}
                    {c.kind === "text"
                      ? "NOTE"
                      : c.kind === "image"
                        ? "IMAGE"
                        : "FILE"}
                  </span>
                  <button
                    className="card-open"
                    title={`查看 ${c.title}`}
                    onClick={() => setDetail(c.id)}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </div>
                {c.kind === "text" ? (
                  <div className="note-body">
                    <h2>{c.title}</h2>
                    <p>{c.text}</p>
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
                      : "灵感碎片"}
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
          {!board.cards.length && ready && (
            <div className="empty-state">
              <div className="empty-art">
                <div className="art-back">
                  <span>✳</span>
                </div>
                <div className="art-note">
                  <span />
                  <span />
                  <span />
                  <i>ideas start here.</i>
                </div>
                <div className="art-dot">+</div>
                <svg viewBox="0 0 110 75">
                  <path d="M5 66Q72 78 81 17m-16 5 17-12 13 17" />
                </svg>
              </div>
              <span className="empty-tag">无限可能，从一片空白开始</span>
              <h2>
                给灵感一个
                <br />
                <em>自由生长</em>的地方。
              </h2>
              <p>
                文字、图片、文件，随手放进来。
                <br />
                在无限画布上，找到想法之间的连接。
              </p>
              <button className="primary" onClick={addNote}>
                <Plus size={18} />
                创建第一个灵感
              </button>
              <button className="sample-button" onClick={sample}>
                或者，先放两张示例笔记 <ArrowUpRight size={13} />
              </button>
              <div className="empty-hints">
                <span>
                  <ImagePlus size={14} />
                  拖入图片和文件
                </span>
                <i />
                <span>
                  <MousePointer2 size={14} />
                  双击空白创建笔记
                </span>
              </div>
            </div>
          )}
          {board.cards.length > 0 && !visible.length && (
            <div className="no-results">
              <Search size={28} />
              <h3>这里还没有匹配的灵感</h3>
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
          <div className="canvas-corner">
            {filter === "all"
              ? "无限画布"
              : filter === "text"
                ? "文字笔记"
                : filter === "image"
                  ? "图片"
                  : filter === "file"
                    ? "文件"
                    : board.groups.find((g) => g.id === filter)?.name}
            <span>·</span>
            {visible.length} 个内容
          </div>
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
              title="添加笔记"
              aria-label="添加笔记"
              disabled={!ready}
              onClick={addNote}
            >
              <StickyNote size={20} />
            </button>
            <button
              title="上传图片"
              aria-label="上传图片"
              disabled={!ready}
              onClick={() => imageInput.current?.click()}
            >
              <ImagePlus size={20} />
            </button>
            <button
              title="上传文件"
              aria-label="上传文件"
              disabled={!ready}
              onClick={() => fileInput.current?.click()}
            >
              <FileUp size={20} />
            </button>
            <i />
            <button
              className="add-button"
              aria-label="新建内容"
              disabled={!ready}
              onClick={addNote}
            >
              <Plus size={21} />
            </button>
          </div>
          <div className="tool-caption">所有好想法，都值得被留下。</div>
        </div>
        <div className="zoom-controls">
          <button aria-label="缩小" onClick={() => zoom(1 / 1.2)}>
            <Minus size={16} />
          </button>
          <button title="重置缩放" onClick={() => zoom(1 / view.z)}>
            {Math.round(view.z * 100)}%
          </button>
          <button aria-label="放大" onClick={() => zoom(1.2)}>
            <Plus size={16} />
          </button>
          <i />
          <button aria-label="适应所有内容" onClick={() => fit()}>
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
          void addFiles(e.target.files);
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
          void addFiles(e.target.files);
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
                {note.id ? "编辑笔记" : "一个新的灵感"}
              </span>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setNote(null)}
              >
                <X size={20} />
              </button>
            </div>
            <input
              autoFocus
              aria-label="笔记标题"
              placeholder="给这个想法起个名字…"
              maxLength={200}
              value={note.title}
              onChange={(e) => setNote({ ...note, title: e.target.value })}
            />
            <textarea
              aria-label="笔记内容"
              placeholder="写下此刻的想法，不必完整，也不必完美。"
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
                disabled={!note.title.trim() && !note.text.trim()}
                type="submit"
              >
                保存笔记
                <ArrowUpRight size={15} />
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
                  : [...b.groups, { id, name: groupDialog.name.trim() }],
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
                {groupDialog.id ? "重命名分组" : "把灵感连接起来"}
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
                placeholder="例如：下一次旅行"
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
              ) : (
                <small>{selection.length} 个灵感将归入此分组</small>
              )}
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
              {current.kind === "text" ? (
                <p className="full-text">{current.text}</p>
              ) : (
                <Attachment card={current} large />
              )}
            </div>
            <div className="modal-bottom">
              <small>
                {current.kind === "text" ? "文字笔记" : current.mime || "文件"}
              </small>
              {current.kind === "text" ? (
                <button
                  className="primary"
                  onClick={() => {
                    setNote({
                      id: current.id,
                      title: current.title,
                      text: current.text,
                      color: current.color,
                    });
                    setDetail(undefined);
                  }}
                >
                  编辑笔记
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() => download(current.blob!, current.title)}
                >
                  <Download size={15} />
                  下载原文件
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <div
            className="modal compact help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="使用指南"
          >
            <div className="modal-heading">
              <span>在这里，让想法自由发生</span>
              <button aria-label="关闭指南" onClick={() => setHelp(false)}>
                <X size={20} />
              </button>
            </div>
            <p>
              点击工具栏添加笔记、图片和文件，也可以直接拖入文件，或按 Cmd/Ctrl
              + V 粘贴剪贴板中的图片和文件。点击卡片右上角箭头查看完整内容。
            </p>
            <dl>
              <dt>移动画布</dt>
              <dd>空格 + 拖动 / H / 滚轮</dd>
              <dt>缩放</dt>
              <dd>Ctrl / ⌘ + 滚轮，或右下角按钮</dd>
              <dt>多选</dt>
              <dd>Shift + 点击 / 空白处框选</dd>
              <dt>全部选择</dt>
              <dd>Ctrl / ⌘ + A</dd>
              <dt>创建分组</dt>
              <dd>多选后点击「创建分组」</dd>
              <dt>删除所选</dt>
              <dd>Delete / Backspace</dd>
            </dl>
            <p className="privacy-note">
              数据与附件保存在当前浏览器的 IndexedDB
              中。清理网站数据、更换设备或使用隐私模式可能导致数据丢失，请定期导出备份。导入会替换当前画布。
            </p>
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
            <p>
              将导入 {confirmImport.cards.length} 个内容和{" "}
              {confirmImport.groups.length}{" "}
              个分组，并替换当前画布。建议先导出当前内容。
            </p>
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

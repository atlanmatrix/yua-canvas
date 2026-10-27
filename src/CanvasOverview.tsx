import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box } from "lucide-react";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { Minimap } from "./Minimap";
import { projectMinimap, type MinimapProjection } from "./minimapGeometry";
import { DEFAULT_VIEW } from "./workspace";
import type { Board, Navigation, Rect, View } from "./storage";
type Level = { board: Board; path: string[]; name: string; depth: number };
function levels(board: Board, path: string[] = [], name = "根画布"): Level[] {
  return [
    { board, path, name, depth: path.length },
    ...board.cards.flatMap((c) =>
      c.canvas ? levels(c.canvas, [...path, c.id], c.title || "子画布") : [],
    ),
  ];
}
export function CanvasOverview({
  root,
  path,
  board,
  view,
  navigation,
  viewport,
  projection,
  selection,
  offsets,
  onNavigate,
  onDragChange,
  onSwitch,
  dragging,
  onPreview3D,
}: {
  root: Board;
  path: string[];
  board: Board;
  view: View;
  navigation: Navigation;
  viewport: Rect;
  projection: MinimapProjection;
  selection: string[];
  offsets: Record<string, { y: number; visible: boolean }>;
  onNavigate: (p: { x: number; y: number }) => void;
  onDragChange: (dragging: boolean) => void;
  onSwitch: (path: string[]) => void;
  dragging: boolean;
  onPreview3D: () => void;
}) {
  const [preview, setPreview] = useState<Level>(),
    [active, setActive] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const overview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest(".context-menu")) setMenu(undefined);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(undefined);
        overview.current?.querySelector<HTMLButtonElement>(".minimap")?.focus();
      }
    };
    const dismiss = () => setMenu(undefined);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", dismiss);
    };
  }, [menu]);
  useEffect(() => {
    setActive(true);
    const timer = setTimeout(() => setActive(false), 1200);
    return () => clearTimeout(timer);
  }, [board, view]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = (e: Event) => {
      if (e instanceof PointerEvent && e.type === "pointermove" && !e.buttons)
        return;
      if (
        !(e.target instanceof Element) ||
        !e.target.closest(".canvas,.minimap")
      )
        return;
      setActive(true);
      clearTimeout(timer);
      timer = setTimeout(() => setActive(false), 1200);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerup", wake);
    window.addEventListener("wheel", wake, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerup", wake);
      window.removeEventListener("wheel", wake);
    };
  }, []);
  const all = levels(root),
    current = JSON.stringify(path),
    target =
      preview &&
      all.find((l) => JSON.stringify(l.path) === JSON.stringify(preview.path));
  const showingOther = target && JSON.stringify(target.path) !== current;
  const previewView = showingOther
    ? navigation.views[target.board.id || ""] || DEFAULT_VIEW
    : view;
  const previewViewport = showingOther
    ? {
        x: -previewView.x / previewView.z,
        y: -previewView.y / previewView.z,
        width: (viewport.width * view.z) / previewView.z,
        height: (viewport.height * view.z) / previewView.z,
      }
    : viewport;
  return (
    <div
      ref={overview}
      className={"canvas-overview " + (active || dragging ? "active" : "idle")}
      onPointerLeave={() => setPreview(undefined)}
      onContextMenu={(e) => {
        if (!(e.target as Element).closest(".minimap")) return;
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onKeyDown={(e) => {
        if (!(e.target as Element).closest(".minimap")) return;
        if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setMenu({ x: rect.left + 20, y: rect.top + 20 });
      }}
    >
      <Minimap
        board={showingOther ? target.board : board}
        viewport={previewViewport}
        projection={
          showingOther
            ? projectMinimap(target.board, previewViewport)
            : projection
        }
        selection={showingOther ? [] : selection}
        offsets={showingOther ? {} : offsets}
        onDragChange={onDragChange}
        onNavigate={(point) => {
          if (showingOther) onSwitch(target.path);
          onNavigate(point);
        }}
      />
      <nav className="canvas-levels" aria-label="画布层级">
        {all.map((level) => {
          const key = JSON.stringify(level.path),
            selected = key === current;
          return (
            <button
              key={key}
              aria-label={`第 ${level.depth + 1} 层：${level.name}`}
              aria-current={selected ? "page" : undefined}
              title={`${"　".repeat(level.depth)}${level.name}`}
              onPointerEnter={() => setPreview(level)}
              onFocus={() => setPreview(level)}
              onBlur={() => setPreview(undefined)}
              onClick={() => {
                setPreview(undefined);
                onSwitch(level.path);
              }}
            >
              <span style={{ marginLeft: Math.min(level.depth, 4) * 2 }} />
            </button>
          );
        })}
      </nav>
      {target && (
        <span className="level-caption">
          第 {target.depth + 1} 层 · {target.name}
        </span>
      )}
      {menu &&
        createPortal(
          <CanvasContextMenu x={menu.x} y={menu.y}>
            <button
              role="menuitem"
              autoFocus
              onClick={() => {
                setMenu(undefined);
                onPreview3D();
              }}
            >
              <Box size={15} />
              3D 预览
            </button>
          </CanvasContextMenu>,
          document.body,
        )}
    </div>
  );
}

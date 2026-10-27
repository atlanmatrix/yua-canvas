import { useEffect, useState } from "react";
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
}) {
  const [preview, setPreview] = useState<Level>(),
    [active, setActive] = useState(true);
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
      className={"canvas-overview " + (active || dragging ? "active" : "idle")}
      onPointerLeave={() => setPreview(undefined)}
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
    </div>
  );
}

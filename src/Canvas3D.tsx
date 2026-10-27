import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Box,
  FileText,
  Image as ImageIcon,
  ListTodo,
  Maximize,
  Minus,
  PanelsTopLeft,
  Plus,
  RotateCcw,
} from "lucide-react";
import type { Board, Card } from "./storage";
import { cardRect } from "./geometry";
import { curve, curveMidpoint, endpointPoint } from "./connections";
import { ConnectionArrow } from "./ConnectionArrow";
import { isTextFile, fileText } from "./clipboard";
import { canvas3DLayers, type Canvas3DLayer } from "./canvas3dGeometry";
import "./canvas3d.css";

const initialCamera = () => ({ pitch: 48, yaw: -18, zoom: 1, x: 0, y: 0 });
const clampZoom = (zoom: number) => Math.max(0.15, Math.min(5, zoom));
const icons = {
  text: FileText,
  image: ImageIcon,
  file: FileText,
  todo: ListTodo,
  canvas: PanelsTopLeft,
  miniature: Box,
};

function ComponentPreview({ card }: { card: Card }) {
  const [image, setImage] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    if (!card.blob) return;
    if (card.kind === "image") {
      const url = URL.createObjectURL(card.blob);
      setImage(url);
      return () => URL.revokeObjectURL(url);
    }
    if (card.kind !== "file" || !isTextFile(card)) return;
    let active = true;
    void fileText(card.blob.slice(0, 64 * 1024))
      .then((value) => {
        if (active) setText(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [card.kind, card.blob, card.title, card.mime]);
  if (card.kind === "image" && image)
    return <img src={image} alt={card.title} draggable={false} />;
  if (card.kind === "text") return <pre>{card.text.slice(0, 3000)}</pre>;
  if (card.kind === "todo")
    return (
      <ul>
        {card.tasks?.slice(0, 30).map((task) => (
          <li key={task.id}>
            {task.done ? "☑" : "☐"} {task.text}
          </li>
        ))}
      </ul>
    );
  if (card.kind === "file" && text) return <pre>{text.slice(0, 3000)}</pre>;
  return (
    <div className="canvas3d-component-symbol">
      {card.kind === "canvas" ? (
        <>
          <PanelsTopLeft size={42} />
          <span>{card.canvas?.cards.length || 0} 个组件</span>
        </>
      ) : card.kind === "miniature" ? (
        <>
          <Box size={42} />
          <span>3D 场景</span>
        </>
      ) : (
        <>
          <FileText size={42} />
          <span>{card.title}</span>
        </>
      )}
    </div>
  );
}

function HierarchyLink({
  parent,
  child,
  gap,
}: {
  parent: Canvas3DLayer;
  child: Canvas3DLayer;
  gap: number;
}) {
  if (!child.source) return null;
  const rect = cardRect(child.source);
  const start = {
    x: parent.x + (rect.x - parent.bounds.x + rect.width / 2) * parent.scale,
    y: parent.y + (rect.y - parent.bounds.y + rect.height / 2) * parent.scale,
    z: parent.depth * gap,
  };
  const dx = child.x + child.width / 2 - start.x,
    dy = child.y - start.y,
    dz = (child.depth - parent.depth) * gap;
  return (
    <div
      className="canvas3d-hierarchy-link"
      aria-hidden="true"
      style={{
        width: Math.hypot(dx, dy, dz),
        transform: `translate3d(${start.x}px,${start.y}px,${start.z}px) rotateZ(${Math.atan2(dy, dx)}rad) rotateY(${-Math.atan2(dz, Math.hypot(dx, dy))}rad)`,
      }}
    />
  );
}

export function Canvas3D({
  root,
  path,
  onClose,
  onOpen,
}: {
  root: Board;
  path: string[];
  onClose: () => void;
  onOpen: (path: string[], card?: string) => void;
}) {
  const layers = useMemo(() => canvas3DLayers(root), [root]);
  const layerByKey = useMemo(
    () => new Map(layers.map((layer) => [layer.key, layer])),
    [layers],
  );
  const pathKey = JSON.stringify(path);
  const [camera, setCamera] = useState(initialCamera);
  const [gap, setGap] = useState(220);
  const [focused, setFocused] = useState<string>();
  const [solo, setSolo] = useState(false);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const stage = useRef<HTMLDivElement>(null),
    page = useRef<HTMLElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0),
    distance = useRef(0);
  const focusedLayer = layers.find((l) => l.key === focused);
  const shown = solo && focusedLayer ? [focusedLayer] : layers;
  const depth = Math.max(...layers.map((l) => l.depth));
  const span =
    Math.max(...layers.map((l) => l.x + l.width)) -
    Math.min(...layers.map((l) => l.x));
  const fit = focusedLayer
    ? Math.min(
        1.5,
        (size.width - 80) / focusedLayer.width,
        (size.height - 100) / focusedLayer.height,
      )
    : Math.min(
        1.2,
        (size.width - 80) / Math.max(720, span),
        (size.height - 100) / (500 + depth * gap * 0.8),
      );
  const pivot = focusedLayer
    ? {
        x: focusedLayer.x + focusedLayer.width / 2,
        y: focusedLayer.y + focusedLayer.height / 2,
        z: focusedLayer.depth * gap,
      }
    : { x: 0, y: 0, z: (depth * gap) / 2 };
  const reset = () => {
    setCamera(initialCamera());
    setFocused(undefined);
    setSolo(false);
  };
  const focus = useCallback((layer: Canvas3DLayer) => {
    setFocused(layer.key);
    setCamera({ ...initialCamera(), pitch: 18, yaw: 0 });
  }, []);
  const activate = useCallback(
    (layer: Canvas3DLayer, card?: string) => {
      if (performance.now() < moved.current) return;
      onOpen(layer.path, card);
    },
    [onOpen],
  );
  useEffect(() => {
    page.current?.focus({ preventScroll: true });
    const el = stage.current;
    if (!el) return;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setCamera((c) => ({
        ...c,
        zoom: clampZoom(c.zoom * Math.exp(-event.deltaY * 0.002)),
      }));
    };
    const cancel = () => {
      pointers.current.clear();
      distance.current = 0;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("blur", cancel);
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", cancel);
    };
  }, []);

  // Camera changes only update the scene transform; static card previews stay mounted.
  const sceneContent = useMemo(
    () => (
      <>
        {!solo &&
          layers.map((layer) => {
            const parent = layer.parent
              ? layerByKey.get(layer.parent)
              : undefined;
            return parent ? (
              <HierarchyLink
                key={layer.key}
                parent={parent}
                child={layer}
                gap={gap}
              />
            ) : null;
          })}
        {shown.map((layer, layerIndex) => (
          <div
            key={layer.key}
            className={
              "canvas3d-layer" +
              (layer.key === (focused || pathKey) ? " current" : "")
            }
            data-3d-layer={layer.key}
            data-depth={layer.depth}
            style={{
              width: layer.width,
              height: layer.height,
              transform: `translate3d(${layer.x}px,${layer.y}px,${layer.depth * gap}px)`,
            }}
          >
            <button
              className="canvas3d-layer-title"
              title={layer.trail}
              onClick={() => focus(layer)}
              onDoubleClick={() => activate(layer)}
            >
              <span>{String(layer.depth + 1).padStart(2, "0")}</span>
              {layer.name}
            </button>
            {!layer.board.cards.length && (
              <span className="canvas3d-empty">空画布</span>
            )}
            <div
              className="canvas3d-layer-content"
              style={{
                transform: `scale(${layer.scale}) translate(${-layer.bounds.x}px,${-layer.bounds.y}px)`,
              }}
            >
              {layer.board.groups.map(
                (g) =>
                  g.bounds && (
                    <div
                      key={g.id}
                      className="canvas3d-group"
                      style={{
                        left: g.bounds.x,
                        top: g.bounds.y,
                        width: g.bounds.width,
                        height: g.bounds.height,
                        borderColor: g.color,
                      }}
                    >
                      <span>{g.name}</span>
                    </div>
                  ),
              )}
              <svg
                className="canvas3d-connections"
                aria-hidden="true"
                style={{
                  left: layer.bounds.x,
                  top: layer.bounds.y,
                  width: layer.bounds.width,
                  height: layer.bounds.height,
                }}
                viewBox={`${layer.bounds.x} ${layer.bounds.y} ${layer.bounds.width} ${layer.bounds.height}`}
              >
                <defs>
                  <ConnectionArrow
                    id={`preview-arrow-${layerIndex}`}
                    size={8}
                    color="#94a3b8"
                  />
                </defs>
                {layer.board.connections?.map((c) => {
                  const from = endpointPoint(c.from, layer.board.cards),
                    to = endpointPoint(c.to, layer.board.cards);
                  const middle = curveMidpoint(
                    from,
                    to,
                    c.from.side,
                    c.to.side,
                  );
                  return (
                    <g key={c.id}>
                      <path
                        d={curve(from, to, c.from.side, c.to.side)}
                        markerEnd={`url(#preview-arrow-${layerIndex})`}
                      />
                      {c.label && (
                        <text x={middle.x} y={middle.y - 8} textAnchor="middle">
                          {c.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              {layer.board.cards.map((card) => {
                const r = cardRect(card),
                  Icon = icons[card.kind];
                const name =
                  card.title ||
                  (card.kind === "text"
                    ? card.text.slice(0, 60)
                    : card.kind === "todo"
                      ? "任务"
                      : "组件");
                return (
                  <div
                    key={card.id}
                    className="canvas3d-component"
                    data-3d-card={card.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${layer.trail}：${name}`}
                    title="双击进入画布并打开组件"
                    style={{
                      left: r.x,
                      top: r.y,
                      width: r.width,
                      height: r.height,
                      background: card.color,
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      activate(layer, card.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpen(layer.path, card.id);
                      }
                    }}
                  >
                    <div className="canvas3d-component-title">
                      <Icon size={15} />
                      <span>{name}</span>
                    </div>
                    <div className="canvas3d-component-body">
                      <ComponentPreview card={card} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </>
    ),
    [layers, layerByKey, solo, focused, pathKey, gap, activate, focus],
  );

  return (
    <section
      ref={page}
      className="canvas3d-page"
      aria-label="3D 画布预览"
      tabIndex={-1}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return;
        }
        if ((e.target as HTMLElement).closest("input,select,button")) return;
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "+",
            "=",
            "-",
            "0",
          ].includes(e.key)
        )
          e.preventDefault();
        if (e.key === "0") reset();
        else if (["+", "=", "-"].includes(e.key))
          setCamera((c) => ({
            ...c,
            zoom: clampZoom(c.zoom * (e.key === "-" ? 1 / 1.2 : 1.2)),
          }));
        else if (e.key.startsWith("Arrow"))
          setCamera((c) => ({
            ...c,
            yaw:
              c.yaw +
              (e.key === "ArrowLeft" ? -8 : e.key === "ArrowRight" ? 8 : 0),
            pitch: Math.max(
              -80,
              Math.min(
                80,
                c.pitch +
                  (e.key === "ArrowUp" ? 8 : e.key === "ArrowDown" ? -8 : 0),
              ),
            ),
          }));
      }}
    >
      <header className="canvas3d-header">
        <button onClick={onClose} aria-label="返回画布">
          <ArrowLeft size={17} />
          <span>返回画布</span>
        </button>
        <div>
          <h1>
            <Box size={20} />
            3D 画布预览
          </h1>
          <p>
            {layers.length} 个画布 ·{" "}
            {layers.reduce((sum, l) => sum + l.board.cards.length, 0)} 个组件
          </p>
        </div>
        <button onClick={reset} aria-label="重置 3D 视角">
          <RotateCcw size={17} />
          <span>重置视角</span>
        </button>
      </header>
      <div className="canvas3d-body">
        <div
          ref={stage}
          className="canvas3d-stage"
          data-testid="canvas3d-stage"
          aria-label="拖动旋转，滚轮缩放，Shift 或右键拖动平移"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            if ((e.target as Element).closest(".canvas3d-tools")) return;
            if (![0, 1, 2].includes(e.button)) return;
            if (e.button !== 0) e.preventDefault();
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            (e.target as Element).setPointerCapture(e.pointerId);
            const points = [...pointers.current.values()];
            if (points.length === 2)
              distance.current = Math.hypot(
                points[0].x - points[1].x,
                points[0].y - points[1].y,
              );
          }}
          onPointerMove={(e) => {
            const previous = pointers.current.get(e.pointerId);
            if (!previous) return;
            const dx = e.clientX - previous.x,
              dy = e.clientY - previous.y;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (Math.hypot(dx, dy) < 0.5) return;
            moved.current = performance.now() + 250;
            const points = [...pointers.current.values()];
            if (points.length >= 2) {
              const next = Math.hypot(
                  points[0].x - points[1].x,
                  points[0].y - points[1].y,
                ),
                previousDistance = distance.current;
              distance.current = next;
              setCamera((c) => ({
                ...c,
                zoom:
                  previousDistance > 0
                    ? clampZoom((c.zoom * next) / previousDistance)
                    : c.zoom,
                x: c.x + dx / 2,
                y: c.y + dy / 2,
              }));
            } else if (e.shiftKey || e.buttons === 2 || e.buttons === 4)
              setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
            else
              setCamera((c) => ({
                ...c,
                yaw: (c.yaw + dx * 0.35) % 360,
                pitch: Math.max(-80, Math.min(80, c.pitch - dy * 0.35)),
              }));
          }}
          onPointerUp={(e) => {
            pointers.current.delete(e.pointerId);
            distance.current = 0;
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            distance.current = 0;
          }}
          onLostPointerCapture={(e) => pointers.current.delete(e.pointerId)}
        >
          <div className="canvas3d-origin">
            <div
              className="canvas3d-scene"
              data-testid="canvas3d-scene"
              style={{
                transform: `translate3d(${camera.x}px,${camera.y}px,0) scale(${Math.max(0.01, fit) * camera.zoom}) rotateX(${camera.pitch}deg) rotateZ(${camera.yaw}deg) translate3d(${-pivot.x}px,${-pivot.y}px,${-pivot.z}px)`,
              }}
            >
              {sceneContent}
            </div>
          </div>
          <div className="canvas3d-tools">
            <button
              aria-label="缩小 3D 预览"
              onClick={() =>
                setCamera((c) => ({ ...c, zoom: clampZoom(c.zoom / 1.2) }))
              }
            >
              <Minus size={17} />
            </button>
            <output aria-label="3D 缩放比例">
              {Math.round(camera.zoom * 100)}%
            </output>
            <button
              aria-label="放大 3D 预览"
              onClick={() =>
                setCamera((c) => ({ ...c, zoom: clampZoom(c.zoom * 1.2) }))
              }
            >
              <Plus size={17} />
            </button>
            <button aria-label="适应全部画布" onClick={reset}>
              <Maximize size={17} />
            </button>
          </div>
          <p className="canvas3d-hint">
            拖动旋转 · 滚轮缩放 · Shift / 右键拖动平移 · 双击组件打开
          </p>
        </div>
        <aside className="canvas3d-sidebar">
          <h2>画布层级</h2>
          <p>选择画布聚焦，双击组件进入编辑。</p>
          <nav aria-label="3D 画布列表">
            {layers.map((layer) => (
              <div
                key={layer.key}
                className="canvas3d-tree-row"
                style={{ paddingLeft: Math.min(layer.depth, 5) * 12 }}
              >
                <button
                  aria-label={`聚焦 ${layer.trail}`}
                  aria-pressed={focused === layer.key}
                  onClick={() => focus(layer)}
                >
                  <PanelsTopLeft size={15} />
                  <span>{layer.name}</span>
                  <small>{layer.board.cards.length}</small>
                </button>
                <button
                  aria-label={`进入 ${layer.trail}`}
                  onClick={() => onOpen(layer.path)}
                >
                  <ArrowLeft
                    size={14}
                    style={{ transform: "rotate(180deg)" }}
                  />
                </button>
              </div>
            ))}
          </nav>
          <label className="canvas3d-solo">
            <input
              type="checkbox"
              checked={solo}
              disabled={!focusedLayer}
              onChange={(e) => setSolo(e.target.checked)}
            />
            仅显示聚焦画布
          </label>
          <label className="canvas3d-spacing">
            层间距 <output>{gap}</output>
            <input
              aria-label="3D 层间距"
              type="range"
              min="80"
              max="400"
              step="20"
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
            />
          </label>
        </aside>
      </div>
    </section>
  );
}

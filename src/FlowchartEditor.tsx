import { ModalBackdrop } from "./ModalBackdrop";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Hand, MousePointer2, Redo2 } from "lucide-react";
import {
  Link2,
  Maximize,
  Minus,
  Plus,
  Trash2,
  Undo2,
  Workflow,
  X,
} from "./icons";
import {
  FlowArtwork,
  FlowEdgeView,
  FlowShapeView,
  flowLayout,
  flowPalette,
} from "./Flowchart";
import {
  FLOW_LIMITS,
  FLOW_SHAPES,
  FLOW_SIDES,
  FLOW_TONES,
  newFlowNode,
  parseFlowchart,
  type FlowNode,
  type FlowPoint,
  type FlowPort,
  type FlowShape,
  type FlowTone,
  type FlowchartData,
} from "./flowchartData";
import { flowPort } from "./flowchartGeometry";
import { t as tr, useDarkTheme } from "./i18n";

type Mode = "select" | "connect" | "pan";
type Selection = { kind: "node" | "edge"; id: string };
type View = FlowPoint & { scale: number };
type History = {
  past: FlowchartData[];
  current: FlowchartData;
  future: FlowchartData[];
};
type Gesture = {
  pointer: number;
  origin: FlowPoint;
} & (
  | { kind: "move" | "resize"; node: FlowNode; scale: number }
  | { kind: "pan"; view: View }
  | { kind: "link"; from: FlowPort; start: FlowPoint }
);
const shapes = Object.keys(FLOW_SHAPES) as FlowShape[];
const tones = Object.keys(FLOW_TONES) as FlowTone[];
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const snap = (value: number) => Math.round(value / 8) * 8;
const position = (value: number) =>
  clamp(value, -FLOW_LIMITS.position, FLOW_LIMITS.position);

function dragNode(
  gesture: Extract<Gesture, { node: FlowNode }>,
  point: FlowPoint,
  free: boolean,
) {
  const { node, origin, scale } = gesture;
  const dx = (point.x - origin.x) / scale;
  const dy = (point.y - origin.y) / scale;
  const round = free ? Math.round : snap;
  return gesture.kind === "move"
    ? {
        ...node,
        x: position(round(node.x + dx)),
        y: position(round(node.y + dy)),
      }
    : {
        ...node,
        width: clamp(round(node.width + dx), 36, 2000),
        height: clamp(round(node.height + dy), 36, 2000),
      };
}

export function FlowchartEditor({
  text,
  onSave,
  onClose,
}: {
  text: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    current: parseFlowchart(text),
    future: [],
  }));
  const { current: data } = history;
  const [selected, setSelected] = useState<Selection>();
  const [mode, setMode] = useState<Mode>("select");
  const [source, setSource] = useState<FlowPort>();
  const [moving, setMoving] = useState<FlowNode>();
  const [draftLink, setDraftLink] = useState<{
    start: FlowPoint;
    end: FlowPoint;
  }>();
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const gesture = useRef<Gesture>(null);
  const svg = useRef<SVGSVGElement>(null);
  const labelInput = useRef<HTMLTextAreaElement>(null);
  const editLabelId = useRef<string>(null);
  const dark = useDarkTheme();
  const working = useMemo(
    () =>
      moving
        ? {
            ...data,
            nodes: data.nodes.map((node) =>
              node.id === moving.id ? moving : node,
            ),
          }
        : data,
    [data, moving],
  );
  const layout = useMemo(() => flowLayout(working), [working]);
  const node =
    selected?.kind === "node"
      ? data.nodes.find((node) => node.id === selected.id)
      : undefined;
  const edge =
    selected?.kind === "edge"
      ? data.edges.find((edge) => edge.id === selected.id)
      : undefined;

  const fit = () => {
    if (!svg.current) return;
    const { width, height } = svg.current.getBoundingClientRect();
    const bounds = layout.bounds;
    const margin = Math.min(44, width * 0.12, height * 0.12);
    const scale = clamp(
      Math.min(
        (width - margin * 2) / bounds.width,
        (height - margin * 2) / bounds.height,
      ),
      0.01,
      1.25,
    );
    setView({
      scale,
      x: (width - bounds.width * scale) / 2 - bounds.x * scale,
      y: (height - bounds.height * scale) / 2 - bounds.y * scale,
    });
  };
  useLayoutEffect(() => {
    fit();
    svg.current?.focus({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    if (editLabelId.current && editLabelId.current === selected?.id) {
      editLabelId.current = null;
      labelInput.current?.focus();
      labelInput.current?.select();
    }
  }, [selected]);

  const commit = (update: (before: FlowchartData) => FlowchartData) => {
    setHistory(({ current, past, future }) => {
      const next = update(current);
      return next === current
        ? { current, past, future }
        : {
            current: next,
            past: [...past.slice(-59), current],
            future: [],
          };
    });
  };
  const stepHistory = (redo: boolean) => {
    setSource(undefined);
    setHistory(({ current, past, future }) => {
      if (redo && future.length)
        return {
          current: future[0],
          past: [...past, current],
          future: future.slice(1),
        };
      if (!redo && past.length)
        return {
          current: past[past.length - 1],
          past: past.slice(0, -1),
          future: [current, ...future],
        };
      return { current, past, future };
    });
  };
  const updateNode = (id: string, patch: Partial<FlowNode>) =>
    commit((before) => ({
      ...before,
      nodes: before.nodes.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  const remove = () => {
    if (!node && !edge) return;
    commit((before) => ({
      ...before,
      nodes: before.nodes.filter((item) => item.id !== node?.id),
      edges: before.edges.filter(
        (item) =>
          item.id !== edge?.id &&
          item.from.node !== node?.id &&
          item.to.node !== node?.id,
      ),
    }));
    setSelected(undefined);
    setSource(undefined);
    svg.current?.focus();
  };
  const localPoint = ({ x, y }: FlowPoint) => {
    const bounds = svg.current!.getBoundingClientRect();
    return { x: x - bounds.left, y: y - bounds.top };
  };
  const worldPoint = (point: FlowPoint) => ({
    x: (point.x - view.x) / view.scale,
    y: (point.y - view.y) / view.scale,
  });
  const zoomAt = (factor: number, point?: FlowPoint) => {
    if (!svg.current) return;
    const p = point || {
      x: svg.current.clientWidth / 2,
      y: svg.current.clientHeight / 2,
    };
    setView((v) => {
      const scale = clamp(v.scale * factor, 0.01, 4);
      const ratio = scale / v.scale;
      return {
        scale,
        x: p.x + (v.x - p.x) * ratio,
        y: p.y + (v.y - p.y) * ratio,
      };
    });
  };
  useLayoutEffect(() => {
    const surface = svg.current;
    if (!surface) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
      const units =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? surface!.clientHeight
            : 1;
      if (event.ctrlKey || event.metaKey) {
        zoomAt(
          Math.exp((-event.deltaY * units) / 360),
          localPoint({ x: event.clientX, y: event.clientY }),
        );
      } else {
        setView((v) => ({
          ...v,
          x: v.x - event.deltaX * units,
          y: v.y - event.deltaY * units,
        }));
      }
    }
    surface.addEventListener("wheel", wheel, { passive: false });
    return () => surface.removeEventListener("wheel", wheel);
  }, []);

  const chooseMode = (next: Mode) => {
    setMode(next);
    setSource(undefined);
  };
  const add = (shape: FlowShape, point?: FlowPoint) => {
    if (data.nodes.length >= FLOW_LIMITS.nodes || !svg.current) return;
    const { width, height, name } = FLOW_SHAPES[shape];
    const center = worldPoint(
      point || {
        x: svg.current.clientWidth / 2,
        y: svg.current.clientHeight / 2,
      },
    );
    let x = position(snap(center.x - width / 2)),
      y = position(snap(center.y - height / 2));
    if (!point) {
      for (let i = 0; i < data.nodes.length; i++) {
        if (
          !data.nodes.some(
            (item) =>
              item.x < x + width &&
              item.x + item.width > x &&
              item.y < y + height &&
              item.y + item.height > y,
          )
        )
          break;
        x = position(x + 24);
        y = position(y + 24);
      }
    }
    const item = newFlowNode(shape, { x, y }, tr(name));
    commit((before) => ({ ...before, nodes: [...before.nodes, item] }));
    setSelected({ kind: "node", id: item.id });
    chooseMode("select");
    svg.current.focus();
  };
  const connect = (from: FlowPort, to: FlowPort) => {
    if (from.node === to.node || data.edges.length >= FLOW_LIMITS.edges) return;
    const existing = data.edges.find(
      (item) =>
        item.from.node === from.node &&
        item.to.node === to.node &&
        item.from.side === from.side &&
        item.to.side === to.side,
    );
    const item = existing || { id: crypto.randomUUID(), from, to, label: "" };
    if (!existing)
      commit((before) => ({ ...before, edges: [...before.edges, item] }));
    setSelected({ kind: "edge", id: item.id });
    setSource(undefined);
  };
  const pickNode = (id: string) => {
    if (mode === "connect") {
      if (source) {
        connect(source, { node: id });
        return;
      }
      setSource({ node: id });
    }
    setSelected({ kind: "node", id });
  };
  const editLabel = (selection: Selection) => {
    if (selected?.kind === selection.kind && selected.id === selection.id) {
      labelInput.current?.focus();
      labelInput.current?.select();
    } else {
      editLabelId.current = selection.id;
      setSelected(selection);
    }
  };
  const editLabelAt = (event: MouseEvent<SVGSVGElement>) => {
    if (mode !== "select") return;
    // Pointer capture keeps drags on the canvas, so a double click can target
    // the canvas even when both clicks landed on the same shape.
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!event.currentTarget.contains(target)) return;
    const nodeId = target
      ?.closest("[data-flow-node]")
      ?.getAttribute("data-flow-node");
    const edgeId = target
      ?.closest("[data-flow-edge]")
      ?.getAttribute("data-flow-edge");
    if (nodeId) editLabel({ kind: "node", id: nodeId });
    else if (edgeId) editLabel({ kind: "edge", id: edgeId });
  };
  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (gesture.current || (event.button !== 0 && event.button !== 1)) return;
    const target = event.target instanceof Element ? event.target : null;
    const nodeId = target
      ?.closest("[data-flow-node]")
      ?.getAttribute("data-flow-node");
    const edgeId = target
      ?.closest("[data-flow-edge]")
      ?.getAttribute("data-flow-edge");
    const hitNode = data.nodes.find((item) => item.id === nodeId);
    const side = FLOW_SIDES.find(
      (side) =>
        side ===
        target?.closest("[data-flow-port]")?.getAttribute("data-flow-port"),
    );
    const origin = { x: event.clientX, y: event.clientY };
    const base = { origin, pointer: event.pointerId };
    event.currentTarget.focus();
    if (mode === "pan" || event.button === 1) {
      gesture.current = { ...base, kind: "pan", view };
      setPanning(true);
    } else if (hitNode && side) {
      const start = flowPort(hitNode, side);
      gesture.current = {
        ...base,
        kind: "link",
        from: { node: hitNode.id, side },
        start,
      };
      setDraftLink({ start, end: start });
      setSource(undefined);
    } else if (hitNode) {
      pickNode(hitNode.id);
      if (mode === "select")
        gesture.current = {
          ...base,
          kind: target?.hasAttribute("data-flow-resize") ? "resize" : "move",
          node: hitNode,
          scale: view.scale,
        };
    } else {
      setSelected(edgeId ? { kind: "edge", id: edgeId } : undefined);
      setSource(undefined);
    }
    if (gesture.current) event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const drag = gesture.current;
    if (!drag || event.pointerId !== drag.pointer) return;
    const point = { x: event.clientX, y: event.clientY };
    if (drag.kind === "pan")
      setView({
        ...drag.view,
        x: drag.view.x + point.x - drag.origin.x,
        y: drag.view.y + point.y - drag.origin.y,
      });
    else if (drag.kind === "link")
      setDraftLink({ start: drag.start, end: worldPoint(localPoint(point)) });
    else if (
      Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) > 3 ||
      moving
    )
      setMoving(dragNode(drag, point, event.altKey));
  };
  const end = (event: PointerEvent<SVGSVGElement>) => {
    const drag = gesture.current;
    if (!drag || event.pointerId !== drag.pointer) return;
    gesture.current = null;
    setMoving(undefined);
    setDraftLink(undefined);
    setPanning(false);
    if (event.type !== "pointerup") return;
    const point = { x: event.clientX, y: event.clientY };
    if (drag.kind === "link") {
      const target = document.elementFromPoint(point.x, point.y);
      const id = target
        ?.closest("[data-flow-node]")
        ?.getAttribute("data-flow-node");
      const side = FLOW_SIDES.find(
        (side) =>
          side ===
          target?.closest("[data-flow-port]")?.getAttribute("data-flow-port"),
      );
      if (id && svg.current?.contains(target))
        connect(drag.from, { node: id, side });
    } else if (
      "node" in drag &&
      Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) > 3
    ) {
      updateNode(drag.node.id, dragNode(drag, point, event.altKey));
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (
      event.nativeEvent.isComposing ||
      event.keyCode === 229 ||
      event.defaultPrevented
    )
      return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      event.preventDefault();
      if (gesture.current) {
        try {
          svg.current?.releasePointerCapture(gesture.current.pointer);
        } catch {}
        gesture.current = null;
        setMoving(undefined);
        setDraftLink(undefined);
        setPanning(false);
      } else if (source || mode !== "select" || selected) {
        setSelected(undefined);
        chooseMode("select");
        svg.current?.focus();
      } else onClose();
      return;
    }
    const modified = event.metaKey || event.ctrlKey;
    if (modified && key === "enter") {
      event.preventDefault();
      onSave(JSON.stringify(data));
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("input, textarea, select")
    )
      return;
    if (modified && (key === "z" || key === "y")) {
      event.preventDefault();
      if (!gesture.current) stepHistory(event.shiftKey || key === "y");
    } else if (!modified && !event.altKey) {
      if (key === "delete" || key === "backspace") {
        event.preventDefault();
        if (!gesture.current) remove();
      } else if (key === "f2" && selected) {
        event.preventDefault();
        editLabel(selected);
      } else if (key === "v") chooseMode("select");
      else if (key === "c") chooseMode("connect");
      else if (key === "h") chooseMode("pan");
      else if (key === "0") fit();
    }
  };
  const detail = node || edge;

  return (
    <ModalBackdrop className="modal-backdrop diagram-backdrop" onKeyDown={onKeyDown}>
      <div
        className="modal flow-editor"
        role="dialog"
        aria-modal="true"
        aria-label={tr("编辑流程图")}
      >
        <header className="flow-header">
          <h2>
            <span className="flow-heading-icon">
              <Workflow size={19} />
            </span>
            {tr("流程图")}
          </h2>
          <div className="flow-header-actions">
            <button className="button" onClick={onClose}>
              {tr("取消")}
            </button>
            <button
              className="primary"
              onClick={() => onSave(JSON.stringify(data))}
            >
              {tr("保存图表")}
            </button>
            <FlowButton label="关闭详情" onClick={onClose}>
              <X size={18} />
            </FlowButton>
          </div>
        </header>

        <div
          className="flow-toolbar"
          role="group"
          aria-label={tr("流程图工具")}
        >
          <div className="flow-tool-group">
            <FlowButton
              label="撤销"
              disabled={!history.past.length}
              onClick={() => stepHistory(false)}
            >
              <Undo2 size={17} />
            </FlowButton>
            <FlowButton
              label="重做"
              disabled={!history.future.length}
              onClick={() => stepHistory(true)}
            >
              <Redo2 size={17} />
            </FlowButton>
          </div>
          <div className="flow-tool-group">
            <FlowButton
              label="选择"
              shortcut="V"
              pressed={mode === "select"}
              onClick={() => chooseMode("select")}
            >
              <MousePointer2 size={16} />
            </FlowButton>
            <FlowButton
              label="连线"
              shortcut="C"
              pressed={mode === "connect"}
              onClick={() => chooseMode("connect")}
            >
              <Link2 size={17} />
            </FlowButton>
            <FlowButton
              label="平移"
              shortcut="H"
              pressed={mode === "pan"}
              onClick={() => chooseMode("pan")}
            >
              <Hand size={17} />
            </FlowButton>
          </div>
          <FlowButton label="删除" disabled={!detail} onClick={remove}>
            <Trash2 size={17} />
          </FlowButton>
        </div>

        <div className="flow-workspace">
          <aside className="flow-palette" aria-label={tr("图形库")}>
            <h3>{tr("图形库")}</h3>
            <div className="flow-shapes">
              {shapes.map((shape) => {
                const entry = FLOW_SHAPES[shape];
                return (
                  <button
                    key={shape}
                    disabled={data.nodes.length >= FLOW_LIMITS.nodes}
                    draggable={data.nodes.length < FLOW_LIMITS.nodes}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        "application/x-yua-flow-shape",
                        shape,
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => add(shape)}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="-2 -3 42 32"
                      width="40"
                      height="30"
                    >
                      <FlowShapeView
                        shape={shape}
                        width={38}
                        height={26}
                        strokeWidth="1.5"
                        {...flowPalette(entry.tone, dark)}
                      />
                    </svg>
                    <span>{tr(entry.name)}</span>
                  </button>
                );
              })}
            </div>
            <p>{tr("点击或拖入图形")}</p>
          </aside>

          <div
            className="flow-stage"
            data-mode={mode}
            data-panning={panning || undefined}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes(
                  "application/x-yua-flow-shape",
                )
              ) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={(event) => {
              const shape = event.dataTransfer.getData(
                "application/x-yua-flow-shape",
              );
              if (shapes.includes(shape as FlowShape)) {
                event.preventDefault();
                event.stopPropagation();
                add(
                  shape as FlowShape,
                  localPoint({ x: event.clientX, y: event.clientY }),
                );
              }
            }}
          >
            <svg
              ref={svg}
              className="flow-canvas"
              tabIndex={0}
              aria-label={tr("流程图画布")}
              onDoubleClick={editLabelAt}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onLostPointerCapture={end}
              aria-keyshortcuts="V C H 0"
            >
              <g
                transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
              >
                <FlowArtwork
                  data={working}
                  layout={layout}
                  dark={dark}
                  renderEdge={(entry) => (
                    <g
                      key={entry.edge.id}
                      data-flow-edge={entry.edge.id}
                      className="flow-edge"
                      tabIndex={0}
                      role="button"
                      aria-label={
                        entry.edge.label
                          ? tr("连线 {0}", entry.edge.label)
                          : tr("未命名连线")
                      }
                      aria-pressed={edge?.id === entry.edge.id}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setSelected({ kind: "edge", id: entry.edge.id });
                      }}
                    >
                      <FlowEdgeView
                        layout={entry}
                        dark={dark}
                        selected={edge?.id === entry.edge.id}
                        hit
                      />
                    </g>
                  )}
                  renderNode={(item, contents) => {
                    const active =
                      node?.id === item.id || source?.node === item.id;
                    return (
                      <g
                        data-flow-node={item.id}
                        className="flow-node"
                        data-connecting={!!draftLink || undefined}
                        tabIndex={0}
                        role="button"
                        aria-label={
                          item.label || tr(FLOW_SHAPES[item.shape].name)
                        }
                        aria-pressed={active}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ")
                            return;
                          event.preventDefault();
                          pickNode(item.id);
                        }}
                      >
                        {contents}
                        {active && (
                          <rect
                            className="flow-selection"
                            x={-4}
                            y={-4}
                            width={item.width + 8}
                            height={item.height + 8}
                            rx={4}
                          />
                        )}
                        {FLOW_SIDES.map((side) => {
                          const point = flowPort(item, side);
                          return (
                            <circle
                              className="flow-port"
                              key={side}
                              data-flow-port={side}
                              cx={point.x - item.x}
                              cy={point.y - item.y}
                              r={5}
                            />
                          );
                        })}
                        {active && mode === "select" && (
                          <rect
                            className="flow-resize"
                            data-flow-resize=""
                            x={item.width}
                            y={item.height}
                            width={9}
                            height={9}
                            rx={2}
                          />
                        )}
                      </g>
                    );
                  }}
                />
                {draftLink && (
                  <line
                    className="flow-link-draft"
                    x1={draftLink.start.x}
                    y1={draftLink.start.y}
                    x2={draftLink.end.x}
                    y2={draftLink.end.y}
                  />
                )}
              </g>
            </svg>
            {!data.nodes.length && (
              <p className="flow-empty-stage">{tr("添加图形以开始绘制")}</p>
            )}
            <div className="flow-zoom" role="group" aria-label={tr("缩放")}>
              <FlowButton label="缩小" onClick={() => zoomAt(1 / 1.2)}>
                <Minus size={16} />
              </FlowButton>
              <output>{Math.round(view.scale * 100)}%</output>
              <FlowButton label="放大" onClick={() => zoomAt(1.2)}>
                <Plus size={16} />
              </FlowButton>
              <FlowButton label="适应画布" shortcut="0" onClick={fit}>
                <Maximize size={15} />
              </FlowButton>
            </div>
          </div>

          <aside className="flow-inspector" aria-label={tr("属性")}>
            <h3>{tr("属性")}</h3>
            {detail ? (
              <>
                <label className="flow-field">
                  {tr(node ? "节点文字" : "连线标签")}
                  <textarea
                    key={detail.id + ":" + detail.label}
                    ref={labelInput}
                    rows={2}
                    maxLength={node ? FLOW_LIMITS.label : FLOW_LIMITS.edgeLabel}
                    defaultValue={detail.label}
                    onBlur={(event) => {
                      const label = event.currentTarget.value.trim();
                      event.currentTarget.value = label;
                      if (label === detail.label) return;
                      if (node) updateNode(node.id, { label });
                      else if (edge)
                        commit((before) => ({
                          ...before,
                          edges: before.edges.map((item) =>
                            item.id === edge.id ? { ...item, label } : item,
                          ),
                        }));
                    }}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return;
                      if (
                        (event.key === "Enter" && !event.shiftKey) ||
                        event.key === "Escape"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.key === "Escape")
                          event.currentTarget.value = detail.label;
                        svg.current?.focus();
                      }
                    }}
                  />
                </label>
                {node && (
                  <>
                    <label className="flow-field">
                      {tr("图形")}
                      <select
                        value={node.shape}
                        onChange={(event) =>
                          updateNode(node.id, {
                            shape: event.target.value as FlowShape,
                          })
                        }
                      >
                        {shapes.map((shape) => (
                          <option key={shape} value={shape}>
                            {tr(FLOW_SHAPES[shape].name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flow-field">
                      <span>{tr("颜色")}</span>
                      <div className="flow-colors">
                        {tones.map((tone) => {
                          const { fill, stroke } = flowPalette(tone, dark);
                          return (
                            <button
                              key={tone}
                              aria-pressed={node.tone === tone}
                              aria-label={tr(FLOW_TONES[tone])}
                              title={tr(FLOW_TONES[tone])}
                              style={{ background: fill, borderColor: stroke }}
                              onClick={() => {
                                if (node.tone !== tone)
                                  updateNode(node.id, { tone });
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p>{tr("选择节点或连线以编辑属性")}</p>
            )}
          </aside>
        </div>
        <footer className="flow-status">
          <span role="status">
            {tr(
              mode === "connect"
                ? source
                  ? "选择连线终点"
                  : "选择连线起点"
                : mode === "pan"
                  ? "拖动画布以平移"
                  : "拖动连接点创建连线，双击节点或连线编辑文字",
            )}
          </span>
          <span>
            {tr(
              "{0} 个节点 · {1} 条连线",
              data.nodes.length,
              data.edges.length,
            )}
          </span>
        </footer>
      </div>
    </ModalBackdrop>
  );
}

function FlowButton({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="flow-icon-button"
      type="button"
      aria-label={tr(label)}
      title={shortcut ? `${tr(label)} (${shortcut})` : tr(label)}
      aria-keyshortcuts={shortcut}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

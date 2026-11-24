import { t as tr } from "./i18n";
import { useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { type Card } from "./storage";
import { connectionGeometry, type Connection } from "./connections";
import { connectionMarkers } from "./ConnectionArrow";

function ConnectionLabelEditor({
  initialValue,
  midpoint,
  onSave,
  onCancel,
}: {
  initialValue: string;
  midpoint: { x: number; y: number };
  onSave: (value: string, restoreFocus: boolean) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const finished = useRef(false);
  const commit = (restoreFocus: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onSave(value.trim(), restoreFocus);
  };
  return (
    <input
      className="connection-label-editor"
      style={{ left: midpoint.x - 120, top: midpoint.y - 16 }}
      aria-label={tr("连线文字")}
      autoFocus
      maxLength={1000}
      value={value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => commit(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter") {
          e.preventDefault();
          commit(true);
        }
        if (e.key === "Escape") {
          e.preventDefault();
          finished.current = true;
          onCancel();
        }
      }}
    />
  );
}

export function ConnectionView({
  connection,
  cards,
  offsets,
  selected,
  editing: controlledEditing,
  onEditingChange,
  editorLayer,
  labelLayer,
  onSelect,
  onOpenMenu,
  onReconnect,
  onKeyboardReconnect,
  onLabelChange,
}: {
  connection: Connection;
  cards: Card[];
  offsets: Record<string, { y: number; visible: boolean }>;
  selected: boolean;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  editorLayer: RefObject<HTMLDivElement | null>;
  labelLayer: RefObject<SVGSVGElement | null>;
  onSelect: () => void;
  onOpenMenu: (point: { x: number; y: number }) => void;
  onReconnect?: (e: React.PointerEvent, end: "from" | "to") => void;
  onKeyboardReconnect: (end: "from" | "to") => void;
  onLabelChange: (label: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [localEditing, setLocalEditing] = useState(false);
  const editing = controlledEditing ?? localEditing;
  const setEditing = (next: boolean) => {
    if (onEditingChange) onEditingChange(next);
    else setLocalEditing(next);
  };
  const hit = useRef<SVGPathElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { from, to, d, midpoint } = connectionGeometry(
    connection,
    cards,
    offsets,
  );
  const edit = () => {
    onSelect();
    setEditing(true);
  };
  const stateClass = selected ? "selected" : hovered ? "hovered" : "";
  return (
    <g
      data-connection-id={connection.id}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <path
        className={
          "connection-halo" + (stateClass ? " " + stateClass : "")
        }
        d={d}
        aria-hidden="true"
      />
      <path
        className={"connection-path " + stateClass}
        d={d}
        {...connectionMarkers(
          connection.arrowheads,
          selected || hovered
            ? "canvas-connection-arrow-selected"
            : "canvas-connection-arrow",
        )}
      />
      <path
        ref={hit}
        className="connection-hit"
        d={d}
        role="button"
        aria-label={tr("选择连线")}
        aria-pressed={selected}
        aria-haspopup="menu"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            e.stopPropagation();
            const matrix = e.currentTarget.getScreenCTM();
            if (!e.repeat && matrix)
              onOpenMenu(
                new DOMPoint(midpoint.x, midpoint.y).matrixTransform(matrix),
              );
          } else if (e.key === "Enter" || e.key === " " || e.key === "F2") {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat) return;
            if (e.key === "F2") edit();
            else onSelect();
          }
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          touchStart.current =
            e.pointerType === "touch" ? { x: e.clientX, y: e.clientY } : null;
        }}
        onPointerCancel={() => {
          touchStart.current = null;
        }}
        onPointerMove={(e) => {
          const start = touchStart.current;
          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6)
            touchStart.current = null;
        }}
        onPointerUp={(e) => {
          // A tap directly after a touch drag may have no compatibility click.
          const start = touchStart.current;
          touchStart.current = null;
          if (
            e.pointerType === "touch" &&
            start &&
            Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 6
          )
            onSelect();
        }}
        onClick={onSelect}
        onDoubleClick={(e) => {
          e.stopPropagation();
          edit();
        }}
      />
      {!editing &&
        onReconnect &&
        editorLayer.current &&
        createPortal(
          (["from", "to"] as const).map((end) => {
            const point = end === "from" ? from : to;
            return (
              <button
                type="button"
                key={end}
                className="connection-reconnect"
                data-side={connection[end].side}
                aria-label={tr(
                  end === "from" ? "拖动连线起点" : "拖动连线终点",
                )}
                title={tr(end === "from" ? "拖动连线起点" : "拖动连线终点")}
                style={{ left: point.x, top: point.y }}
                onPointerDown={(e) => onReconnect(e, end)}
                onClick={(e) => {
                  if (e.detail === 0) onKeyboardReconnect(end);
                }}
                aria-haspopup="dialog"
              />
            );
          }),
          editorLayer.current,
        )}
      {editing &&
        editorLayer.current &&
        createPortal(
          <ConnectionLabelEditor
            key={connection.id}
            initialValue={connection.label || ""}
            midpoint={midpoint}
            onSave={(trimmed, restoreFocus) => {
              setEditing(false);
              if (trimmed !== (connection.label || "")) onLabelChange(trimmed);
              if (restoreFocus) hit.current?.focus({ preventScroll: true });
            }}
            onCancel={() => {
              setEditing(false);
              hit.current?.focus({ preventScroll: true });
            }}
          />,
          editorLayer.current,
        )}
      {!editing &&
        connection.label &&
        labelLayer.current &&
        createPortal(
          <foreignObject
            className="connection-label-host"
            x={midpoint.x - 130}
            y={midpoint.y - 18}
            width={260}
            height={36}
          >
            <div
              className={
                "connection-label" + (stateClass ? " " + stateClass : "")
              }
              data-connection-id={connection.id}
              onPointerEnter={() => setHovered(true)}
              onPointerLeave={() => setHovered(false)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onSelect}
              onDoubleClick={(e) => {
                e.stopPropagation();
                edit();
              }}
              title={connection.label}
            >
              {connection.label}
            </div>
          </foreignObject>,
          labelLayer.current,
        )}
    </g>
  );
}

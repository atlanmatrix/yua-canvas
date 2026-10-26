import { useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { type Card } from "./storage";
import {
  type Connection,
  endpointPoint,
  curve,
  curveMidpoint,
} from "./connections";

export function ConnectionView({
  connection,
  cards,
  offsets,
  selected,
  editorLayer,
  labelLayer,
  onSelect,
  onLabelChange,
}: {
  connection: Connection;
  cards: Card[];
  offsets: Record<string, { y: number; visible: boolean }>;
  selected: boolean;
  editorLayer: RefObject<HTMLDivElement | null>;
  labelLayer: RefObject<SVGSVGElement | null>;
  onSelect: () => void;
  onLabelChange: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState("");
  const finished = useRef(false);
  const from = endpointPoint(connection.from, cards, offsets),
    to = endpointPoint(connection.to, cards, offsets);
  const d = curve(from, to, connection.from.side, connection.to.side);
  const midpoint = curveMidpoint(
    from,
    to,
    connection.from.side,
    connection.to.side,
  );
  const edit = () => {
    onSelect();
    finished.current = false;
    setValue(connection.label || "");
    setEditing(true);
  };
  const save = () => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    if (value.trim() !== (connection.label || "")) onLabelChange(value.trim());
  };
  return (
    <g data-connection-id={connection.id}>
      <path
        className={"connection-path " + (selected ? "selected" : "")}
        d={d}
        markerEnd={`url(#canvas-connection-arrow${selected ? "-selected" : ""})`}
      />
      <path
        className="connection-hit"
        d={d}
        role="button"
        aria-label="选择连线"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onSelect}
        onDoubleClick={(e) => {
          e.stopPropagation();
          edit();
        }}
      />
      {editing &&
        editorLayer.current &&
        createPortal(
          <input
            className="connection-label-editor"
            style={{ left: midpoint.x - 120, top: midpoint.y - 16 }}
            aria-label="连线文字"
            autoFocus
            maxLength={1000}
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
              }
              if (e.key === "Escape") {
                finished.current = true;
                setEditing(false);
              }
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
              className="connection-label"
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

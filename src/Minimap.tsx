import { useEffect, useRef, useState } from "react";
import { type Board, type Card, type Rect, groupDepth } from "./storage";
import { cardRect } from "./geometry";
import { ConnectionArrow } from "./ConnectionArrow";
import { endpointPoint, curve } from "./connections";

import {
  MINIMAP_WIDTH as WIDTH,
  MINIMAP_HEIGHT as HEIGHT,
  type MinimapProjection,
} from "./minimapGeometry";

function MiniCard({ card, selected }: { card: Card; selected: boolean }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    if (card.kind !== "image" || !card.blob) return;
    const url = URL.createObjectURL(card.blob);
    setImage(url);
    return () => URL.revokeObjectURL(url);
  }, [card.kind, card.blob]);
  const b = cardRect(card);
  const lines =
    card.kind === "todo"
      ? Math.min(5, card.tasks?.length || 0)
      : Math.min(
          5,
          Math.max(1, Math.ceil((card.text.length || card.title.length) / 30)),
        );
  return (
    <g
      data-minimap-card={card.id}
      className={selected ? "minimap-card selected" : "minimap-card"}
    >
      <rect
        {...b}
        style={{ fill: card.color }}
        rx={Math.min(10, b.height / 8)}
        vectorEffect="non-scaling-stroke"
      />
      {image ? (
        <image href={image} {...b} preserveAspectRatio="xMidYMid meet" />
      ) : (
        Array.from({ length: lines }, (_, i) => (
          <line
            key={i}
            x1={b.x + b.width * 0.12}
            x2={b.x + b.width * (i === lines - 1 ? 0.6 : 0.88)}
            y1={b.y + (b.height * (i + 1)) / (lines + 1)}
            y2={b.y + (b.height * (i + 1)) / (lines + 1)}
            vectorEffect="non-scaling-stroke"
          />
        ))
      )}
    </g>
  );
}

export function Minimap({
  board,
  viewport,
  projection,
  selection,
  offsets,
  onNavigate,
  onDragChange,
}: {
  board: Board;
  viewport: Rect;
  projection: MinimapProjection;
  selection: string[];
  offsets: Record<string, { y: number; visible: boolean }>;
  onNavigate: (point: { x: number; y: number }) => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const { x, y, scale } = projection;
  const button = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointer: number; inverse: DOMMatrix } | null>(null);
  const [dragging, setDragging] = useState(false);
  const finish = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragging(false);
    onDragChange(false);
    if (button.current?.hasPointerCapture(current.pointer))
      button.current.releasePointerCapture(current.pointer);
  };
  const navigate = (clientX: number, clientY: number) => {
    if (drag.current)
      onNavigate(
        new DOMPoint(clientX, clientY).matrixTransform(drag.current.inverse),
      );
  };
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("blur", finish);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("blur", finish);
      window.removeEventListener("keydown", cancel);
      finish();
    };
  }, [onDragChange]);
  return (
    <button
      ref={button}
      className={"minimap " + (dragging ? "dragging" : "")}
      aria-label="画布缩略图"
      title="画布缩略图"
      data-testid="minimap"
      onPointerDown={(e) => {
        if (e.button !== 0 || drag.current) return;
        const matrix = e.currentTarget
          .querySelector<SVGGElement>("[data-testid='minimap-world']")
          ?.getScreenCTM();
        if (!matrix) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.focus({ preventScroll: true });
        // Keep this mapping fixed through the drag, including on empty boards
        // where panning changes the overview's fallback bounds.
        drag.current = { pointer: e.pointerId, inverse: matrix.inverse() };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        onDragChange(true);
        navigate(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (drag.current?.pointer !== e.pointerId) return;
        e.stopPropagation();
        navigate(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (drag.current?.pointer !== e.pointerId) return;
        e.stopPropagation();
        navigate(e.clientX, e.clientY);
        finish();
      }}
      onPointerCancel={(e) => {
        if (drag.current?.pointer === e.pointerId) {
          e.stopPropagation();
          finish();
        }
      }}
      onLostPointerCapture={(e) => {
        e.stopPropagation();
        finish();
      }}
      onClick={(e) => {
        // Pointer navigation already happened above; Enter/Space still center
        // the overview when the button is used from the keyboard.
        if (!e.detail)
          onNavigate({
            x: (WIDTH / 2 - x) / scale,
            y: (HEIGHT / 2 - y) / scale,
          });
      }}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <defs>
          <ConnectionArrow
            id="minimap-connection-arrow"
            size={4 / scale}
            color="#9ca3af"
          />
        </defs>
        <g
          data-testid="minimap-world"
          transform={`translate(${x} ${y}) scale(${scale})`}
        >
          {[...board.groups]
            .sort(
              (a, b) =>
                groupDepth(board.groups, a.id) - groupDepth(board.groups, b.id),
            )
            .map(
              (g) =>
                g.bounds && (
                  <rect
                    key={g.id}
                    data-minimap-group={g.id}
                    className="minimap-group"
                    {...g.bounds}
                    style={{ fill: g.color }}
                    vectorEffect="non-scaling-stroke"
                  />
                ),
            )}
          {board.connections?.map((c) => (
            <path
              key={c.id}
              data-minimap-connection={c.id}
              className="minimap-connection"
              markerEnd="url(#minimap-connection-arrow)"
              d={curve(
                endpointPoint(c.from, board.cards, offsets),
                endpointPoint(c.to, board.cards, offsets),
                c.from.side,
                c.to.side,
              )}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {board.cards.map((c) => (
            <MiniCard key={c.id} card={c} selected={selection.includes(c.id)} />
          ))}
          <rect
            className="minimap-viewport"
            data-testid="minimap-viewport"
            {...viewport}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
    </button>
  );
}

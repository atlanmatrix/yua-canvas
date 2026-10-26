import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { type Board, type Card, type Rect, groupDepth } from "./storage";
import { cardRect } from "./geometry";
import { endpointPoint, curve } from "./connections";

type View = { x: number; y: number; z: number };
const WIDTH = 200,
  HEIGHT = 132,
  PADDING = 10;

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
  view,
  surface,
  selection,
  offsets,
  onNavigate,
}: {
  board: Board;
  view: View;
  surface: RefObject<HTMLDivElement | null>;
  selection: string[];
  offsets: Record<string, { y: number; visible: boolean }>;
  onNavigate: (point: { x: number; y: number }) => void;
}) {
  const [size, setSize] = useState({ width: 1, height: 1 });
  useLayoutEffect(() => {
    const el = surface.current;
    if (!el) return;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [surface]);
  const viewport: Rect = {
    x: -view.x / view.z,
    y: -view.y / view.z,
    width: size.width / view.z,
    height: size.height / view.z,
  };
  const rects = [
    ...board.cards.map(cardRect),
    ...board.groups.flatMap((g) => (g.bounds ? [g.bounds] : [])),
  ];
  if (!rects.length) rects.push(viewport);
  // Curve control handles extend up to 300 world units past their endpoints.
  const margin = board.connections?.length ? 300 : 0;
  const left = Math.min(...rects.map((r) => r.x)) - margin;
  const top = Math.min(...rects.map((r) => r.y)) - margin;
  const width = Math.max(...rects.map((r) => r.x + r.width)) + margin - left;
  const height = Math.max(...rects.map((r) => r.y + r.height)) + margin - top;
  const scale = Math.min(
    (WIDTH - PADDING * 2) / width,
    (HEIGHT - PADDING * 2) / height,
  );
  const x = (WIDTH - width * scale) / 2 - left * scale;
  const y = (HEIGHT - height * scale) / 2 - top * scale;
  return (
    <button
      className="minimap"
      aria-label="画布缩略图"
      title="画布缩略图"
      data-testid="minimap"
      onClick={(e) => {
        const world = e.currentTarget.querySelector<SVGGElement>("g")!;
        const matrix = world.getScreenCTM();
        if (e.detail && matrix) {
          onNavigate(
            new DOMPoint(e.clientX, e.clientY).matrixTransform(
              matrix.inverse(),
            ),
          );
        } else {
          onNavigate({
            x: (WIDTH / 2 - x) / scale,
            y: (HEIGHT / 2 - y) / scale,
          });
        }
      }}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
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
                    vectorEffect="non-scaling-stroke"
                  />
                ),
            )}
          {board.connections?.map((c) => (
            <path
              key={c.id}
              data-minimap-connection={c.id}
              className="minimap-connection"
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

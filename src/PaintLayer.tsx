import { useEffect, useRef, useState } from "react";
import { type Stroke, strokePath } from "./presentation";
import type { View } from "./storage";
export function StrokeView({ strokes = [] }: { strokes?: Stroke[] }) {
  return (
    <g
      className="paint-strokes"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {strokes.map((s) => (
        <path
          key={s.id}
          data-stroke-id={s.id}
          d={strokePath(s)}
          stroke={s.color}
          strokeWidth={s.width}
        />
      ))}
    </g>
  );
}
export function PaintLayer({
  strokes,
  active,
  view,
  color,
  width,
  onCommit,
  canDraw,
}: {
  strokes?: Stroke[];
  active: boolean;
  view: View;
  color: string;
  width: number;
  onCommit: (s: Stroke) => void;
  canDraw: () => boolean;
}) {
  const [draft, setDraft] = useState<Stroke>();
  const current = useRef<Stroke | undefined>(undefined),
    surface = useRef<SVGSVGElement>(null);
  const cancel = () => {
    current.current = undefined;
    setDraft(undefined);
  };
  useEffect(() => {
    if (!active) cancel();
  }, [active]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  const points = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (
      e.nativeEvent.getCoalescedEvents?.().length
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent]
    ).map((p) => ({
      x: (p.clientX - r.left - view.x) / view.z,
      y: (p.clientY - r.top - view.y) / view.z,
    }));
  };
  return (
    <svg
      ref={surface}
      className={`paint-layer ${active ? "paint-active" : ""}`}
      aria-label="画笔图层"
      onPointerDown={(e) => {
        if (!active || e.button !== 0 || e.ctrlKey || e.metaKey || !canDraw())
          return;
        (document.activeElement as HTMLElement | null)?.blur();
        e.preventDefault();
        e.stopPropagation();
        const s = { id: crypto.randomUUID(), color, width, points: points(e) };
        current.current = s;
        setDraft(s);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = current.current;
        if (!s) return;
        e.stopPropagation();
        const incoming = points(e).filter((p) => {
          const last = s.points.at(-1)!;
          return Math.hypot(p.x - last.x, p.y - last.y) > 0.6 / view.z;
        });
        if (s.points.length < 20000) {
          const next = {
            ...s,
            points: [...s.points, ...incoming].slice(0, 20000),
          };
          current.current = next;
          setDraft(next);
        }
      }}
      onPointerUp={(e) => {
        if (!current.current) return;
        e.stopPropagation();
        onCommit(current.current);
        cancel();
      }}
      onPointerCancel={(e) => {
        e.stopPropagation();
        cancel();
      }}
      onLostPointerCapture={cancel}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => {
        if (current.current) e.stopPropagation();
      }}
    >
      <g transform={`translate(${view.x},${view.y}) scale(${view.z})`}>
        <StrokeView strokes={draft ? [...(strokes || []), draft] : strokes} />
      </g>
    </svg>
  );
}

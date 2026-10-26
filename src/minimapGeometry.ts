import { useLayoutEffect, useState, type RefObject } from "react";
import type { Board, Rect, View } from "./storage";
import { cardRect } from "./geometry";

export const MINIMAP_WIDTH = 200,
  MINIMAP_HEIGHT = 132;
const PADDING = 10;
export type MinimapProjection = {
  x: number;
  y: number;
  scale: number;
  bounds: Rect;
};

export function useMinimapGeometry(
  board: Board,
  view: View,
  surface: RefObject<HTMLDivElement | null>,
) {
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
    ...board.groups.flatMap((group) => (group.bounds ? [group.bounds] : [])),
  ];
  if (!rects.length) rects.push(viewport);
  // Include outward curve handles as well as the overview's padding and aspect
  // ratio, so the canvas frame represents the entire SVG area exactly.
  const margin = board.connections?.length ? 300 : 0;
  const left = Math.min(...rects.map((r) => r.x)) - margin;
  const top = Math.min(...rects.map((r) => r.y)) - margin;
  const width = Math.max(...rects.map((r) => r.x + r.width)) + margin - left;
  const height = Math.max(...rects.map((r) => r.y + r.height)) + margin - top;
  const scale = Math.min(
    (MINIMAP_WIDTH - PADDING * 2) / width,
    (MINIMAP_HEIGHT - PADDING * 2) / height,
  );
  const x = (MINIMAP_WIDTH - width * scale) / 2 - left * scale;
  const y = (MINIMAP_HEIGHT - height * scale) / 2 - top * scale;
  const projection: MinimapProjection = {
    x,
    y,
    scale,
    bounds: {
      x: -x / scale,
      y: -y / scale,
      width: MINIMAP_WIDTH / scale,
      height: MINIMAP_HEIGHT / scale,
    },
  };
  return { viewport, projection };
}

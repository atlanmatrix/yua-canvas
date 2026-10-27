import type { Board, Card, Rect } from "./storage";
import { cardRect } from "./geometry";

export type Canvas3DLayer = {
  key: string;
  path: string[];
  trail: string;
  name: string;
  depth: number;
  board: Board;
  parent?: string;
  source?: Card;
  bounds: Rect;
  scale: number;
  width: number;
  height: number;
  x: number;
  y: number;
};
export function canvas3DLayers(root: Board): Canvas3DLayer[] {
  const layers: Canvas3DLayer[] = [];
  const visit = (
    board: Board,
    path: string[],
    names: string[],
    parent?: string,
    source?: Card,
  ) => {
    const rects = [
      ...board.cards.map(cardRect),
      ...board.groups.flatMap((g) => (g.bounds ? [g.bounds] : [])),
    ];
    const x = rects.length ? Math.min(...rects.map((r) => r.x)) - 36 : 0;
    const y = rects.length ? Math.min(...rects.map((r) => r.y)) - 36 : 0;
    const width = Math.max(
      360,
      rects.length
        ? Math.max(...rects.map((r) => r.x + r.width)) - x + 36
        : 600,
    );
    const height = Math.max(
      240,
      rects.length
        ? Math.max(...rects.map((r) => r.y + r.height)) - y + 36
        : 360,
    );
    const scale = Math.min(1, 720 / width, 460 / height);
    const key = JSON.stringify(path);
    layers.push({
      key,
      path,
      trail: names.join(" / "),
      name: names.at(-1)!,
      depth: path.length,
      board,
      parent,
      source,
      bounds: { x, y, width, height },
      scale,
      width: width * scale,
      height: height * scale,
      x: 0,
      y: (-height * scale) / 2,
    });
    for (const card of board.cards)
      if (card.kind === "canvas" && card.canvas)
        visit(
          card.canvas,
          [...path, card.id],
          [...names, card.title || "子画布"],
          key,
          card,
        );
  };
  visit(root, [], ["根画布"]);
  const rows = new Map<number, Canvas3DLayer[]>();
  for (const layer of layers) {
    const row = rows.get(layer.depth) || [];
    row.push(layer);
    rows.set(layer.depth, row);
  }
  for (const row of rows.values()) {
    const total =
      row.reduce((sum, l) => sum + l.width, 0) + (row.length - 1) * 100;
    let x = -total / 2;
    for (const layer of row) {
      layer.x = x;
      x += layer.width + 100;
    }
  }
  return layers;
}

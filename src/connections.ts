import type { Board, Card } from "./storage";
import { cardRect } from "./geometry";
export type Side = "n" | "e" | "s" | "w";
export type Endpoint = { card: string; side: Side; task?: string };
export type Connection = { id: string; from: Endpoint; to: Endpoint };
export function validEndpoint(
  value: unknown,
  cards: Card[],
): value is Endpoint {
  if (!value || typeof value !== "object") return false;
  const e = value as Endpoint,
    c = cards.find((c) => c.id === e.card);
  return (
    !!c &&
    ["n", "e", "s", "w"].includes(e.side) &&
    (e.task === undefined ||
      (typeof e.task === "string" &&
        c.kind === "todo" &&
        (e.side === "e" || e.side === "w") &&
        !!c.tasks?.some((t) => t.id === e.task)))
  );
}
export function pruneConnections(board: Board): Board {
  const next = board.connections?.filter(
    (c) =>
      c.from.card !== c.to.card &&
      validEndpoint(c.from, board.cards) &&
      validEndpoint(c.to, board.cards),
  );
  return next?.length === board.connections?.length
    ? board
    : { ...board, connections: next };
}
export function endpointPoint(
  endpoint: Endpoint,
  cards: Card[],
  offsets: Record<string, { y: number; visible: boolean }> = {},
) {
  const card = cards.find((c) => c.id === endpoint.card);
  if (!card) return { x: 0, y: 0 };
  const b = cardRect(card),
    index = card.tasks?.findIndex((t) => t.id === endpoint.task) ?? 0;
  const taskY =
    offsets[`${card.id}:${endpoint.task}`]?.y ??
    Math.min(b.height - 10, 54 + index * 32);
  return {
    x:
      b.x +
      (endpoint.side === "w"
        ? 0
        : endpoint.side === "e"
          ? b.width
          : b.width / 2),
    y:
      b.y +
      (endpoint.task
        ? taskY
        : endpoint.side === "n"
          ? 0
          : endpoint.side === "s"
            ? b.height
            : b.height / 2),
  };
}
const normals = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};
export function curve(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromSide: Side,
  toSide: Side,
) {
  const distance = Math.max(
      48,
      Math.min(300, Math.hypot(to.x - from.x, to.y - from.y) / 2),
    ),
    a = normals[fromSide],
    b = normals[toSide];
  const horizontal = Math.abs(from.y - to.y) < 1 && a.y === 0 && b.y === 0;
  const vertical = Math.abs(from.x - to.x) < 1 && a.x === 0 && b.x === 0;
  const bend = Math.min(28, distance * 0.2);
  return `M ${from.x} ${from.y} C ${from.x + a.x * distance + (vertical ? bend : 0)} ${from.y + a.y * distance + (horizontal ? bend : 0)}, ${to.x + b.x * distance + (vertical ? bend : 0)} ${to.y + b.y * distance + (horizontal ? bend : 0)}, ${to.x} ${to.y}`;
}

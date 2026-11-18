import type { Board, Card } from "./storage";
import { cardRect } from "./geometry";
export type Side = "n" | "e" | "s" | "w";
export type Endpoint = { card: string; side: Side; task?: string };
export type MagneticTarget = Endpoint & {
  pullX: number;
  pullY: number;
  strength: number;
};
export type Connection = {
  id: string;
  from: Endpoint;
  to: Endpoint;
  label?: string;
};
export type Reconnect = { id: string; end: "from" | "to" };
export const sameEndpoint = (a: Endpoint, b: Endpoint) =>
  a.card === b.card && a.side === b.side && a.task === b.task;

// Keep identity, label and order when changing an existing connection.
export function connectEndpoints(
  board: Board,
  fixed: Endpoint,
  target: Endpoint,
  reconnect?: Reconnect,
): Board {
  const links = board.connections || [];
  const from = reconnect?.end === "from" ? target : fixed;
  const to = reconnect?.end === "from" ? fixed : target;
  if (
    from.card === to.card ||
    !validEndpoint(from, board.cards) ||
    !validEndpoint(to, board.cards) ||
    links.some(
      (link) => sameEndpoint(link.from, from) && sameEndpoint(link.to, to),
    )
  )
    return board;
  if (!reconnect)
    return {
      ...board,
      connections: [...links, { id: crypto.randomUUID(), from, to }],
    };
  if (!links.some((link) => link.id === reconnect.id)) return board;
  return {
    ...board,
    connections: links.map((link) =>
      link.id === reconnect.id ? { ...link, from, to } : link,
    ),
  };
}

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
        (c.kind === "todo" || c.locked === true) &&
        (e.side === "e" || e.side === "w") &&
        (!!c.tasks?.some((t) => t.id === e.task) ||
          (c.locked === true && !!c.lock?.taskIds?.includes(e.task)))))
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
function curvePoints(
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
  return [
    from,
    {
      x: from.x + a.x * distance + (vertical ? bend : 0),
      y: from.y + a.y * distance + (horizontal ? bend : 0),
    },
    {
      x: to.x + b.x * distance + (vertical ? bend : 0),
      y: to.y + b.y * distance + (horizontal ? bend : 0),
    },
    to,
  ];
}
export function curve(...args: Parameters<typeof curvePoints>) {
  const [from, a, b, to] = curvePoints(...args);
  return `M ${from.x} ${from.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${to.x} ${to.y}`;
}
export function curveBounds(...args: Parameters<typeof curvePoints>) {
  const points = curvePoints(...args);
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}
export function curveMidpoint(...args: Parameters<typeof curvePoints>) {
  const [from, a, b, to] = curvePoints(...args);
  return {
    x: (from.x + 3 * a.x + 3 * b.x + to.x) / 8,
    y: (from.y + 3 * a.y + 3 * b.y + to.y) / 8,
  };
}

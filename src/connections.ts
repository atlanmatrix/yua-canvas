import type { Board, Card } from "./storage";
import { cardRect } from "./geometry";
export type Side = "n" | "e" | "s" | "w";
type Point = { x: number; y: number };
export type Endpoint = { card: string; side: Side; task?: string };
export type MagneticTarget = Endpoint & {
  pullX: number;
  pullY: number;
  strength: number;
};
export type ConnectionRouting = "curve" | "elbow";
export type ConnectionArrowheads = "none" | "end" | "both";
export type ConnectionStyle = {
  routing?: ConnectionRouting;
  arrowheads?: ConnectionArrowheads;
};
export type Connection = ConnectionStyle & {
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
function curvePoints(from: Point, to: Point, fromSide: Side, toSide: Side) {
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
  return curvePath(curvePoints(...args));
}
function curvePath([from, a, b, to]: Point[]) {
  return `M ${from.x} ${from.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${to.x} ${to.y}`;
}
function routeBounds(points: Point[]) {
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
  return bezierMidpoint(curvePoints(...args));
}
function bezierMidpoint([from, a, b, to]: Point[]) {
  return {
    x: (from.x + 3 * a.x + 3 * b.x + to.x) / 8,
    y: (from.y + 3 * a.y + 3 * b.y + to.y) / 8,
  };
}

function elbowPoints(
  from: Point,
  to: Point,
  fromSide: Side,
  toSide: Side,
  outerEdge?: (vertical: boolean) => number,
) {
  // Route in coordinates where the start port is horizontal.
  const vertical = normals[fromSide].x === 0;
  const swap = ({ x, y }: Point) => ({ x: y, y: x });
  const [start, end, a, b] = [from, to, normals[fromSide], normals[toSide]].map(
    (point) => (vertical ? swap(point) : point),
  );
  const lead = 24;
  const startLead = start.x + a.x * lead;
  const endLead = end.x + b.x * lead;
  const points = [start];
  if (b.y) {
    if ((end.x - start.x) * a.x > 0 && (start.y - end.y) * b.y > 0) {
      points.push({ x: end.x, y: start.y });
    } else {
      // Keep both port segments even when a lead lands on the other port's axis.
      const x = startLead === end.x ? startLead + a.x * lead : startLead;
      const y = end.y + b.y * lead;
      const cross = y === start.y ? y + b.y * lead : y;
      points.push({ x, y: start.y }, { x, y: cross }, { x: end.x, y: cross });
    }
  } else if (a.x !== b.x && (end.x - start.x) * a.x > 0) {
    const mid = (start.x + end.x) / 2;
    points.push({ x: mid, y: start.y }, { x: mid, y: end.y });
  } else if (a.x === b.x && start.y !== end.y) {
    const x =
      a.x > 0 ? Math.max(startLead, endLead) : Math.min(startLead, endLead);
    points.push({ x, y: start.y }, { x, y: end.y });
  } else {
    // Opposed ports facing away from each other need room outside both cards.
    const y = (outerEdge?.(vertical) ?? Math.min(start.y, end.y)) - lead;
    const x = startLead === endLead ? startLead + a.x * lead : startLead;
    points.push(
      { x, y: start.y },
      { x, y },
      { x: endLead, y },
      { x: endLead, y: end.y },
    );
  }
  points.push(end);
  return points
    .filter(
      (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
    )
    .map((point) => (vertical ? swap(point) : point));
}

function polylinePath(points: Point[]) {
  return `M ${points.map(({ x, y }) => `${x} ${y}`).join(" L ")}`;
}

function polylineMidpoint(points: Point[]) {
  const lengths = points
    .slice(1)
    .map(
      (point, i) =>
        Math.abs(point.x - points[i].x) + Math.abs(point.y - points[i].y),
    );
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [i, length] of lengths.entries()) {
    if (remaining <= length) {
      const [a, b] = [points[i], points[i + 1]];
      const fraction = remaining / length;
      return {
        x: a.x + (b.x - a.x) * fraction,
        y: a.y + (b.y - a.y) * fraction,
      };
    }
    remaining -= length;
  }
  return points[0];
}

export function connectionPath(
  routing: ConnectionRouting | undefined,
  ...args: Parameters<typeof curvePoints>
) {
  return routing === "elbow"
    ? polylinePath(elbowPoints(...args))
    : curve(...args);
}

export function connectionGeometry(
  connection: Connection,
  cards: Card[],
  offsets?: Parameters<typeof endpointPoint>[2],
) {
  const from = endpointPoint(connection.from, cards, offsets);
  const to = endpointPoint(connection.to, cards, offsets);
  const args = [from, to, connection.from.side, connection.to.side] as const;
  const elbow = connection.routing === "elbow";
  const points = elbow
    ? elbowPoints(...args, (vertical) => {
        const axis = vertical ? "x" : "y";
        const source = cards.find((card) => card.id === connection.from.card);
        const target = cards.find((card) => card.id === connection.to.card);
        return Math.min(
          source ? cardRect(source)[axis] : from[axis],
          target ? cardRect(target)[axis] : to[axis],
        );
      })
    : curvePoints(...args);
  return {
    from,
    to,
    d: elbow ? polylinePath(points) : curvePath(points),
    midpoint: elbow ? polylineMidpoint(points) : bezierMidpoint(points),
    bounds: routeBounds(points),
  };
}

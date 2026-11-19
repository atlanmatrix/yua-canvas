import type { FlowNode, FlowPoint, FlowSide } from "./flowchartData";

const normal: Record<FlowSide, FlowPoint> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};
const opposite: Record<FlowSide, FlowSide> = { n: "s", s: "n", e: "w", w: "e" };

export function flowPort(node: FlowNode, side: FlowSide): FlowPoint {
  const direction = normal[side];
  const horizontalInset =
    node.shape === "data" ? Math.min(15, node.width / 8) / 2 : 0;
  return {
    x:
      node.x +
      node.width / 2 +
      direction.x * (node.width / 2 - horizontalInset),
    y: node.y + node.height / 2 + (direction.y * node.height) / 2,
  };
}

export function flowRoute(
  source: FlowNode,
  target: FlowNode,
  from?: FlowSide,
  to?: FlowSide,
) {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);
  const direction =
    Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "w" : "e") : dy < 0 ? "n" : "s";
  from ??= direction;
  to ??= opposite[direction];
  const start = flowPort(source, from);
  const end = flowPort(target, to);
  const sourceNormal = normal[from];
  const targetNormal = normal[to];
  const lead = Math.min(
    24,
    Math.max(6, Math.hypot(end.x - start.x, end.y - start.y) / 3),
  );
  const a = {
    x: start.x + sourceNormal.x * lead,
    y: start.y + sourceNormal.y * lead,
  };
  const b = {
    x: end.x + targetNormal.x * lead,
    y: end.y + targetNormal.y * lead,
  };
  const points: FlowPoint[] = [start, a];
  if (sourceNormal.x && targetNormal.x) {
    const x =
      from === to
        ? from === "e"
          ? Math.max(a.x, b.x)
          : Math.min(a.x, b.x)
        : (a.x + b.x) / 2;
    if (from !== to && (b.x - a.x) * sourceNormal.x < 0) {
      const y = Math.min(source.y, target.y) - 24;
      points.push({ x: a.x, y }, { x: b.x, y });
    } else {
      points.push({ x, y: a.y }, { x, y: b.y });
    }
  } else if (sourceNormal.y && targetNormal.y) {
    const y =
      from === to
        ? from === "s"
          ? Math.max(a.y, b.y)
          : Math.min(a.y, b.y)
        : (a.y + b.y) / 2;
    if (from !== to && (b.y - a.y) * sourceNormal.y < 0) {
      const x = Math.max(source.x + source.width, target.x + target.width) + 24;
      points.push({ x, y: a.y }, { x, y: b.y });
    } else {
      points.push({ x: a.x, y }, { x: b.x, y });
    }
  } else {
    points.push(sourceNormal.x ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
  }
  points.push(b, end);

  const length = (a: FlowPoint, b: FlowPoint) =>
    Math.hypot(b.x - a.x, b.y - a.y);
  let half =
    points
      .slice(1)
      .reduce((sum, point, i) => sum + length(points[i], point), 0) / 2;
  let label = start;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const point = points[i];
    const segment = length(previous, point);
    if (segment && half <= segment) {
      label = {
        x:
          previous.x +
          ((point.x - previous.x) * half) / segment +
          (previous.x === point.x ? 13 : 0),
        y:
          previous.y +
          ((point.y - previous.y) * half) / segment -
          (previous.y === point.y ? 10 : 0),
      };
      break;
    }
    half -= segment;
  }
  const arrow = [
    end,
    {
      x: end.x + targetNormal.x * 8 + targetNormal.y * 3.6,
      y: end.y + targetNormal.y * 8 - targetNormal.x * 3.6,
    },
    {
      x: end.x + targetNormal.x * 8 - targetNormal.y * 3.6,
      y: end.y + targetNormal.y * 8 + targetNormal.x * 3.6,
    },
  ];
  return { points, label, arrow };
}

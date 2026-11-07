type Point = readonly [number, number, number];
const vertices: Point[] = Array.from({ length: 8 }, (_, i) => [
  i & 1 ? 1 : -1,
  i & 2 ? 1 : -1,
  i & 4 ? 1 : -1,
]);
const edges = vertices.flatMap((_, i) =>
  [1, 2, 4].filter((bit) => !(i & bit)).map((bit) => [i, i | bit] as const),
);
const duration = 600,
  revolution = Math.PI * 2;
const ease = (t: number) => t * t * (3 - 2 * t);
type Turn = {
  animations: Animation[];
  from: number;
  to: number;
  blend: number;
};
const turns = new WeakMap<SVGSVGElement, Turn>();

function pose(turn: Turn, t: number) {
  return {
    angle: turn.from + (turn.to - turn.from) * ease(t),
    blend:
      t < 0.08
        ? turn.blend + (1 - turn.blend) * ease(t / 0.08)
        : t > 0.92
          ? 1 - ease((t - 0.92) / 0.08)
          : 1,
  };
}
function rotate([x, y, z]: Point, angle: number): Point {
  const yaw = Math.PI / 4 + angle,
    pitch = Math.atan(1 / Math.sqrt(2));
  const horizontal = x * Math.cos(yaw) + z * Math.sin(yaw);
  const depth = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [
    horizontal,
    y * Math.cos(pitch) - depth * Math.sin(pitch),
    y * Math.sin(pitch) + depth * Math.cos(pitch),
  ];
}
function project(point: Point) {
  return [
    12 + (point[0] * 9) / Math.sqrt(2),
    12 - (point[1] * 10) / Math.sqrt(8 / 3),
  ]
    .map((n) => Number(n.toFixed(4)))
    .join(" ");
}
export function stopCubeMotion(svg: SVGSVGElement) {
  turns.get(svg)?.animations.forEach((animation) => animation.cancel());
  turns.delete(svg);
}

/** Rotate the cube's vertices, then project its visible edges into the SVG. */
export function turnCube(svg: SVGSVGElement, phase: string): Animation[] {
  const previous = turns.get(svg);
  if (previous && (phase === "press" || phase === "click"))
    return previous.animations;
  const t = previous
    ? Math.min(1, Number(previous.animations[0]?.currentTime || 0) / duration)
    : 0;
  const start = previous ? pose(previous, t) : { angle: 0, blend: 0 };
  stopCubeMotion(svg);
  const direction = phase === "leave" ? -1 : 1;
  const to =
    (direction > 0
      ? Math.floor(start.angle / revolution + 1)
      : Math.ceil(start.angle / revolution - 1)) * revolution;
  const turn: Turn = {
    animations: [],
    from: start.angle,
    to,
    blend: start.blend,
  };
  const frames: Keyframe[][] = edges.map(() => []),
    rest: Keyframe[] = [];
  for (let i = 0; i <= 60; i++) {
    const { angle, blend } = pose(turn, i / 60);
    const points = vertices.map((vertex) => rotate(vertex, angle));
    rest.push({ opacity: 1 - blend, offset: i / 60 });
    edges.forEach(([a, b], edge) => {
      // An edge is visible when either of its adjoining faces faces the viewer.
      const visible = vertices[a].some((value, axis) => {
        if (value !== vertices[b][axis]) return false;
        const normal: [number, number, number] = [0, 0, 0];
        normal[axis] = value;
        return rotate(normal, angle)[2] > 1e-6;
      });
      frames[edge].push({
        d: `path("M${project(points[a])}L${project(points[b])}")`,
        opacity: visible ? blend : 0,
        offset: i / 60,
      });
    });
  }
  for (const node of svg.querySelectorAll<SVGPathElement>(":scope > path")) {
    const edge = node.dataset.cubeEdge;
    node.dataset.motionPart = edge === undefined ? "cube-rest" : "cube-edge";
    turn.animations.push(
      node.animate(edge === undefined ? rest : frames[Number(edge)], {
        duration,
      }),
    );
  }
  turns.set(svg, turn);
  void Promise.all(turn.animations.map((animation) => animation.finished)).then(
    () => {
      if (turns.get(svg) === turn) stopCubeMotion(svg);
    },
    () => {},
  );
  return turn.animations;
}

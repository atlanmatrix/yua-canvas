import { useEffect, useRef } from "react";
import { curve, type Side } from "./connections";

type Point = { x: number; y: number };
export function MagneticConnectionDraft(props: {
  from: Point;
  point: Point;
  fromSide: Side;
  toSide?: Side;
  zoom: number;
  strength?: number;
}) {
  const path = useRef<SVGPathElement>(null);
  const tip = useRef<SVGGElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const initial = useRef(props.point);
  useEffect(() => {
    let frame = 0,
      last = 0;
    const position = { ...initial.current },
      velocity = { x: 0, y: 0 };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      const p = latest.current;
      const dt = Math.min(
        0.032,
        Math.max(0.001, (now - (last || now - 16)) / 1000),
      );
      last = now;
      // A damped spring gives the loose cable a little weight during capture/release.
      for (const axis of ["x", "y"] as const) {
        velocity[axis] +=
          ((p.point[axis] - position[axis]) * 620 - velocity[axis] * 38) * dt;
        position[axis] = reduced
          ? p.point[axis]
          : position[axis] + velocity[axis] * dt;
      }
      const opposite = { e: "w", w: "e", n: "s", s: "n" } as const;
      path.current?.setAttribute(
        "d",
        curve(p.from, position, p.fromSide, p.toSide ?? opposite[p.fromSide]),
      );
      tip.current?.setAttribute(
        "transform",
        `translate(${position.x} ${position.y}) scale(${1 / p.zoom})`,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <g className={`magnetic-draft ${props.toSide ? "is-captured" : ""}`}>
      <path
        ref={path}
        className="connection-path draft"
        markerEnd="url(#canvas-connection-arrow)"
      />
      <g ref={tip} className="magnetic-tip">
        <circle className="magnetic-field" r={18 + (props.strength ?? 0) * 9} />
        <circle className="magnetic-core" r="4" />
      </g>
    </g>
  );
}

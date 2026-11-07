// Keep angular velocity across reversals. A cubic Hermite curve decelerates the
// old direction before returning; each new gesture settles in exactly 600 ms.
type Turn = {
  animation: Animation;
  from: number;
  to: number;
  velocity: number;
};
const turns = new Map<SVGSVGElement, Turn>();
const duration = 600;
function sample(turn: Turn) {
  const t = Math.max(
    0,
    Math.min(1, Number(turn.animation.currentTime || 0) / duration),
  );
  const { from: a, to: b, velocity: v } = turn;
  return {
    angle:
      (2 * t * t * t - 3 * t * t + 1) * a +
      (t * t * t - 2 * t * t + t) * v * duration +
      (-2 * t * t * t + 3 * t * t) * b,
    velocity:
      ((6 * t * t - 6 * t) * a +
        (3 * t * t - 4 * t + 1) * v * duration +
        (-6 * t * t + 6 * t) * b) /
      duration,
  };
}
export function stopGearMotion(svg: SVGSVGElement) {
  turns.get(svg)?.animation.cancel();
  turns.delete(svg);
}
export function resetGearMotions() {
  for (const svg of turns.keys()) stopGearMotion(svg);
}
export function turnGear(svg: SVGSVGElement, phase: string) {
  const path = svg.querySelector("path");
  if (!path) return;
  const previous = turns.get(svg);
  const start = previous ? sample(previous) : { angle: 0, velocity: 0 };
  const target =
    phase === "leave" ? 0 : phase === "hover" ? -180 : (previous?.to ?? 0);
  stopGearMotion(svg);
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const angle =
      (2 * t * t * t - 3 * t * t + 1) * start.angle +
      (t * t * t - 2 * t * t + t) * start.velocity * duration +
      (-2 * t * t * t + 3 * t * t) * target;
    frames.push({ transform: `rotate(${angle}deg)`, offset: t });
  }
  path.setAttribute("data-motion-part", "gear");
  const animation = path.animate(frames, { duration, fill: "forwards" });
  turns.set(svg, {
    animation,
    from: start.angle,
    to: target,
    velocity: start.velocity,
  });
  if (phase === "leave")
    void animation.finished.then(
      () => {
        if (turns.get(svg)?.animation === animation) stopGearMotion(svg);
      },
      () => {},
    );
  return animation;
}

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Rect, View } from "./storage";

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

export function useAnimatedView(
  view: View,
  applyView: Dispatch<SetStateAction<View>>,
  canvasKey: string,
) {
  const current = useRef(view);
  const frame = useRef<number | null>(null);
  const cancelViewAnimation = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  useLayoutEffect(() => {
    current.current = view;
  }, [view]);
  // Never let an old canvas's animation overwrite the next canvas's viewport.
  useLayoutEffect(() => cancelViewAnimation, [canvasKey, cancelViewAnimation]);

  const setView = useCallback<Dispatch<SetStateAction<View>>>(
    (next) => {
      cancelViewAnimation();
      applyView(next);
    },
    [applyView, cancelViewAnimation],
  );
  const animateView = useCallback(
    (
      target: View,
      viewport: { width: number; height: number },
      bounds: Rect,
    ) => {
      cancelViewAnimation();
      const from = current.current;
      if (
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        (from.x === target.x && from.y === target.y && from.z === target.z)
      ) {
        applyView(target);
        return;
      }
      const center = { x: viewport.width / 2, y: viewport.height / 2 };
      const fromCenter = {
        x: (center.x - from.x) / from.z,
        y: (center.y - from.y) / from.z,
      };
      const toCenter = {
        x: (center.x - target.x) / target.z,
        y: (center.y - target.y) / target.z,
      };
      const left = bounds.x * from.z + from.x;
      const top = bounds.y * from.z + from.y;
      const outside =
        left < 0 ||
        top < 0 ||
        left + bounds.width * from.z > viewport.width ||
        top + bounds.height * from.z > viewport.height;
      // Measure screen-space travel relative to the viewport, so nearby pins
      // feel equally close on small and large screens and at different zooms.
      const distance = Math.min(
        1,
        (Math.hypot(toCenter.x - fromCenter.x, toCenter.y - fromCenter.y) *
          from.z) /
          (Math.hypot(viewport.width, viewport.height) / 2),
      );
      const duration = outside ? 1600 : 400 + 600 * distance;
      const zoomOut = outside ? 0.2 : 0.2 * distance;
      const pulledBack = Math.max(
        0.2,
        Math.min(from.z, target.z) * (1 - zoomOut),
      );
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - started) / duration));
        const eased = easeInOut(t);
        // Ease out to a wider view, then ease back in with no velocity jump.
        const z =
          t < 0.4
            ? from.z + (pulledBack - from.z) * easeInOut(t / 0.4)
            : pulledBack + (target.z - pulledBack) * easeInOut((t - 0.4) / 0.6);
        applyView(
          t === 1
            ? target
            : {
                x:
                  center.x -
                  (fromCenter.x + (toCenter.x - fromCenter.x) * eased) * z,
                y:
                  center.y -
                  (fromCenter.y + (toCenter.y - fromCenter.y) * eased) * z,
                z,
              },
        );
        frame.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      frame.current = requestAnimationFrame(step);
    },
    [applyView, cancelViewAnimation],
  );
  return { setView, animateView, cancelViewAnimation };
}

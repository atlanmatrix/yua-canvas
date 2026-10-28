import {
  useCallback,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { View } from "./storage";

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
    (target: View) => {
      cancelViewAnimation();
      const from = current.current;
      if (
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        (from.x === target.x && from.y === target.y && from.z === target.z)
      ) {
        applyView(target);
        return;
      }
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - started) / 600));
        // Cubic ease-in-out keeps pan and zoom in sync, with a soft start/stop.
        const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
        applyView(
          t === 1
            ? target
            : {
                x: from.x + (target.x - from.x) * eased,
                y: from.y + (target.y - from.y) * eased,
                z: from.z + (target.z - from.z) * eased,
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

// Shared with camera/preview activity without subscribing every canvas icon.
let pausedUntil = 0;
const listeners = new Set<() => void>();
export const iconMotionPaused = () => performance.now() < pausedUntil;
export function pauseIconMotion(milliseconds = 180) {
  const wasPaused = iconMotionPaused();
  pausedUntil = performance.now() + milliseconds;
  if (!wasPaused) listeners.forEach((listener) => listener());
}
export function onIconMotionPause(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

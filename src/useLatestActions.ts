import { useLayoutEffect, useMemo } from "react";
// Keep handlers stable across camera updates, while each canvas retains its own
// action scope for asynchronous snapshots that finish after navigation.
export function useLatestActions<
  T extends Record<string, (...args: any[]) => any>,
>(actions: T, scope: string): T {
  const bridge = useMemo(
    () => ({ latest: actions, stable: undefined as unknown as T }),
    [scope],
  );
  if (!bridge.stable)
    bridge.stable = Object.fromEntries(
      Object.keys(actions).map((key) => [
        key,
        (...args: any[]) => bridge.latest[key](...args),
      ]),
    ) as T;
  useLayoutEffect(() => {
    bridge.latest = actions;
  });
  return bridge.stable;
}

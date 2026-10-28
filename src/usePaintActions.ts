import { useEffect, useState } from "react";
import type { Stroke } from "./presentation";
// Drawing actions keep their own undo targets so the drawing toolbar never
// removes a component. Every replacement also participates in canvas history.
export function usePaintActions(
  key: string,
  strokes: Stroke[] | undefined,
  onChange: (strokes: Stroke[]) => void,
) {
  const [history, setHistory] = useState<{
    key: string;
    current: Stroke[] | undefined;
    past: (Stroke[] | undefined)[];
  }>({ key, current: strokes, past: [] });
  useEffect(() => {
    setHistory((h) => {
      if (h.key !== key) return { key, current: strokes, past: [] };
      if (h.current === strokes) return h;
      const index = h.past.lastIndexOf(strokes);
      return {
        key,
        current: strokes,
        past: index >= 0 ? h.past.slice(0, index) : [],
      };
    });
  }, [key, strokes]);
  const replace = (next: Stroke[]) => {
    setHistory((h) => ({
      key,
      current: next,
      past: [...(h.key === key ? h.past : []).slice(-99), strokes],
    }));
    onChange(next);
  };
  const undo = () => {
    const past = history.key === key ? history.past : [];
    const previous = past.length
      ? past.at(-1) || []
      : (strokes || []).slice(0, -1);
    setHistory({ key, current: previous, past: past.slice(0, -1) });
    onChange(previous);
  };
  return {
    append: (stroke: Stroke) => replace([...(strokes || []), stroke]),
    clear: () => replace([]),
    undo,
    canUndo:
      (history.key === key && history.past.length > 0) || !!strokes?.length,
  };
}

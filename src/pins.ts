import type { Board } from "./storage";
export type PinnedItem = {
  path: string[];
  id: string;
  kind: "card" | "group";
  name: string;
};
export function collectPins(board: Board, path: string[] = []): PinnedItem[] {
  return [
    ...board.cards.flatMap((c) =>
      c.pin ? [{ path, id: c.id, kind: "card" as const, name: c.pin }] : [],
    ),
    ...board.groups.flatMap((g) =>
      g.pin ? [{ path, id: g.id, kind: "group" as const, name: g.pin }] : [],
    ),
    ...board.cards.flatMap((c) =>
      c.canvas ? collectPins(c.canvas, [...path, c.id]) : [],
    ),
  ];
}

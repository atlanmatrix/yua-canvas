import type { Board, PinColor } from "./storage";
export type PinnedItem = {
  path: string[];
  id: string;
  kind: "card" | "group";
  name: string;
  color?: PinColor;
};
export function collectPins(board: Board, path: string[] = []): PinnedItem[] {
  return [
    ...board.cards.flatMap((c) =>
      c.pin
        ? [
            {
              path,
              id: c.id,
              kind: "card" as const,
              name: c.pin,
              color: c.pinColor,
            },
          ]
        : [],
    ),
    ...board.groups.flatMap((g) =>
      g.pin
        ? [
            {
              path,
              id: g.id,
              kind: "group" as const,
              name: g.pin,
              color: g.pinColor,
            },
          ]
        : [],
    ),
  ];
}

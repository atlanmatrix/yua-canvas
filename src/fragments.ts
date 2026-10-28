import type { Stroke } from "./presentation";
import type { Connection } from "./connections";
import {
  type Board,
  type Card,
  type Group,
  groupTreeIds,
  attachParents,
  containingGroup,
} from "./storage";
export type Fragment = {
  cards: Card[];
  groups: Group[];
  strokes?: Stroke[];
  connections?: Connection[];
};
export function selectedFragment(
  board: Board,
  selection: string[],
  group?: string,
): Fragment {
  const family = group ? groupTreeIds(board.groups, group) : new Set<string>();
  const cards = board.cards.filter(
    (c) => selection.includes(c.id) || (c.group && family.has(c.group)),
  );
  const cardIds = new Set(cards.map((c) => c.id));
  return {
    connections: board.connections?.filter(
      (c) => cardIds.has(c.from.card) && cardIds.has(c.to.card),
    ),
    cards: board.cards.filter(
      (c) => selection.includes(c.id) || (c.group && family.has(c.group)),
    ),
    groups: board.groups.filter((g) => family.has(g.id)),
  };
}
export function duplicateFragment(
  board: Board,
  fragment: Fragment,
  offset: number | { x: number; y: number },
  preserveGroups = false,
) {
  const delta = typeof offset === "number" ? { x: offset, y: offset } : offset;
  const ids = new Map(fragment.groups.map((g) => [g.id, crypto.randomUUID()]));
  const cardIds = new Map(
    fragment.cards.map((c) => [c.id, crypto.randomUUID()]),
  );
  const groups = fragment.groups.map((g) => ({
    ...g,
    id: ids.get(g.id)!,
    activeCard: g.activeCard ? cardIds.get(g.activeCard) : undefined,
    parent: g.parent ? ids.get(g.parent) : undefined,
    bounds: g.bounds
      ? { ...g.bounds, x: g.bounds.x + delta.x, y: g.bounds.y + delta.y }
      : undefined,
  }));
  const taskIds = new Map(
    fragment.cards.flatMap((c) =>
      (c.tasks || []).map((t) => [`${c.id}:${t.id}`, crypto.randomUUID()]),
    ),
  );
  const cards = fragment.cards.map((c) => ({
    ...c,
    id: cardIds.get(c.id)!,
    x: c.x + delta.x,
    y: c.y + delta.y,
    group:
      c.group && ids.has(c.group)
        ? ids.get(c.group)
        : preserveGroups
          ? undefined
          : containingGroup(
              { ...c, x: c.x + delta.x, y: c.y + delta.y },
              board.groups,
            ),
    canvas: c.canvas
      ? {
          ...c.canvas,
          id: crypto.randomUUID(),
          ...selectedFragmentDeep(c.canvas),
        }
      : undefined,
    tasks: c.tasks?.map((t) => ({ ...t, id: taskIds.get(`${c.id}:${t.id}`)! })),
  }));
  return {
    board: {
      ...board,
      cards: [...board.cards, ...cards],
      ...(board.strokes || fragment.strokes
        ? {
            strokes: [
              ...(board.strokes || []),
              ...(fragment.strokes || []).map((s) => ({
                ...s,
                id: crypto.randomUUID(),
                points: s.points.map((p) => ({
                  x: p.x + delta.x,
                  y: p.y + delta.y,
                })),
              })),
            ],
          }
        : {}),
      groups: attachParents([...board.groups, ...groups]),
      connections: [
        ...(board.connections || []),
        ...(fragment.connections || []).map((c) => ({
          ...c,
          id: crypto.randomUUID(),
          from: {
            ...c.from,
            card: cardIds.get(c.from.card)!,
            task: c.from.task
              ? taskIds.get(`${c.from.card}:${c.from.task}`)
              : undefined,
          },
          to: {
            ...c.to,
            card: cardIds.get(c.to.card)!,
            task: c.to.task
              ? taskIds.get(`${c.to.card}:${c.to.task}`)
              : undefined,
          },
        })),
      ],
    },
    cards: cards.map((c): string => c.id),
    group: groups.find((g) => !g.parent)?.id,
  };
}

function selectedFragmentDeep(board: Board): Fragment {
  const result = duplicateFragment(
    { ...board, cards: [], groups: [], connections: [] },
    {
      cards: board.cards,
      groups: board.groups,
      connections: board.connections,
    },
    0,
    true,
  );
  return {
    cards: result.board.cards,
    groups: result.board.groups,
    connections: result.board.connections,
  };
}

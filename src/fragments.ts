import type { Connection } from "./connections";
import { fragmentOffset, cardRect } from "./geometry";
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
  offset: number,
) {
  const delta = fragmentOffset(fragment.cards, board.cards, offset);
  if (fragment.groups.length) {
    const left = Math.min(
      ...fragment.groups.filter((g) => g.bounds).map((g) => g.bounds!.x),
    );
    const right = Math.max(
      ...board.groups
        .filter((g) => g.bounds)
        .map((g) => g.bounds!.x + g.bounds!.width),
      ...board.cards.map((c) => c.x + cardRect(c).width),
    );
    delta.x = Math.max(delta.x, right + 24 - left);
  }
  const ids = new Map(fragment.groups.map((g) => [g.id, crypto.randomUUID()]));
  const groups = fragment.groups.map((g) => ({
    ...g,
    id: ids.get(g.id)!,
    parent: g.parent ? ids.get(g.parent) : undefined,
    bounds: g.bounds
      ? { ...g.bounds, x: g.bounds.x + delta.x, y: g.bounds.y + delta.y }
      : undefined,
  }));
  const cardIds = new Map(
    fragment.cards.map((c) => [c.id, crypto.randomUUID()]),
  );
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
        : containingGroup(
            { ...c, x: c.x + delta.x, y: c.y + delta.y },
            board.groups,
          ),
    tasks: c.tasks?.map((t) => ({ ...t, id: taskIds.get(`${c.id}:${t.id}`)! })),
  }));
  return {
    board: {
      ...board,
      cards: [...board.cards, ...cards],
      groups: attachParents([...board.groups, ...groups]),
      connections: [
        ...(board.connections || []),
        ...(fragment.connections || []).map((c) => ({
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

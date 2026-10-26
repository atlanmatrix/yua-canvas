import { fragmentOffset, cardRect } from "./geometry";
import {
  type Board,
  type Card,
  type Group,
  groupTreeIds,
  attachParents,
  containingGroup,
} from "./storage";
export type Fragment = { cards: Card[]; groups: Group[] };
export function selectedFragment(
  board: Board,
  selection: string[],
  group?: string,
): Fragment {
  const family = group ? groupTreeIds(board.groups, group) : new Set<string>();
  return {
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
  const cards = fragment.cards.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
    x: c.x + delta.x,
    y: c.y + delta.y,
    group:
      c.group && ids.has(c.group)
        ? ids.get(c.group)
        : containingGroup(
            { ...c, x: c.x + delta.x, y: c.y + delta.y },
            board.groups,
          ),
    tasks: c.tasks?.map((t) => ({ ...t, id: crypto.randomUUID() })),
  }));
  return {
    board: {
      ...board,
      cards: [...board.cards, ...cards],
      groups: attachParents([...board.groups, ...groups]),
    },
    cards: cards.map((c): string => c.id),
    group: groups.find((g) => !g.parent)?.id,
  };
}

import {
  type Board,
  type Card,
  type Rect,
  attachParents,
  containingGroup,
  groupBounds,
} from "./storage";
export const TEXT_MAX_WIDTH = 648;
export const cardRect = (
  c: Pick<Card, "x" | "y" | "width" | "height">,
): Rect => ({ x: c.x, y: c.y, width: c.width || 240, height: c.height || 250 });
export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width - 0.001 &&
  a.x + a.width > b.x + 0.001 &&
  a.y < b.y + b.height - 0.001 &&
  a.y + a.height > b.y + 0.001;
export const contains = (a: Rect, b: Rect) =>
  b.x >= a.x - 0.001 &&
  b.y >= a.y - 0.001 &&
  b.x + b.width <= a.x + a.width + 0.001 &&
  b.y + b.height <= a.y + a.height + 0.001;
export function textSize(text: string) {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!;
  ctx.font = "13px monospace";
  const lines = text.split("\n");
  const width = Math.min(
    TEXT_MAX_WIDTH,
    Math.max(120, ...lines.map((line) => ctx.measureText(line).width + 24)),
  );
  const rows = lines.reduce(
    (sum, line) =>
      sum +
      Math.max(
        1,
        Math.ceil(ctx.measureText(line).width / Math.max(1, width - 24)),
      ),
    0,
  );
  return { width, height: Math.max(48, rows * 24 + 24) };
}
export function freePosition(card: Card, others: Card[]): Card {
  let next = card;
  for (let i = 0; i <= others.length; i++) {
    const hits = others.filter(
      (c) => c.id !== next.id && overlaps(cardRect(next), cardRect(c)),
    );
    if (!hits.length) return next;
    next = {
      ...next,
      x: Math.max(...hits.map((c) => c.x + cardRect(c).width)) + 16,
    };
  }
  return next;
}
export function settleGroups(
  board: Board,
  moved: string[],
  movedGroups: string[] = [],
): Board {
  let groups = board.groups.map((g) => ({
    ...g,
    bounds: g.bounds ? { ...g.bounds } : undefined,
  }));
  const expand = (id: string, rect: Rect) => {
    const g = groups.find((g) => g.id === id);
    if (g?.bounds && !contains(g.bounds, rect)) {
      const b = g.bounds;
      const x = Math.min(b.x, rect.x - 20),
        y = Math.min(b.y, rect.y - 45);
      g.bounds = {
        x,
        y,
        width: Math.max(b.x + b.width, rect.x + rect.width + 20) - x,
        height: Math.max(b.y + b.height, rect.y + rect.height + 20) - y,
      };
    }
  };
  const cards = board.cards.map((c) => {
    if (!moved.includes(c.id)) return c;
    const rect = cardRect(c),
      old = groups.find((g) => g.id === c.group);
    const target =
      old?.bounds && overlaps(old.bounds, rect)
        ? old
        : groups
            .filter((g) => g.bounds && overlaps(g.bounds, rect))
            .sort(
              (a, b) =>
                a.bounds!.width * a.bounds!.height -
                b.bounds!.width * b.bounds!.height,
            )[0];
    if (target) {
      expand(target.id, rect);
      return { ...c, group: target.id };
    }
    return { ...c, group: undefined };
  });
  // Every intersecting frame must contain the entire card, never cross it.
  for (const card of cards)
    for (const group of groups)
      if (
        group.bounds &&
        overlaps(group.bounds, cardRect(card)) &&
        !contains(group.bounds, cardRect(card))
      )
        expand(group.id, cardRect(card));
  // Retain a child's parent while their frames still intersect. Repeated passes
  // propagate growth through all ancestor levels without moving any content.
  for (let pass = 0; pass < groups.length; pass++) {
    let changed = false;
    for (const g of groups) {
      const parent = groups.find((p) => p.id === g.parent);
      if (
        g.bounds &&
        parent?.bounds &&
        overlaps(g.bounds, parent.bounds) &&
        !contains(parent.bounds, g.bounds)
      ) {
        expand(parent.id, g.bounds);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Frames may contain one another, but may not cross partially.
  for (let pass = 0; pass < groups.length; pass++) {
    let changed = false;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i],
          b = groups[j];
        if (
          !a.bounds ||
          !b.bounds ||
          !overlaps(a.bounds, b.bounds) ||
          contains(a.bounds, b.bounds) ||
          contains(b.bounds, a.bounds)
        )
          continue;
        if (
          a.bounds.width * a.bounds.height >=
          b.bounds.width * b.bounds.height
        )
          expand(a.id, b.bounds);
        else expand(b.id, a.bounds);
        changed = true;
      }
    if (!changed) break;
  }
  return { ...board, cards, groups: attachParents(groups) };
}
export function layoutBoard(board: Board, previous?: Board): Board {
  const old = new Map(previous?.cards.map((c) => [c.id, c]) || []);
  const changed = board.cards.filter((c) => {
    const p = old.get(c.id);
    return (
      !p ||
      c.x !== p.x ||
      c.y !== p.y ||
      cardRect(c).width !== cardRect(p).width ||
      cardRect(c).height !== cardRect(p).height
    );
  });
  if (!changed.length) return board;
  const ids = new Set(changed.map((c) => c.id)),
    placed = board.cards.filter((c) => !ids.has(c.id)),
    mapped = new Map<string, Card>();
  for (const c of changed) {
    const next = freePosition(c, placed);
    placed.push(next);
    mapped.set(c.id, next);
  }
  return settleGroups(
    { ...board, cards: board.cards.map((c) => mapped.get(c.id) || c) },
    changed.map((c) => c.id),
  );
}
export function canPlace(cards: Card[]): boolean {
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      if (overlaps(cardRect(cards[i]), cardRect(cards[j]))) return false;
  return true;
}
export function fragmentOffset(cards: Card[], others: Card[], offset: number) {
  let dx = offset;
  for (let pass = 0; pass <= others.length; pass++) {
    let correction = 0;
    for (const c of cards)
      for (const other of others)
        if (
          overlaps(
            { ...cardRect(c), x: c.x + dx, y: c.y + offset },
            cardRect(other),
          )
        )
          correction = Math.max(
            correction,
            other.x + cardRect(other).width + 16 - (c.x + dx),
          );
    if (!correction) return { x: dx, y: offset };
    dx += correction;
  }
  return { x: dx, y: offset };
}

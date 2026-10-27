import { type Board, type Card, type Rect, attachParents } from "./storage";
const textContext = document.createElement("canvas").getContext("2d")!;
textContext.font = "13px monospace";
export const TEXT_MAX_WIDTH =
  Math.ceil(textContext.measureText("0").width * 80) + 26;
export const TEXT_MAX_LINES = 20;
let scrollbar: number | undefined;
function scrollbarSize() {
  if (scrollbar !== undefined) return scrollbar;
  const element = document.createElement("div");
  element.style.cssText =
    "position:fixed;visibility:hidden;width:100px;height:100px;overflow:scroll;border:0;padding:0";
  document.body.append(element);
  scrollbar = element.offsetHeight - element.clientHeight;
  element.remove();
  return scrollbar;
}
export const cardRect = (
  c: Pick<Card, "x" | "y" | "width" | "height">,
): Rect => ({ x: c.x, y: c.y, width: c.width || 240, height: c.height || 250 });

export type ArrowDirection =
  "arrowup" | "arrowdown" | "arrowleft" | "arrowright";

export function adjacentCard(
  cards: Card[],
  selected: string,
  direction: ArrowDirection,
) {
  const current = cards.find((card) => card.id === selected);
  if (!current) return;
  const origin = cardRect(current);
  const horizontal = direction === "arrowleft" || direction === "arrowright";
  const sign = direction === "arrowleft" || direction === "arrowup" ? -1 : 1;
  const center = (rect: Rect) => ({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  });
  const start = center(origin);
  return cards
    .filter((card) => card.id !== selected)
    .map((card) => {
      const rect = cardRect(card),
        end = center(rect);
      const forward = (horizontal ? end.x - start.x : end.y - start.y) * sign;
      const across = Math.abs(horizontal ? end.y - start.y : end.x - start.x);
      const aligned = horizontal
        ? rect.y < origin.y + origin.height && rect.y + rect.height > origin.y
        : rect.x < origin.x + origin.width && rect.x + rect.width > origin.x;
      return { card, forward, across, aligned };
    })
    .filter((candidate) => candidate.forward > 0.001)
    .sort(
      (a, b) =>
        Number(b.aligned) - Number(a.aligned) ||
        Math.hypot(a.forward, a.across * 2) -
          Math.hypot(b.forward, b.across * 2),
    )[0]?.card;
}
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
export function textSize(
  text: string,
  mode: "wrap" | "scroll" = "wrap",
  requestedWidth = TEXT_MAX_WIDTH,
) {
  const ctx = textContext,
    inset = 26;
  const width = Math.max(64, Math.min(TEXT_MAX_WIDTH, requestedWidth));
  const contentWidth = width - inset;
  const lines = text.split("\n");
  const advances = new Map<string, number>();
  let longest = 0;
  const tab = ctx.measureText("0").width * 4;
  const rows = lines.reduce((sum, line) => {
    let count = 1,
      used = 0,
      lineWidth = 0;
    for (const character of line) {
      let advance = advances.get(character);
      if (advance === undefined) {
        advance = ctx.measureText(character).width;
        advances.set(character, advance);
      }
      const actual = character === "\t" ? tab - (used % tab) : advance;
      if (mode === "wrap" && used > 0 && used + actual > contentWidth) {
        count++;
        used = 0;
      }
      used += character === "\t" ? tab - (used % tab) : advance;
      lineWidth += character === "\t" ? tab - (lineWidth % tab) : advance;
    }
    longest = Math.max(longest, lineWidth);
    return sum + count;
  }, 0);
  const horizontal =
    mode === "scroll" &&
    longest > contentWidth - (rows > TEXT_MAX_LINES ? scrollbarSize() : 0);
  return {
    width,
    height:
      Math.min(TEXT_MAX_LINES, rows) * 24 +
      inset +
      (horizontal ? scrollbarSize() : 0),
  };
}

export function settleGroups(board: Board, moved: string[]): Board {
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
  return { ...board, cards, groups: attachParents(groups) };
}
export function updateGroupMembership(board: Board, previous?: Board): Board {
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
  return settleGroups(
    board,
    changed.map((c) => c.id),
  );
}

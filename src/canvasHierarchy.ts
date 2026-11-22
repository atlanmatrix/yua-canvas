import { attachParents, groupBounds, type Board, type Card } from "./storage";
import { t as tr } from "./i18n";
import { cardRect } from "./geometry";
import { inheritProtection } from "./encryption";
import type { Connection, Endpoint } from "./connections";

// Only these newly converted containers may be traversed implicitly when
// restoring a navigation path recorded before groups became canvases.
const migratedContainers = new WeakSet<Board>();

export function migrateGroups(board: Board): Board {
  const cards = board.cards.map((card) => {
    if (!card.canvas) return card;
    const canvas = migrateGroups(card.canvas);
    return canvas === card.canvas ? card : { ...card, canvas };
  });
  if (!board.groups.length)
    return cards.every((c, i) => c === board.cards[i])
      ? board
      : { ...board, cards };

  const groups = attachParents(
    board.groups.map((g) => ({
      ...g,
      bounds: g.bounds || groupBounds(cards.filter((c) => c.group === g.id)),
    })),
  );
  const byId = new Map(groups.map((g) => [g.id, g]));
  // Earlier versions sometimes saved a parent while frames only partly overlapped.
  for (const original of board.groups) {
    if (!original.parent || !byId.has(original.parent)) continue;
    const seen = new Set([original.id]);
    let parent: string | undefined = original.parent;
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      parent = byId.get(parent)?.parent;
    }
    if (!parent) byId.get(original.id)!.parent = original.parent;
  }
  const containers = new Map<string, Card>();
  const owners = new Map<string, string | undefined>();
  const root: Board = {
    ...board,
    cards: [],
    groups: [],
    connections: board.connections && [],
  };
  const existingIds = new Set(cards.map((c) => c.id));
  const innerBoards = new Map<string, Board>();
  for (const g of groups) {
    const canvas: Board = {
      version: 1,
      id: crypto.randomUUID(),
      cards: [],
      groups: [],
    };
    migratedContainers.add(canvas);
    const bounds = g.bounds!;
    const id = existingIds.has(g.id) ? crypto.randomUUID() : g.id;
    innerBoards.set(id, canvas);
    containers.set(g.id, {
      id,
      kind: "canvas",
      title: g.name,
      text: "",
      color: g.color || "#ffffff",
      x: bounds.x,
      y: bounds.y,
      width: 240,
      height: 180,
      canvas,
      remark: g.remark,
      masked: g.masked,
      pin: g.pin,
      pinColor: g.pinColor,
    });
  }
  const append = (card: Card, parent?: string) => {
    const container = parent && containers.get(parent);
    owners.set(card.id, container ? container.id : undefined);
    if (!container) {
      root.cards.push(card);
      return;
    }
    const origin = byId.get(parent!)!.bounds!;
    container.canvas!.cards.push({
      ...card,
      x: card.x - origin.x,
      y: card.y - origin.y,
    });
  };
  for (const g of groups) append(containers.get(g.id)!, g.parent);
  for (const { group, ...card } of cards) append(card, group);

  const pathTo = (id: string) => {
    const path = [id];
    let owner = owners.get(id);
    while (owner) {
      path.unshift(owner);
      owner = owners.get(owner);
    }
    return path;
  };
  for (const link of board.connections || []) {
    const a = pathTo(link.from.card),
      b = pathTo(link.to.card);
    let i = 0;
    while (a[i] === b[i] && i < a.length - 1 && i < b.length - 1) i++;
    const owner = i ? innerBoards.get(a[i - 1])! : root;
    (owner.connections ||= []).push({
      ...link,
      from: endpointAt(link.from, a[i]),
      to: endpointAt(link.to, b[i]),
    });
  }
  return root;
}

function endpointAt(endpoint: Endpoint, id: string): Endpoint {
  return endpoint.card === id ? endpoint : { card: id, side: endpoint.side };
}

export function moveIntoCanvas(
  board: Board,
  ids: string[],
  targetId: string,
): Board {
  const target = board.cards.find((c) => c.id === targetId);
  if (
    !target?.canvas ||
    target.locked ||
    target.masked ||
    ids.includes(targetId)
  )
    return board;
  const child = target.canvas;
  const selected = new Set(ids);
  const moved = board.cards.filter((c) => selected.has(c.id));
  if (!moved.length) return board;
  const minX = Math.min(...moved.map((c) => c.x)),
    minY = Math.min(...moved.map((c) => c.y));
  const right = child.cards.reduce(
    (edge, c) => Math.max(edge, c.x + cardRect(c).width),
    0,
  );
  const used = new Set(child.cards.map((c) => c.id));
  const newIds = new Map(
    moved.map((c) => [c.id, used.has(c.id) ? crypto.randomUUID() : c.id]),
  );
  const cards = moved.map((c) => ({
    ...c,
    id: newIds.get(c.id)!,
    x: right + 32 + c.x - minX,
    y: 32 + c.y - minY,
  }));
  const local = [...(child.connections || [])],
    parent: Connection[] = [];
  const connectionIds = new Set(local.map((c) => c.id));
  for (const link of board.connections || []) {
    const from = newIds.get(link.from.card),
      to = newIds.get(link.to.card);
    if (from && to)
      local.push({
        ...link,
        id: connectionIds.has(link.id) ? crypto.randomUUID() : link.id,
        from: { ...link.from, card: from },
        to: { ...link.to, card: to },
      });
    else {
      const a = from ? endpointAt(link.from, targetId) : link.from;
      const b = to ? endpointAt(link.to, targetId) : link.to;
      if (a.card !== b.card) parent.push({ ...link, from: a, to: b });
    }
  }
  let canvas = {
    ...child,
    cards: [...child.cards, ...cards],
    connections: local,
  } as Board;
  if (child.protection) canvas = inheritProtection(canvas, child.protection);
  return {
    ...board,
    connections: parent,
    cards: board.cards
      .filter((c) => !selected.has(c.id))
      .map((c) => (c === target ? { ...c, canvas } : c)),
  };
}

export function locateBoard(root: Board, path: string[]) {
  let board = root;
  const valid: string[] = [],
    names: string[] = [];
  let matched = 0;
  for (const id of path) {
    function route(current: Board): Card[] | undefined {
      const direct = current.cards.find((c) => c.id === id && c.canvas);
      if (direct) return [direct];
      for (const container of current.cards) {
        if (!container.canvas || !migratedContainers.has(container.canvas))
          continue;
        const nested = route(container.canvas);
        if (nested) return [container, ...nested];
      }
    }
    const steps = route(board);
    const card = steps?.at(-1);
    if (!card?.canvas) break;
    valid.push(...steps!.map((c) => c.id));
    names.push(...steps!.map((c) => c.title || tr("子画布")));
    board = card.canvas;
    matched++;
  }
  return { board, path: valid, names, matched };
}

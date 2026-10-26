import { validEndpoint, type Connection } from "./connections";
import { cardRect } from "./geometry";
export type Card = {
  id: string;
  kind: "text" | "image" | "file" | "todo";
  title: string;
  text: string;
  x: number;
  y: number;
  color: string;
  width?: number;
  height?: number;
  blob?: Blob;
  mime?: string;
  group?: string;
  tasks?: Task[];
};
export type Task = { id: string; text: string; done: boolean };
export type Rect = { x: number; y: number; width: number; height: number };
export type Group = {
  id: string;
  name: string;
  bounds?: Rect;
  parent?: string;
};
export function groupBounds(cards: Card[], frames: Rect[] = []): Rect {
  const rects = [...cards.map(cardRect), ...frames];
  if (!rects.length) return { x: 0, y: 0, width: 300, height: 300 };
  const x = Math.min(...rects.map((r) => r.x)) - 20,
    y = Math.min(...rects.map((r) => r.y)) - 45;
  return {
    x,
    y,
    width: Math.max(160, Math.max(...rects.map((r) => r.x + r.width)) + 20 - x),
    height: Math.max(
      120,
      Math.max(...rects.map((r) => r.y + r.height)) + 20 - y,
    ),
  };
}
// Strictly larger enclosing frames keep parent links acyclic, including equal frames.
export function attachParents(groups: Group[]): Group[] {
  return groups.map((group) => {
    const b = group.bounds;
    const parent = b
      ? groups
          .filter((g) => {
            const p = g.bounds;
            return (
              g.id !== group.id &&
              p &&
              p.width * p.height > b.width * b.height &&
              b.x >= p.x &&
              b.y >= p.y &&
              b.x + b.width <= p.x + p.width &&
              b.y + b.height <= p.y + p.height
            );
          })
          .sort(
            (a, b) =>
              a.bounds!.width * a.bounds!.height -
                b.bounds!.width * b.bounds!.height ||
              Number(b.id === group.parent) - Number(a.id === group.parent) ||
              a.id.localeCompare(b.id),
          )[0]?.id
      : undefined;
    return { ...group, parent };
  });
}
export function groupTreeIds(groups: Group[], root: string): Set<string> {
  const ids = new Set([root]);
  for (let changed = true; changed;) {
    changed = false;
    for (const g of groups)
      if (g.parent && ids.has(g.parent) && !ids.has(g.id)) {
        ids.add(g.id);
        changed = true;
      }
  }
  return ids;
}
export function groupDepth(groups: Group[], id: string): number {
  const seen = new Set<string>();
  let group = groups.find((g) => g.id === id);
  while (group?.parent && !seen.has(group.parent)) {
    seen.add(group.parent);
    group = groups.find((g) => g.id === group!.parent);
  }
  return seen.size;
}
// A card belongs to the smallest frame that fully contains its bounds.
export function containingGroup(
  card: Pick<Card, "x" | "y" | "width" | "height">,
  groups: Group[],
): string | undefined {
  return groups
    .filter(
      (g) =>
        g.bounds &&
        card.x >= g.bounds.x &&
        card.y >= g.bounds.y &&
        card.x + cardRect(card).width <= g.bounds.x + g.bounds.width &&
        card.y + cardRect(card).height <= g.bounds.y + g.bounds.height,
    )
    .sort(
      (a, b) =>
        a.bounds!.width * a.bounds!.height - b.bounds!.width * b.bounds!.height,
    )[0]?.id;
}
export function initializeGroups(board: Board): Board {
  return {
    ...board,
    groups: attachParents(
      board.groups.map((g) =>
        g.bounds
          ? g
          : {
              ...g,
              bounds: groupBounds(board.cards.filter((c) => c.group === g.id)),
            },
      ),
    ),
  };
}
export type Board = {
  version: 1;
  cards: Card[];
  groups: Group[];
  connections?: Connection[];
};
export const emptyBoard: Board = { version: 1, cards: [], groups: [] };
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("yua-canvas", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("boards");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function readBoard(): Promise<Board | undefined> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db.transaction("boards").objectStore("boards").get("main");
    r.onsuccess = () =>
      resolve(r.result ? initializeGroups(r.result) : undefined);
    r.onerror = () => reject(r.error);
  });
}
export async function saveBoard(board: Board) {
  const db = await database;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    tx.objectStore("boards").put(board, "main");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function exportBoard(board: Board) {
  return JSON.stringify(
    {
      ...board,
      cards: await Promise.all(
        board.cards.map(async (card) => ({
          ...card,
          blob: card.blob
            ? await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result as string);
                r.onerror = () => reject(r.error);
                r.readAsDataURL(card.blob!);
              })
            : undefined,
        })),
      ),
    },
    null,
    2,
  );
}
export async function importBoard(raw: string): Promise<Board> {
  const data = JSON.parse(raw);
  if (
    data.version !== 1 ||
    !Array.isArray(data.cards) ||
    !Array.isArray(data.groups)
  )
    throw new Error("不是有效的 Yua 画布文件");
  const ids = new Set<string>();
  const groups: Group[] = data.groups.map((g: Group) => {
    if (typeof g.id !== "string" || typeof g.name !== "string" || ids.has(g.id))
      throw new Error("分组数据无效");
    ids.add(g.id);
    if (
      g.bounds &&
      (!g.bounds ||
        ![g.bounds.x, g.bounds.y, g.bounds.width, g.bounds.height].every(
          (v) => Number.isFinite(v) && Math.abs(v) <= 1e7,
        ) ||
        g.bounds.width < 160 ||
        g.bounds.height < 120)
    )
      throw new Error("分组尺寸无效");
    return {
      id: g.id,
      name: g.name.slice(0, 200),
      parent: typeof g.parent === "string" ? g.parent : undefined,
      bounds: g.bounds
        ? {
            x: g.bounds.x,
            y: g.bounds.y,
            width: g.bounds.width,
            height: g.bounds.height,
          }
        : undefined,
    };
  });
  ids.clear();
  const cards: Card[] = await Promise.all(
    data.cards.map(async (c: Record<string, unknown>) => {
      if (
        typeof c.id !== "string" ||
        ids.has(c.id) ||
        !["text", "image", "file", "todo"].includes(c.kind as string) ||
        typeof c.title !== "string" ||
        typeof c.text !== "string" ||
        !Number.isFinite(c.x) ||
        !Number.isFinite(c.y) ||
        Math.abs(c.x as number) > 1e7 ||
        Math.abs(c.y as number) > 1e7
      )
        throw new Error("卡片数据无效");
      ids.add(c.id);
      if (
        (c.width !== undefined &&
          (!Number.isFinite(c.width) ||
            (c.width as number) <= 0 ||
            (c.width as number) > 1e7)) ||
        (c.height !== undefined &&
          (!Number.isFinite(c.height) ||
            (c.height as number) <= 0 ||
            (c.height as number) > 1e7))
      )
        throw new Error("元素尺寸无效");
      let blob: Blob | undefined;
      if (c.blob !== undefined) {
        if (typeof c.blob !== "string" || !/^data:[^,]*;base64,/.test(c.blob))
          throw new Error("附件数据无效");
        const [header, body] = c.blob.split(",");
        const bytes = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0));
        blob = new Blob([bytes], { type: header.slice(5, -7) });
      }
      if ((c.kind === "image" || c.kind === "file") && !blob)
        throw new Error("缺少附件");
      let tasks: Task[] | undefined;
      if (c.kind === "todo") {
        if (!Array.isArray(c.tasks)) throw new Error("任务数据无效");
        const taskIds = new Set<string>();
        tasks = c.tasks.map((t) => {
          if (
            !t ||
            typeof t.id !== "string" ||
            taskIds.has(t.id) ||
            typeof t.text !== "string" ||
            typeof t.done !== "boolean"
          )
            throw new Error("任务数据无效");
          taskIds.add(t.id);
          return { id: t.id, text: t.text, done: t.done };
        });
      }
      return {
        tasks,
        width: c.width as number | undefined,
        height: c.height as number | undefined,
        id: c.id,
        kind: c.kind as Card["kind"],
        title: c.title,
        text: c.text,
        x: c.x as number,
        y: c.y as number,
        color:
          typeof c.color === "string" && /^#[0-9a-f]{6}$/i.test(c.color)
            ? c.color
            : "#fffdf5",
        group:
          typeof c.group === "string" && groups.some((g) => g.id === c.group)
            ? c.group
            : undefined,
        mime: blob?.type,
        blob,
      };
    }),
  );
  if (data.connections !== undefined && !Array.isArray(data.connections))
    throw new Error("连线数据无效");
  const connectionIds = new Set<string>();
  const connections: Connection[] = (data.connections || []).map(
    (c: Connection) => {
      if (
        !c ||
        typeof c.id !== "string" ||
        connectionIds.has(c.id) ||
        !validEndpoint(c.from, cards) ||
        !validEndpoint(c.to, cards) ||
        c.from.card === c.to.card
      )
        throw new Error("连线数据无效");
      connectionIds.add(c.id);
      return {
        id: c.id,
        from: { card: c.from.card, side: c.from.side, task: c.from.task },
        to: { card: c.to.card, side: c.to.side, task: c.to.task },
      };
    },
  );
  return initializeGroups({ version: 1, cards, groups, connections });
}

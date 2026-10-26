export type Card = {
  id: string;
  kind: "text" | "image" | "file" | "todo";
  title: string;
  text: string;
  x: number;
  y: number;
  color: string;
  blob?: Blob;
  mime?: string;
  group?: string;
  tasks?: Task[];
};
export type Task = { id: string; text: string; done: boolean };
export type Rect = { x: number; y: number; width: number; height: number };
export type Group = { id: string; name: string; bounds?: Rect };
export function groupBounds(cards: Card[]): Rect {
  if (!cards.length) return { x: 0, y: 0, width: 300, height: 300 };
  const x = Math.min(...cards.map((c) => c.x)) - 20,
    y = Math.min(...cards.map((c) => c.y)) - 45;
  return {
    x,
    y,
    width: Math.max(...cards.map((c) => c.x + 240)) + 20 - x,
    height: Math.max(...cards.map((c) => c.y + 250)) + 20 - y,
  };
}
// A card belongs to the smallest frame that fully contains its bounds.
export function containingGroup(
  card: Pick<Card, "x" | "y">,
  groups: Group[],
): string | undefined {
  return groups
    .filter(
      (g) =>
        g.bounds &&
        card.x >= g.bounds.x &&
        card.y >= g.bounds.y &&
        card.x + 240 <= g.bounds.x + g.bounds.width &&
        card.y + 250 <= g.bounds.y + g.bounds.height,
    )
    .sort(
      (a, b) =>
        a.bounds!.width * a.bounds!.height - b.bounds!.width * b.bounds!.height,
    )[0]?.id;
}
export function initializeGroups(board: Board): Board {
  return {
    ...board,
    groups: board.groups.map((g) =>
      g.bounds
        ? g
        : {
            ...g,
            bounds: groupBounds(board.cards.filter((c) => c.group === g.id)),
          },
    ),
  };
}
export type Board = { version: 1; cards: Card[]; groups: Group[] };
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
  return initializeGroups({ version: 1, cards, groups });
}

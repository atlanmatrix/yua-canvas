import { validEndpoint, type Connection } from "./connections";
import { cardRect } from "./geometry";
export type Card = {
  id: string;
  pin?: string;
  kind: "text" | "image" | "file" | "todo" | "canvas";
  title: string;
  text: string;
  x: number;
  y: number;
  color: string;
  width?: number;
  height?: number;
  textMode?: "wrap" | "scroll";
  textAutoHeight?: boolean;
  blob?: Blob;
  mime?: string;
  group?: string;
  tasks?: Task[];
  canvas?: Board;
};
export type Task = { id: string; text: string; done: boolean };
export type Rect = { x: number; y: number; width: number; height: number };
export type Group = {
  id: string;
  pin?: string;
  name: string;
  color?: string;
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
    cards: board.cards.map((card) =>
      card.kind === "canvas" && card.canvas
        ? { ...card, canvas: initializeGroups(card.canvas) }
        : card,
    ),
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
export type View = { x: number; y: number; z: number };
export type Navigation = { path: string[]; views: Record<string, View> };
export type Board = {
  version: 1;
  parentCreated?: boolean;
  id?: string;
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
export async function readView(): Promise<View | undefined> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction("boards").objectStore("boards").get("view");
    request.onsuccess = () => {
      const view = request.result;
      resolve(
        view &&
          [view.x, view.y, view.z].every(Number.isFinite) &&
          Math.abs(view.x) <= 1e9 &&
          Math.abs(view.y) <= 1e9 &&
          view.z >= 0.2 &&
          view.z <= 3
          ? { x: view.x, y: view.y, z: view.z }
          : undefined,
      );
    };
    request.onerror = () => reject(request.error);
  });
}
export async function saveBoard(
  board: Board,
  view?: View,
  navigation?: Navigation,
) {
  const db = await database;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    tx.objectStore("boards").put(board, "main");
    if (view) tx.objectStore("boards").put(view, "view");
    if (navigation) tx.objectStore("boards").put(navigation, "navigation");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export function validView(view: any): view is View {
  return (
    !!view &&
    [view.x, view.y, view.z].every(Number.isFinite) &&
    Math.abs(view.x) <= 1e9 &&
    Math.abs(view.y) <= 1e9 &&
    view.z >= 0.2 &&
    view.z <= 3
  );
}
export async function readNavigation(): Promise<Navigation | undefined> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db.transaction("boards").objectStore("boards").get("navigation");
    r.onsuccess = () => {
      const n = r.result;
      if (
        !n ||
        !Array.isArray(n.path) ||
        !n.path.every((id: unknown) => typeof id === "string") ||
        !n.views ||
        typeof n.views !== "object"
      )
        return resolve(undefined);
      const views: Record<string, View> = Object.create(null);
      for (const [key, view] of Object.entries(n.views))
        if (validView(view)) views[key] = { x: view.x, y: view.y, z: view.z };
      resolve({ path: n.path, views });
    };
    r.onerror = () => reject(r.error);
  });
}
async function serializeBoard(board: Board): Promise<object> {
  return {
    ...board,
    cards: await Promise.all(
      board.cards.map(async (card) => ({
        ...card,
        canvas:
          card.kind === "canvas" && card.canvas
            ? await serializeBoard(card.canvas)
            : undefined,
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
  };
}
export async function exportBoard(board: Board) {
  return JSON.stringify(await serializeBoard(board), null, 2);
}
export async function importBoard(
  raw: string,
  attachment?: (path: string, mime: string) => Blob | undefined,
  depth = 0,
  boardIds = new Set<string>(),
): Promise<Board> {
  if (depth > 128) throw Error("画布嵌套过深");
  const data = JSON.parse(raw);
  if (
    data.version !== 1 ||
    !Array.isArray(data.cards) ||
    !Array.isArray(data.groups)
  )
    throw new Error("不是有效的 Yua 画布文件");
  if (
    data.id !== undefined &&
    (typeof data.id !== "string" ||
      !data.id ||
      data.id.length > 200 ||
      boardIds.has(data.id))
  )
    throw Error("画布标识无效");
  if (
    data.parentCreated !== undefined &&
    typeof data.parentCreated !== "boolean"
  )
    throw Error("父画布状态无效");
  const boardId: string | undefined =
    data.id || (depth ? crypto.randomUUID() : undefined);
  if (boardId) boardIds.add(boardId);
  const ids = new Set<string>();
  const groups: Group[] = data.groups.map((g: Group) => {
    if (typeof g.id !== "string" || typeof g.name !== "string" || ids.has(g.id))
      throw new Error("分组数据无效");
    ids.add(g.id);
    if (
      g.color !== undefined &&
      (typeof g.color !== "string" || !/^#[0-9a-f]{6}$/i.test(g.color))
    )
      throw Error("分组颜色无效");
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
      ...(validPin(g.pin) !== undefined ? { pin: validPin(g.pin) } : {}),
      name: g.name.slice(0, 200),
      color: g.color,
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
        !["text", "image", "file", "todo", "canvas"].includes(
          c.kind as string,
        ) ||
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
      if (
        (c.textMode !== undefined &&
          !["wrap", "scroll"].includes(c.textMode as string)) ||
        (c.textAutoHeight !== undefined &&
          typeof c.textAutoHeight !== "boolean")
      )
        throw Error("文本显示设置无效");
      let blob: Blob | undefined =
        attachment &&
        (c.kind === "file" || c.kind === "image") &&
        typeof c.archiveFile === "string"
          ? attachment(
              c.archiveFile,
              typeof c.mime === "string" ? c.mime : "application/octet-stream",
            )
          : undefined;
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
      if (c.kind === "canvas" && (!c.canvas || typeof c.canvas !== "object"))
        throw Error("子画布数据无效");
      const canvas =
        c.kind === "canvas"
          ? await importBoard(
              JSON.stringify(c.canvas),
              attachment,
              depth + 1,
              boardIds,
            )
          : undefined;
      return {
        canvas,
        tasks,
        textMode: c.textMode as Card["textMode"],
        textAutoHeight: c.textAutoHeight as boolean | undefined,
        width: c.width as number | undefined,
        height: c.height as number | undefined,
        id: c.id,
        ...(validPin(c.pin) !== undefined ? { pin: validPin(c.pin) } : {}),
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
        c.from.card === c.to.card ||
        (c.label !== undefined &&
          (typeof c.label !== "string" || c.label.length > 1000))
      )
        throw new Error("连线数据无效");
      connectionIds.add(c.id);
      return {
        id: c.id,
        label: c.label,
        from: { card: c.from.card, side: c.from.side, task: c.from.task },
        to: { card: c.to.card, side: c.to.side, task: c.to.task },
      };
    },
  );
  return initializeGroups({
    version: 1,
    id: boardId,
    ...(data.parentCreated ? { parentCreated: true } : {}),
    cards,
    groups,
    connections,
  });
}

// Kept separately from the active workspace so adopting cloud content is recoverable.
export async function saveRecovery(board: Board) {
  const db = await database;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    tx.objectStore("boards").put(board, "cloud-recovery");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function readRecovery(): Promise<Board | undefined> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db
      .transaction("boards")
      .objectStore("boards")
      .get("cloud-recovery");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export type CanvasClipboard = {
  token: string;
  fragment: { cards: Card[]; groups: Group[]; connections?: Connection[] };
  offset: number;
};
export async function saveCanvasClipboard(value: CanvasClipboard) {
  const db = await database;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    tx.objectStore("boards").put(value, "cut-clipboard");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function readCanvasClipboard(): Promise<
  CanvasClipboard | undefined
> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("boards")
      .objectStore("boards")
      .get("cut-clipboard");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function validPin(value: unknown): string | undefined {
  if (value === undefined) return;
  if (typeof value !== "string" || !value.trim() || value.length > 100)
    throw Error("Pin 名称无效");
  return value.trim();
}

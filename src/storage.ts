export type Card = {
  id: string;
  kind: "text" | "image" | "file";
  title: string;
  text: string;
  x: number;
  y: number;
  color: string;
  blob?: Blob;
  mime?: string;
  group?: string;
};
export type Group = { id: string; name: string };
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
    r.onsuccess = () => resolve(r.result);
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
    return { id: g.id, name: g.name.slice(0, 200) };
  });
  ids.clear();
  const cards: Card[] = await Promise.all(
    data.cards.map(async (c: Record<string, unknown>) => {
      if (
        typeof c.id !== "string" ||
        ids.has(c.id) ||
        !["text", "image", "file"].includes(c.kind as string) ||
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
      if (c.kind !== "text" && !blob) throw new Error("缺少附件");
      return {
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
  return { version: 1, cards, groups };
}

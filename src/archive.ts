import {
  zip,
  unzip,
  strToU8,
  strFromU8,
  type Zippable,
  type Unzipped,
} from "fflate";
import { type Board, importBoard } from "./storage";
import { type Fragment, selectedFragment } from "./fragments";
import { cardDownload, textDownloadName } from "./downloads";
import { cardsFromFiles, fileMime } from "./files";

export const METADATA = "yua-canvas.metadata.json";
export const isZip = (file: File) =>
  /\.zip$/i.test(file.name) ||
  ["application/zip", "application/x-zip-compressed"].includes(file.type);
export function archiveSelection(
  board: Board,
  selection: string[],
  group?: string,
): Fragment {
  const fragment = selectedFragment(board, selection, group);
  const ids = new Set(fragment.groups.map((g) => g.id));
  for (const card of fragment.cards) {
    let id = card.group;
    while (id && !ids.has(id)) {
      ids.add(id);
      id = board.groups.find((g) => g.id === id)?.parent;
    }
  }
  return { ...fragment, groups: board.groups.filter((g) => ids.has(g.id)) };
}
function safeName(name: string) {
  return (
    name
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/[\u0000-\u001f]/g, "_") || "file"
  );
}
export async function createArchive(fragment: Fragment): Promise<Blob> {
  const entries: Zippable = Object.create(null);
  const used = new Set([METADATA.toLowerCase()]);
  const cards = await Promise.all(
    fragment.cards.map(async (card) => {
      const downloaded = cardDownload(card);
      const original =
        card.kind === "todo"
          ? textDownloadName().replace(/\.txt$/, ".todo.json")
          : downloaded.name;
      let path = safeName(original),
        index = 2;
      const dot = path.lastIndexOf(".");
      const stem = dot > 0 ? path.slice(0, dot) : path,
        suffix = dot > 0 ? path.slice(dot) : "";
      while (used.has(path.toLowerCase()))
        path = `${stem} (${index++})${suffix}`;
      used.add(path.toLowerCase());
      entries[path] =
        card.kind === "todo"
          ? strToU8(
              JSON.stringify(
                {
                  tasks:
                    card.tasks?.map(({ text, done }) => ({ text, done })) || [],
                },
                null,
                2,
              ),
            )
          : new Uint8Array(await downloaded.blob.arrayBuffer());
      return {
        id: card.id,
        kind: card.kind,
        file: path,
        name: card.title,
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        color: card.color,
        group: card.group,
        mime: card.mime,
        taskIds: card.tasks?.map((t) => t.id),
      };
    }),
  );
  entries[METADATA] = strToU8(
    JSON.stringify(
      {
        format: "yua-canvas",
        version: 1,
        cards,
        groups: fragment.groups,
        connections: fragment.connections || [],
      },
      null,
      2,
    ),
  );
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, { level: 6 }, (error, data) =>
      error ? reject(error) : resolve(data),
    ),
  );
  return new Blob([new Uint8Array(bytes)], { type: "application/zip" });
}
export async function readArchive(
  file: File,
  point: { x: number; y: number },
): Promise<Fragment & { hasMetadata: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const unzipped = await new Promise<Unzipped>((resolve, reject) =>
    unzip(bytes, (error, data) =>
      error ? reject(Error("ZIP 文件无效或已损坏")) : resolve(data),
    ),
  );
  const entries = new Map(
    Object.entries(unzipped).filter(
      ([path]) =>
        !path.endsWith("/") &&
        !path.startsWith("__MACOSX/") &&
        !path.endsWith(".DS_Store"),
    ),
  );
  const metadata = [...entries.keys()].filter(
    (path) => path === METADATA || path.endsWith(`/${METADATA}`),
  );
  const used = new Set<string>();
  let board: Board = { version: 1, cards: [], groups: [], connections: [] };
  if (metadata.length) {
    if (metadata.length !== 1) throw Error("ZIP 中包含多个画布元数据文件");
    const path = metadata[0],
      prefix = path.slice(0, -METADATA.length);
    let data;
    try {
      data = JSON.parse(strFromU8(entries.get(path)!));
    } catch {
      throw Error("画布元数据无效");
    }
    if (
      !data ||
      data.format !== "yua-canvas" ||
      data.version !== 1 ||
      !Array.isArray(data.cards)
    )
      throw Error("不支持的画布元数据");
    used.add(path);
    const cards = data.cards.map((meta: Record<string, any>) => {
      if (!meta || typeof meta !== "object") throw Error("画布元数据无效");
      const filePath = prefix + meta.file,
        content = entries.get(filePath);
      if (typeof meta.file !== "string" || !content)
        throw Error("ZIP 中缺少元数据引用的文件");
      used.add(filePath);
      let text = "",
        tasks;
      if (meta.kind === "text") text = strFromU8(content);
      if (meta.kind === "todo") {
        let todo;
        try {
          todo = JSON.parse(strFromU8(content));
        } catch {
          throw Error("ZIP 中的任务数据无效");
        }
        if (
          !todo ||
          !Array.isArray(todo.tasks) ||
          !Array.isArray(meta.taskIds) ||
          todo.tasks.length !== meta.taskIds.length
        )
          throw Error("ZIP 中的任务数据无效");
        tasks = todo.tasks.map((task: Record<string, unknown>, i: number) => ({
          ...task,
          id: meta.taskIds[i],
        }));
      }
      return {
        ...meta,
        title: typeof meta.name === "string" ? meta.name : safeName(meta.file),
        text,
        tasks,
        blob: undefined,
        archiveFile: filePath,
        mime: typeof meta.mime === "string" ? meta.mime : fileMime(meta.file),
      };
    });
    board = await importBoard(
      JSON.stringify({
        version: 1,
        cards,
        groups: data.groups,
        connections: data.connections,
      }),
      (path, mime) => {
        const content = entries.get(path);
        return content
          ? new Blob([new Uint8Array(content)], { type: mime })
          : undefined;
      },
    );
  }
  const files = [...entries]
    .filter(([path]) => !used.has(path))
    .map(
      ([path, content]) =>
        new File([new Uint8Array(content)], safeName(path), {
          type: fileMime(path),
        }),
    );
  const extra = await cardsFromFiles(
    files,
    board.cards.length
      ? {
          x: Math.max(...board.cards.map((c) => c.x + (c.width || 240))) + 30,
          y: point.y,
        }
      : point,
  );
  if (!board.cards.length && !board.groups.length && !extra.length)
    throw Error("ZIP 中没有可导入的元素");
  return {
    ...board,
    cards: [...board.cards, ...extra],
    hasMetadata: metadata.length > 0,
  };
}

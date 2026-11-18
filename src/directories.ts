import type { Card } from "./storage";
import { canvasCard, newBoard } from "./workspace";
import type { Fragment } from "./fragments";
import { cardsFromFiles } from "./files";

export type ImportNode =
  | { kind: "file"; file: File }
  | { kind: "directory"; name: string; children: ImportNode[] };
type DirectoryNode = Extract<ImportNode, { kind: "directory" }>;
type TransferItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};
type DirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>;
};

async function readEntry(entry: FileSystemEntry): Promise<ImportNode> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return { kind: "file", file };
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const entries: FileSystemEntry[] = [];
  // Chromium returns directory entries in batches; a single read can miss files.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!batch.length) break;
    entries.push(...batch);
  }
  return {
    kind: "directory",
    name: entry.name,
    children: await Promise.all(entries.map(readEntry)),
  };
}
async function readHandle(handle: FileSystemHandle): Promise<ImportNode> {
  if (handle.kind === "file")
    return {
      kind: "file",
      file: await (handle as FileSystemFileHandle).getFile(),
    };
  const children: ImportNode[] = [];
  for await (const child of (handle as DirectoryHandle).values())
    children.push(await readHandle(child));
  return { kind: "directory", name: handle.name, children };
}
// Capture entry/handle references and Files during the paste/drop event, while
// the browser still grants access to the transfer data.
export function captureTransfer(data: DataTransfer): {
  hasFiles: boolean;
  nodes: Promise<ImportNode[]>;
} {
  const files = Array.from(data.files);
  const items = Array.from(data.items).filter((item) => item.kind === "file");
  const snapshots = items.map((item) => {
    let entry: FileSystemEntry | null = null;
    let handle: Promise<FileSystemHandle | null> | undefined;
    try {
      entry = item.webkitGetAsEntry?.() || null;
    } catch {
      /* Try the handle API or File fallback. */
    }
    if (!entry) {
      try {
        handle = (item as TransferItem).getAsFileSystemHandle?.();
      } catch {
        /* The File fallback still works for individual files. */
      }
    }
    return { entry, handle, file: item.getAsFile() };
  });
  const nodes = (async () => {
    const result = await Promise.all(
      snapshots.map(async ({ entry, handle, file }) => {
        if (entry)
          return entry.isFile && file
            ? { kind: "file" as const, file }
            : readEntry(entry);
        if (handle) {
          const value = await handle.catch(() => null);
          if (value) return readHandle(value);
        }
        return file ? { kind: "file" as const, file } : null;
      }),
    );
    if (result.some((node) => node?.kind === "directory"))
      return result.filter((node): node is ImportNode => node !== null);
    // Prefer the FileList to avoid duplicate attachments exposed by both APIs.
    return files.length
      ? files.map((file) => ({ kind: "file" as const, file }))
      : result.filter((node): node is ImportNode => node !== null);
  })();
  return { hasFiles: !!(files.length || items.length), nodes };
}
export function nodesFromFiles(files: File[]): ImportNode[] {
  const roots: ImportNode[] = [];
  for (const file of files) {
    const parts = file.webkitRelativePath.split("/").filter(Boolean);
    if (parts.some((part) => part === "." || part === ".."))
      throw Error("目录路径无效");
    let children = roots;
    for (const name of parts.slice(0, -1)) {
      let node = children.find(
        (node) => node.kind === "directory" && node.name === name,
      ) as DirectoryNode | undefined;
      if (!node) {
        node = { kind: "directory", name, children: [] };
        children.push(node);
      }
      children = node.children;
    }
    children.push({ kind: "file", file });
  }
  return roots;
}

async function directoryCard(node: DirectoryNode): Promise<Card> {
  const cards = await Promise.all(
    node.children.map(async (child) =>
      child.kind === "directory"
        ? directoryCard(child)
        : (await cardsFromFiles([child.file], { x: 0, y: 0 }))[0],
    ),
  );
  let y = 32;
  for (let start = 0; start < cards.length; start += 3) {
    const row = cards.slice(start, start + 3);
    let x = 32;
    for (const card of row) {
      card.x = x;
      card.y = y;
      x += (card.width || 240) + 24;
    }
    y += Math.max(...row.map((card) => card.height || 250)) + 24;
  }
  return canvasCard({ ...newBoard(), cards }, node.name);
}
export async function directoriesFragment(
  nodes: DirectoryNode[],
  point: { x: number; y: number },
): Promise<Fragment> {
  const cards = await Promise.all(nodes.map(directoryCard));
  return {
    cards: cards.map((card, i) => ({
      ...card,
      x: point.x + 272 * i,
      y: point.y,
    })),
    groups: [],
  };
}

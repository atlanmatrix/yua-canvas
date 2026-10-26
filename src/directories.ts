import type { Group } from "./storage";
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

type Layout = Fragment & { width: number; height: number };
function translate(layout: Layout, x: number, y: number): Layout {
  return {
    ...layout,
    cards: layout.cards.map((card) => ({
      ...card,
      x: card.x + x,
      y: card.y + y,
    })),
    groups: layout.groups.map((group) => ({
      ...group,
      bounds: group.bounds && {
        ...group.bounds,
        x: group.bounds.x + x,
        y: group.bounds.y + y,
      },
    })),
  };
}
async function layoutDirectory(node: DirectoryNode): Promise<Layout> {
  const id = crypto.randomUUID();
  const children = await Promise.all(
    node.children.map(async (child): Promise<Layout> => {
      if (child.kind === "directory") {
        const layout = await layoutDirectory(child);
        return {
          ...layout,
          groups: layout.groups.map((group) =>
            group.parent ? group : { ...group, parent: id },
          ),
        };
      }
      const [card] = await cardsFromFiles([child.file], { x: 0, y: 0 });
      return {
        cards: [{ ...card, group: id }],
        groups: [],
        width: card.width!,
        height: card.height!,
      };
    }),
  );
  const columns = Math.min(3, children.length);
  const widths = Array.from({ length: columns }, (_, col) =>
    Math.max(
      ...children
        .filter((_, i) => i % columns === col)
        .map((child) => child.width),
    ),
  );
  const heights = Array.from(
    { length: Math.ceil(children.length / Math.max(1, columns)) },
    (_, row) =>
      Math.max(
        ...children
          .slice(row * columns, (row + 1) * columns)
          .map((child) => child.height),
      ),
  );
  const sum = (sizes: number[]) =>
    sizes.reduce((total, size) => total + size + 24, 0);
  const width = Math.max(160, 40 + sum(widths) - (columns ? 24 : 0));
  const height = Math.max(120, 68 + sum(heights) - (heights.length ? 24 : 0));
  const placed = children.map((child, index) =>
    translate(
      child,
      20 + sum(widths.slice(0, index % columns)),
      48 + sum(heights.slice(0, Math.floor(index / columns))),
    ),
  );
  const group: Group = {
    id,
    name: node.name,
    bounds: { x: 0, y: 0, width, height },
  };
  return {
    width,
    height,
    cards: placed.flatMap((child) => child.cards),
    groups: [group, ...placed.flatMap((child) => child.groups)],
  };
}
export async function directoriesFragment(
  nodes: DirectoryNode[],
  point: { x: number; y: number },
): Promise<Fragment> {
  const layouts = await Promise.all(nodes.map(layoutDirectory));
  let x = point.x;
  const placed = layouts.map((layout) => {
    const result = translate(layout, x, point.y);
    x += layout.width + 32;
    return result;
  });
  return {
    cards: placed.flatMap((layout) => layout.cards),
    groups: placed.flatMap((layout) => layout.groups),
  };
}

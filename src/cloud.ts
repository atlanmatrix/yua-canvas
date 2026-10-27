import { importBoard, type Board } from "./storage";
export class CloudError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api(path: string, init: RequestInit = {}) {
  const response = await fetch("/api" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new CloudError(503, "当前站点未启用云服务，本地功能仍可使用");
  const data = await response.json();
  if (!response.ok)
    throw new CloudError(response.status, data.message || "云端请求失败");
  return data;
}
export const digest = async (bytes: BufferSource) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
export async function packCloud(board: Board) {
  const assets = new Map<string, Blob>();
  async function pack(b: Board): Promise<any> {
    const cards = [];
    for (const c of b.cards) {
      let archiveFile: string | undefined;
      if (c.blob) {
        if (c.blob.size > 25 * 1024 * 1024)
          throw Error("单个附件不能超过 25 MB");
        archiveFile = await digest(await c.blob.arrayBuffer());
        assets.set(archiveFile, c.blob);
      }
      cards.push({
        ...c,
        blob: undefined,
        archiveFile,
        canvas: c.canvas ? await pack(c.canvas) : undefined,
      });
    }
    return { ...b, cards };
  }
  const snapshot = await pack(board),
    raw = JSON.stringify(snapshot);
  if (new TextEncoder().encode(raw).length > 5 * 1024 * 1024 - 1024)
    throw Error("画布结构超过 5 MB 限制");
  return {
    snapshot,
    assets,
    fingerprint: await digest(new TextEncoder().encode(raw)),
  };
}
export async function uploadCloud(board: Board, revision: number) {
  const packed = await packCloud(board);
  for (const [id, blob] of packed.assets)
    await api("/assets/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: blob,
    });
  const result = await api("/canvas", {
    method: "PUT",
    body: JSON.stringify({ baseRevision: revision, snapshot: packed.snapshot }),
  });
  return { ...result, fingerprint: packed.fingerprint };
}
export async function unpackCloud(snapshot: any, token?: string) {
  const refs = new Map<string, string>();
  let count = 0;
  function scan(b: any, depth = 0) {
    if (!b || !Array.isArray(b.cards) || depth > 32)
      throw Error("分享画布格式无效");
    count += b.cards.length;
    if (count > 10000) throw Error("画布元素过多");
    for (const c of b.cards) {
      if (c.archiveFile) {
        if (!/^[a-f0-9]{64}$/.test(c.archiveFile)) throw Error("附件引用无效");
        refs.set(c.archiveFile, c.mime || "application/octet-stream");
      }
      if (c.canvas) scan(c.canvas, depth + 1);
    }
  }
  scan(snapshot);
  const assets = new Map<string, Blob>();
  for (const [id, mime] of refs) {
    const response = await fetch("/api/assets/" + id, {
      headers: token ? { "X-Share-Token": token } : {},
    });
    if (!response.ok) throw Error("附件不存在或分享已失效");
    const bytes = await response.arrayBuffer();
    if ((await digest(bytes)) !== id) throw Error("附件完整性校验失败");
    assets.set(id, new Blob([bytes], { type: mime }));
  }
  return importBoard(JSON.stringify(snapshot), (id) => assets.get(id));
}

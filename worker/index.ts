import { validPresentation, validStrokes } from "../src/presentation";
import { miniatureUrl, miniatureViewUrl } from "../src/miniatureScene";
import {
  isApplicationKind,
  validApplicationText,
} from "../src/appAssociations";

interface Env {
  RATE_LIMITER: RateLimit;
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}
const MAX_JSON = 5 * 1024 * 1024,
  MAX_ASSET = 25 * 1024 * 1024;
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
function fail(status: number, message: string): never {
  throw new Response(JSON.stringify({ message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const hash = async (data: string | ArrayBuffer) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof data === "string" ? new TextEncoder().encode(data) : data,
      ),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
const cookieValue = (r: Request, name: string) =>
  r.headers
    .get("Cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1);
const cookie = (env: Env, name: string, value: string, age: number) =>
  `${name}=${value}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${age}${env.APP_ORIGIN.startsWith("https:") ? "; Secure" : ""}`;
async function body(r: Request, max = MAX_JSON) {
  if (Number(r.headers.get("Content-Length")) > max)
    fail(413, "文件超过大小限制");
  const reader = r.body?.getReader();
  if (!reader) fail(400, "请求内容为空");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      fail(413, "文件超过大小限制");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
async function input(r: Request) {
  try {
    return JSON.parse(new TextDecoder().decode(await body(r)));
  } catch (e) {
    if (e instanceof Response) throw e;
    fail(400, "JSON 无效");
  }
}
function validateSnapshot(data: any): string[] {
  const ids = new Set<string>();
  let count = 0;
  function visit(b: any, depth: number) {
    if (
      !b ||
      b.version !== 1 ||
      !Array.isArray(b.cards) ||
      !Array.isArray(b.groups) ||
      depth > 32
    )
      fail(400, "画布格式无效");
    if (
      (b.strokesHidden !== undefined && typeof b.strokesHidden !== "boolean") ||
      !validStrokes(b.strokes) ||
      b.groups.some((g: any) => !validPresentation(g, true))
    )
      fail(400, "显示或画笔数据无效");
    count += b.cards.length + b.groups.length + (b.connections?.length || 0);
    if (count > 10000) fail(400, "画布元素过多");
    for (const c of b.cards) {
      if (
        !c ||
        ![
          "text",
          "image",
          "file",
          "todo",
          "canvas",
          "miniature",
          "mermaid",
          "vscode",
          "iterm2",
        ].includes(c.kind) ||
        typeof c.id !== "string" ||
        typeof c.title !== "string" ||
        typeof c.text !== "string" ||
        !Number.isFinite(c.x) ||
        !Number.isFinite(c.y) ||
        c.blob !== undefined
      )
        fail(400, "卡片格式无效");
      if (!validPresentation(c)) fail(400, "组件显示设置无效");
      if (isApplicationKind(c.kind) && !validApplicationText(c.kind, c.text))
        fail(400, "应用关联配置无效");
      if (c.kind === "miniature" && !miniatureUrl(c.text))
        fail(400, "3D 场景地址无效");
      if (
        c.pdfPage !== undefined &&
        (c.kind !== "file" || !Number.isSafeInteger(c.pdfPage) || c.pdfPage < 1)
      )
        fail(400, "PDF 页码无效");
      if (
        c.editableFile !== undefined &&
        (c.kind !== "file" || typeof c.editableFile !== "boolean")
      )
        fail(400, "文件编辑设置无效");
      if (
        c.miniatureView !== undefined &&
        (c.kind !== "miniature" || !miniatureViewUrl(c.text, c.miniatureView))
      )
        fail(400, "3D 场景视图无效");
      if (
        c.kind === "file" ||
        c.kind === "image" ||
        (c.kind === "miniature" && c.archiveFile !== undefined)
      ) {
        if (
          typeof c.archiveFile !== "string" ||
          !/^[a-f0-9]{64}$/.test(c.archiveFile)
        )
          fail(400, "附件引用无效");
        ids.add(c.archiveFile);
      }
      if (c.kind === "canvas") visit(c.canvas, depth + 1);
    }
  }
  visit(data, 0);
  return [...ids];
}
async function session(r: Request, env: Env) {
  const token = cookieValue(r, "yua_session");
  if (!token) return null;
  return env.DB.prepare(
    "SELECT owner_id, name FROM sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(token), Date.now())
    .first<{ owner_id: string; name: string }>();
}
async function snapshot(env: Env, version: { object_key: string }) {
  const obj = await env.BUCKET.get(version.object_key);
  if (!obj) fail(404, "画布版本不存在");
  return obj.json<any>();
}
async function route(r: Request, env: Env): Promise<Response> {
  const url = new URL(r.url),
    p = url.pathname;
  if (!p.startsWith("/api/")) return env.ASSETS.fetch(r);
  const limit = await env.RATE_LIMITER.limit({
    key: r.headers.get("CF-Connecting-IP") || "local",
  });
  if (!limit.success) fail(429, "请求过于频繁，请稍后重试");
  if (
    !["GET", "HEAD"].includes(r.method) &&
    r.headers.get("Origin") !== new URL(env.APP_ORIGIN).origin
  )
    fail(403, "请求来源无效");
  if (p === "/api/auth/login" && r.method === "GET") {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)
      fail(503, "尚未配置 GitHub 登录");
    const state = random(),
      u = new URL("https://github.com/login/oauth/authorize");
    u.search = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: env.APP_ORIGIN + "/api/auth/callback",
      state,
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: u.href,
        "Set-Cookie": cookie(env, "yua_oauth", state, 600),
        "Cache-Control": "no-store",
      },
    });
  }
  if (p === "/api/auth/callback" && r.method === "GET") {
    const state = cookieValue(r, "yua_oauth");
    if (
      !state ||
      state !== url.searchParams.get("state") ||
      !url.searchParams.get("code")
    )
      fail(400, "登录已过期，请重试");
    const tr = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: url.searchParams.get("code"),
        redirect_uri: env.APP_ORIGIN + "/api/auth/callback",
      }),
    });
    const t = await tr.json<{ access_token?: string }>();
    if (!tr.ok || !t.access_token) fail(401, "GitHub 登录失败");
    const ur = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${t.access_token}`,
        "User-Agent": "Yua-Canvas",
        Accept: "application/vnd.github+json",
      },
    });
    if (!ur.ok) fail(401, "无法验证 GitHub 账号");
    const u = await ur.json<{ id: number; login: string }>();
    const token = random();
    await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .bind(
        await hash(token),
        String(u.id),
        u.login,
        Date.now() + 30 * 86400000,
      )
      .run();
    const headers = new Headers({
      Location: env.APP_ORIGIN + "/#cloud",
      "Cache-Control": "no-store",
    });
    headers.append("Set-Cookie", cookie(env, "yua_session", token, 30 * 86400));
    headers.append("Set-Cookie", cookie(env, "yua_oauth", "", 0));
    return new Response(null, { status: 302, headers });
  }
  if (p === "/api/session" && r.method === "GET")
    return json({ user: await session(r, env) });
  if (p === "/api/auth/logout" && r.method === "POST") {
    const token = cookieValue(r, "yua_session");
    if (token)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await hash(token))
        .run();
    return new Response("{}", {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie(env, "yua_session", "", 0),
        "Cache-Control": "no-store",
      },
    });
  }
  if (p === "/api/shares/resolve" && r.method === "POST") {
    const { token } = await input(r);
    const share = await getShare(env, token);
    return json({ snapshot: await snapshot(env, share) });
  }
  const assetMatch = p.match(/^\/api\/assets\/([a-f0-9]{64})$/);
  if (assetMatch && r.method === "GET") {
    const token = r.headers.get("X-Share-Token");
    let owner: string;
    if (token) {
      const share = await getShare(env, token);
      const data = await snapshot(env, share);
      if (!validateSnapshot(data).includes(assetMatch[1]))
        fail(404, "附件不存在");
      owner = share.owner_id;
    } else {
      const user = await session(r, env);
      if (!user) fail(401, "请先登录");
      owner = user.owner_id;
    }
    const obj = await env.BUCKET.get(`assets/${owner}/${assetMatch[1]}`);
    if (!obj) fail(404, "附件不存在");
    return new Response(obj.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const user = await session(r, env);
  if (!user) fail(401, "请先登录");
  const owner = user.owner_id;
  if (assetMatch && r.method === "PUT") {
    const bytes = await body(r, MAX_ASSET);
    if ((await hash(bytes.buffer)) !== assetMatch[1]) fail(400, "附件校验失败");
    const key = `assets/${owner}/${assetMatch[1]}`;
    if (!(await env.BUCKET.head(key))) await env.BUCKET.put(key, bytes);
    await env.DB.prepare("INSERT OR IGNORE INTO assets VALUES(?,?,?)")
      .bind(owner, assetMatch[1], bytes.length)
      .run();
    return json({ ok: true });
  }
  if (p === "/api/canvas" && r.method === "GET") {
    const c = await env.DB.prepare("SELECT * FROM canvases WHERE owner_id=?")
      .bind(owner)
      .first<{ revision: number; version_id: string }>();
    if (!c?.version_id) return json({ revision: 0, snapshot: null });
    const v = await env.DB.prepare(
      "SELECT object_key FROM versions WHERE id=? AND owner_id=?",
    )
      .bind(c.version_id, owner)
      .first<{ object_key: string }>();
    if (!v) fail(404, "版本不存在");
    return json({ revision: c.revision, snapshot: await snapshot(env, v) });
  }
  if (p === "/api/canvas" && r.method === "PUT") {
    const data = await input(r);
    if (!Number.isSafeInteger(data.baseRevision) || data.baseRevision < 0)
      fail(400, "版本号无效");
    const assets = validateSnapshot(data.snapshot);
    for (const id of assets)
      if (
        !(await env.DB.prepare(
          "SELECT id FROM assets WHERE owner_id=? AND id=?",
        )
          .bind(owner, id)
          .first())
      )
        fail(400, "附件尚未上传");
    const id = crypto.randomUUID(),
      key = `snapshots/${owner}/${id}.json`,
      now = Date.now();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO canvases(owner_id,updated_at) VALUES(?,?)",
    )
      .bind(owner, now)
      .run();
    await env.BUCKET.put(key, JSON.stringify(data.snapshot));
    const result = await env.DB.batch([
      env.DB.prepare("INSERT INTO versions VALUES(?,?,?,?)").bind(
        id,
        owner,
        key,
        now,
      ),
      env.DB.prepare(
        "UPDATE canvases SET revision=revision+1, version_id=?, updated_at=? WHERE owner_id=? AND revision=? RETURNING revision",
      ).bind(id, now, owner, data.baseRevision),
    ]);
    if (!result[1].results.length) {
      await env.DB.prepare("DELETE FROM versions WHERE id=?").bind(id).run();
      await env.BUCKET.delete(key);
      fail(409, "另一台设备已更新画布，本地修改已保留");
    }
    return json({ revision: data.baseRevision + 1, versionId: id });
  }
  if (p === "/api/shares" && r.method === "POST") {
    const { expiresInDays, expectedRevision } = await input(r);
    if (![1, 7, 30, null].includes(expiresInDays)) fail(400, "有效期无效");
    const c = await env.DB.prepare(
      "SELECT version_id,revision FROM canvases WHERE owner_id=?",
    )
      .bind(owner)
      .first<{ version_id: string; revision: number }>();
    if (!c?.version_id) fail(400, "请先同步画布");
    if (c.revision !== expectedRevision)
      fail(409, "另一台设备已更新画布，请先同步再分享");
    const token = random(),
      id = crypto.randomUUID(),
      now = Date.now(),
      expires = expiresInDays ? now + expiresInDays * 86400000 : null;
    await env.DB.prepare("INSERT INTO shares VALUES(?,?,?,?,?,?,?)")
      .bind(id, await hash(token), owner, c.version_id, expires, null, now)
      .run();
    return json({ id, token, expiresAt: expires });
  }
  if (p === "/api/shares" && r.method === "GET")
    return json({
      shares: (
        await env.DB.prepare(
          "SELECT id,expires_at,revoked_at,created_at FROM shares WHERE owner_id=? ORDER BY created_at DESC LIMIT 100",
        )
          .bind(owner)
          .all()
      ).results,
    });
  const sm = p.match(/^\/api\/shares\/([a-f0-9-]+)$/);
  if (sm && r.method === "DELETE") {
    await env.DB.prepare(
      "UPDATE shares SET revoked_at=? WHERE id=? AND owner_id=?",
    )
      .bind(Date.now(), sm[1], owner)
      .run();
    return json({ ok: true });
  }
  fail(404, "接口不存在");
}
async function getShare(env: Env, token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    fail(404, "分享不存在或已失效");
  const share = await env.DB.prepare(
    "SELECT s.owner_id,v.object_key FROM shares s JOIN versions v ON v.id=s.version_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>?)",
  )
    .bind(await hash(token), Date.now())
    .first<{ owner_id: string; object_key: string }>();
  if (!share) fail(404, "分享不存在或已失效");
  return share;
}
export default {
  async fetch(r: Request, env: Env) {
    try {
      return await route(r, env);
    } catch (e) {
      if (e instanceof Response) return e;
      return json({ message: "云服务暂时不可用，请稍后重试" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

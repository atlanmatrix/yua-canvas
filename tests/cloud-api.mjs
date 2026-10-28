import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { pdfFixture } from "./pdf-fixture.mjs";
const cli = "node_modules/wrangler/bin/wrangler.js",
  persist = "work/cloud-test-state",
  origin = "http://127.0.0.1:8791";
let worker;
const run = (args) =>
  execFileSync(process.execPath, [cli, ...args], {
    stdio: "pipe",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
const token = "integration-owner-session",
  other = "integration-other-session";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const board = (text) => ({
  version: 1,
  cards: [
    {
      id: "text1",
      kind: "text",
      title: "",
      text,
      x: 10,
      y: 20,
      color: "#ffffff",
    },
  ],
  groups: [],
});
async function request(
  path,
  method = "GET",
  data,
  session = token,
  headers = {},
) {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(session ? { Cookie: "yua_session=" + session } : {}),
      ...headers,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: r.status, data: await r.json() };
}
before(async () => {
  rmSync(persist, { recursive: true, force: true });
  run([
    "d1",
    "migrations",
    "apply",
    "yua-canvas",
    "--local",
    "--persist-to",
    persist,
  ]);
  run([
    "d1",
    "execute",
    "yua-canvas",
    "--local",
    "--persist-to",
    persist,
    "--command",
    `INSERT INTO sessions VALUES('${hash(token)}','owner','author',${Date.now() + 3600000}),('${hash(other)}','other','visitor',${Date.now() + 3600000})`,
  ]);
  worker = spawn(
    process.execPath,
    [
      cli,
      "dev",
      "--port",
      "8791",
      "--ip",
      "127.0.0.1",
      "--persist-to",
      persist,
      "--var",
      "APP_ORIGIN:" + origin,
    ],
    { stdio: "pipe", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );
  let logs = "";
  worker.stdout.on("data", (d) => (logs += d));
  worker.stderr.on("data", (d) => (logs += d));
  for (let i = 0; i < 150; i++) {
    try {
      if ((await request("/session")).status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error(logs);
});
after(() => {
  worker?.kill("SIGTERM");
});
test("authentication and origin checks", async () => {
  assert.equal((await request("/canvas", "GET", undefined, null)).status, 401);
  assert.equal(
    (
      await request(
        "/canvas",
        "PUT",
        { baseRevision: 0, snapshot: board("bad") },
        token,
        { Origin: "https://other.example" },
      )
    ).status,
    403,
  );
  assert.equal((await request("/session")).data.user.name, "author");
});
test("optimistic revisions, immutable shares, expiration, revocation and isolation", async () => {
  assert.equal(
    (
      await request("/canvas", "PUT", {
        baseRevision: 0,
        snapshot: board("first"),
      })
    ).data.revision,
    1,
  );
  const results = await Promise.all(
    ["second", "competing"].map((text) =>
      request("/canvas", "PUT", { baseRevision: 1, snapshot: board(text) }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await request("/canvas")).data.revision, 2);
  const shared = await request("/shares", "POST", {
    expiresInDays: 7,
    expectedRevision: 2,
  });
  assert.equal(shared.status, 200);
  const sharedText = (
    await request("/shares/resolve", "POST", { token: shared.data.token }, null)
  ).data.snapshot.cards[0].text;
  assert.equal(
    (
      await request("/canvas", "PUT", {
        baseRevision: 2,
        snapshot: board("third"),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/shares/resolve",
        "POST",
        { token: shared.data.token },
        null,
      )
    ).data.snapshot.cards[0].text,
    sharedText,
  );
  assert.equal(
    (await request("/canvas", "GET", undefined, other)).data.snapshot,
    null,
  );
  await request("/shares/" + shared.data.id, "DELETE", {}, other);
  assert.equal(
    (
      await request(
        "/shares/resolve",
        "POST",
        { token: shared.data.token },
        null,
      )
    ).status,
    200,
  );
  await request("/shares/" + shared.data.id, "DELETE", {});
  assert.equal(
    (
      await request(
        "/shares/resolve",
        "POST",
        { token: shared.data.token },
        null,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/shares", "POST", {
        expiresInDays: 7,
        expectedRevision: 2,
      })
    ).status,
    409,
  );
  const expired = await request("/shares", "POST", {
    expiresInDays: 1,
    expectedRevision: 3,
  });
  run([
    "d1",
    "execute",
    "yua-canvas",
    "--local",
    "--persist-to",
    persist,
    "--command",
    `UPDATE shares SET expires_at=1 WHERE id='${expired.data.id}'`,
  ]);
  assert.equal(
    (
      await request(
        "/shares/resolve",
        "POST",
        { token: expired.data.token },
        null,
      )
    ).status,
    404,
  );
});
test("attachment integrity and share-scoped access", async () => {
  const bytes = new TextEncoder().encode("original attachment"),
    id = hash(bytes),
    otherId = hash("unreferenced");
  const upload = async (id, body) =>
    fetch(origin + "/api/assets/" + id, {
      method: "PUT",
      headers: { Origin: origin, Cookie: "yua_session=" + token },
      body,
    });
  assert.equal((await upload(id, "wrong bytes")).status, 400);
  assert.equal((await upload(id, bytes)).status, 200);
  await upload(otherId, "unreferenced");
  const snapshot = {
    version: 1,
    cards: [
      {
        id: "f1",
        kind: "file",
        title: "test.txt",
        text: "",
        x: 0,
        y: 0,
        mime: "text/plain",
        archiveFile: id,
      },
    ],
    groups: [],
  };
  assert.equal(
    (await request("/canvas", "PUT", { baseRevision: 3, snapshot })).status,
    200,
  );
  const share = (
    await request("/shares", "POST", {
      expiresInDays: null,
      expectedRevision: 4,
    })
  ).data;
  const get = (id) =>
    fetch(origin + "/api/assets/" + id, {
      headers: { "X-Share-Token": share.token },
    });
  assert.equal(await (await get(id)).text(), "original attachment");
  assert.equal((await get(otherId)).status, 404);
  assert.equal(
    (
      await fetch(origin + "/api/assets/" + id, {
        headers: { Cookie: "yua_session=" + other },
      })
    ).status,
    404,
  );
  await request("/shares/" + share.id, "DELETE", {});
  assert.equal((await get(id)).status, 404);
});

test("miniature snapshots sync and share; unsafe scene URLs are rejected", async () => {
  const snapshot = board(
    "https://atlanmatrix.github.io/codex-playground/city/",
  );
  snapshot.cards[0].kind = "miniature";
  snapshot.cards[0].title = "被自然收回的城市街角";
  for (const text of [
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "/relative",
  ]) {
    const invalid = structuredClone(snapshot);
    invalid.cards[0].text = text;
    assert.equal(
      (
        await request(
          "/canvas",
          "PUT",
          { baseRevision: 0, snapshot: invalid },
          other,
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (await request("/canvas", "PUT", { baseRevision: 0, snapshot }, other))
      .status,
    200,
  );
  const shared = await request(
    "/shares",
    "POST",
    { expiresInDays: 7, expectedRevision: 1 },
    other,
  );
  assert.equal(shared.status, 200);
  const resolved = await request(
    "/shares/resolve",
    "POST",
    { token: shared.data.token },
    null,
  );
  assert.deepEqual(resolved.data.snapshot.cards, snapshot.cards);
});

test("Mermaid and document metadata sync and share with lossless PDF attachments", async () => {
  const bytes = pdfFixture(),
    id = hash(bytes);
  assert.equal(
    (
      await fetch(origin + "/api/assets/" + id, {
        method: "PUT",
        headers: { Origin: origin, Cookie: "yua_session=" + token },
        body: bytes,
      })
    ).status,
    200,
  );
  const snapshot = board("flowchart LR\n  A --> B");
  snapshot.cards[0].kind = "mermaid";
  snapshot.cards.push({
    id: "pdf",
    kind: "file",
    title: "pages.pdf",
    text: "",
    x: 500,
    y: 20,
    mime: "application/pdf",
    archiveFile: id,
    pdfPage: 2,
  });
  const empty = new TextEncoder().encode("# Created file"),
    textId = hash(empty);
  assert.equal(
    (
      await fetch(origin + "/api/assets/" + textId, {
        method: "PUT",
        headers: { Origin: origin, Cookie: "yua_session=" + token },
        body: empty,
      })
    ).status,
    200,
  );
  snapshot.cards.push({
    id: "md",
    kind: "file",
    title: "created.md",
    text: "",
    x: 100,
    y: 400,
    mime: "text/markdown",
    archiveFile: textId,
    editableFile: true,
  });
  const revision = (await request("/canvas")).data.revision;
  const updated = await request("/canvas", "PUT", {
    baseRevision: revision,
    snapshot,
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(
    (await request("/canvas")).data.snapshot.cards,
    snapshot.cards,
  );
  const share = await request("/shares", "POST", {
    expiresInDays: null,
    expectedRevision: updated.data.revision,
  });
  assert.equal(share.status, 200);
  const resolved = await request(
    "/shares/resolve",
    "POST",
    { token: share.data.token },
    null,
  );
  assert.deepEqual(resolved.data.snapshot.cards, snapshot.cards);
  const asset = await fetch(origin + "/api/assets/" + id, {
    headers: { "X-Share-Token": share.data.token },
  });
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), bytes);
});

test("local application associations sync as data and reject invalid paths or command controls", async () => {
  const snapshot = board("/Users/alice/项目 #1");
  snapshot.cards[0].kind = "vscode";
  snapshot.cards.push({
    id: "terminal",
    kind: "iterm2",
    title: "iTerm2",
    text: "cd /tmp/project\nprintf '%s\\n' ready",
    x: 100,
    y: 200,
  });
  const revision = (await request("/canvas")).data.revision;
  for (const [kind, text] of [
    ["vscode", "relative/path"],
    ["vscode", "vscode://command/test"],
    ["iterm2", ""],
    ["iterm2", "echo ok\u001b[A"],
  ]) {
    const invalid = structuredClone(snapshot);
    invalid.cards[0].kind = kind;
    invalid.cards[0].text = text;
    assert.equal(
      (
        await request("/canvas", "PUT", {
          baseRevision: revision,
          snapshot: invalid,
        })
      ).status,
      400,
    );
  }
  const updated = await request("/canvas", "PUT", {
    baseRevision: revision,
    snapshot,
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(
    (await request("/canvas")).data.snapshot.cards,
    snapshot.cards,
  );
  const share = await request("/shares", "POST", {
    expiresInDays: null,
    expectedRevision: updated.data.revision,
  });
  assert.equal(share.status, 200);
  const resolved = await request(
    "/shares/resolve",
    "POST",
    { token: share.data.token },
    null,
  );
  assert.deepEqual(resolved.data.snapshot.cards, snapshot.cards);
});

test("miniature covers remain share-scoped assets and saved views stay on the configured scene", async () => {
  const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
    id = hash(bytes);
  const uploaded = await fetch(origin + "/api/assets/" + id, {
    method: "PUT",
    headers: { Origin: origin, Cookie: "yua_session=" + other },
    body: bytes,
  });
  assert.equal(uploaded.status, 200);
  const current = await request("/canvas", "GET", undefined, other),
    revision = current.data.revision;
  const snapshot = board(
    "https://atlanmatrix.github.io/codex-playground/city/",
  );
  Object.assign(snapshot.cards[0], {
    kind: "miniature",
    title: "城市",
    mime: "image/png",
    blobType: "image/png",
    archiveFile: id,
    miniatureView: "https://other.example/city/?view=saved",
  });
  assert.equal(
    (
      await request(
        "/canvas",
        "PUT",
        { baseRevision: revision, snapshot },
        other,
      )
    ).status,
    400,
  );
  snapshot.cards[0].miniatureView = snapshot.cards[0].text + "?view=saved";
  assert.equal(
    (
      await request(
        "/canvas",
        "PUT",
        { baseRevision: revision, snapshot },
        other,
      )
    ).status,
    200,
  );
  const shared = await request(
    "/shares",
    "POST",
    { expiresInDays: 7, expectedRevision: revision + 1 },
    other,
  );
  assert.equal(shared.status, 200);
  const image = await fetch(origin + "/api/assets/" + id, {
    headers: { "X-Share-Token": shared.data.token },
  });
  assert.equal(image.status, 200);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
  assert.equal(
    (
      await request(
        "/shares/resolve",
        "POST",
        { token: shared.data.token },
        null,
      )
    ).data.snapshot.cards[0].miniatureView,
    snapshot.cards[0].miniatureView,
  );
});

test("all six tool states sync and share while malformed settings are rejected atomically", async () => {
  const states = {
    calculator: { expression: "2^3", history: ["2^3 = 8"] },
    currency: { amount: "12", from: "USD", to: "CNY" },
    temperature: { amount: "-40", from: "C", to: "F" },
    distance: { amount: "1", from: "mi", to: "km" },
    weather: { city: "Tokyo", latitude: 35.68, longitude: 139.69 },
    calendar: { month: "2026-10", selected: "2026-10-28" },
  };
  const snapshot = {
    version: 1,
    cards: Object.entries(states).map(([kind, state], i) => ({
      id: kind,
      kind,
      title: kind,
      text: JSON.stringify(state),
      x: i * 400,
      y: 20,
      displayMode: "medium",
    })),
    groups: [],
  };
  const revision = (await request("/canvas")).data.revision;
  for (const [kind, text] of [
    ["currency", '{"from":"INVALID"}'],
    ["weather", '{"latitude":100}'],
    ["calculator", "not json"],
    ["calendar", '{"month":"2026-99"}'],
  ]) {
    const invalid = structuredClone(snapshot);
    invalid.cards[0].kind = kind;
    invalid.cards[0].text = text;
    assert.equal(
      (
        await request("/canvas", "PUT", {
          baseRevision: revision,
          snapshot: invalid,
        })
      ).status,
      400,
    );
  }
  const updated = await request("/canvas", "PUT", {
    baseRevision: revision,
    snapshot,
  });
  assert.equal(updated.status, 200);
  const share = await request("/shares", "POST", {
    expiresInDays: 7,
    expectedRevision: updated.data.revision,
  });
  assert.equal(share.status, 200);
  const resolved = await request(
    "/shares/resolve",
    "POST",
    { token: share.data.token },
    null,
  );
  assert.deepEqual(resolved.data.snapshot.cards, snapshot.cards);
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
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

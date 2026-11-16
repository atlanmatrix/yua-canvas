import type { Board, Card, View, Navigation } from "./storage";
import { cardRect } from "./geometry";
import { protectPreviewCaches } from "./previewDisk";
import {
  validEnvelope,
  type CipherBox,
  type Envelope,
  type LockProfile,
} from "./encryptionSchema";
const utf8 = new TextEncoder();
const CHECK = utf8.encode("yua-canvas-key-1"); // 16 bytes, plus the GCM tag.
const sessions = new Map<string, { key: CryptoKey; kek: CryptoKey }>();
const sealed = new WeakMap<Card, Promise<Card>>();
const sealedScopes = new WeakMap<object, Promise<Board>>();
const b64 = (bytes: Uint8Array) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
};
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const random = (length: number) =>
  crypto.getRandomValues(new Uint8Array(length));
const aad = (purpose: string) =>
  utf8.encode("yua-canvas:envelope:v1:" + purpose);
export function protectedNavigation(
  root: Board,
  view: View | undefined,
  navigation: Navigation | undefined,
) {
  if (!navigation) return { view, navigation };
  let board = root;
  const path: string[] = [];
  for (const id of navigation.path) {
    const child = board.cards.find(
      (c) => c.id === id && c.kind === "canvas" && c.canvas,
    );
    if (!child?.canvas) break;
    path.push(id);
    board = child.canvas;
  }
  return path.length === navigation.path.length
    ? { view, navigation }
    : {
        view: navigation.views[board.id || ""] || { x: 65, y: 55, z: 1 },
        navigation: { ...navigation, path },
      };
}
async function derive(
  password: string,
  profile: Pick<LockProfile, "salt" | "iterations">,
) {
  if (!crypto.subtle) throw Error("加密需要 HTTPS 或 localhost 环境");
  const material = await crypto.subtle.importKey(
    "raw",
    utf8.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bytes(profile.salt),
      iterations: profile.iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function encrypt(
  data: Uint8Array,
  key: CryptoKey,
  purpose: string,
): Promise<CipherBox> {
  const iv = random(12);
  const result = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(purpose) },
    key,
    data as Uint8Array<ArrayBuffer>,
  );
  return { iv: b64(iv), ciphertext: b64(new Uint8Array(result)) };
}
async function decrypt(box: CipherBox, key: CryptoKey, purpose: string) {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(box.iv), additionalData: aad(purpose) },
      key,
      bytes(box.ciphertext),
    ),
  );
}
async function master(password: string, profile: LockProfile) {
  const key = await derive(password, profile);
  try {
    const check = await decrypt(profile.check, key, "master:" + profile.salt);
    if (b64(check) !== b64(CHECK)) throw Error();
  } catch {
    throw Error("密码错误或加密数据已损坏");
  }
  return key;
}
export async function createLockProfile(
  password: string,
): Promise<LockProfile> {
  if (password.length < 8) throw Error("主密码至少需要 8 个字符");
  const settings = { salt: b64(random(16)), iterations: 600000 as const };
  const key = await derive(password, settings);
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    ...settings,
    check: await encrypt(CHECK, key, "master:" + settings.salt),
  };
}
export function findLockProfile(board: Board): LockProfile | undefined {
  if (board.lockProfile) return board.lockProfile;
  for (const card of board.cards) {
    if (card.lock) return card.lock.profile;
    if (card.canvas) {
      const found = findLockProfile(card.canvas);
      if (found) return found;
    }
  }
}
export function hasProtected(
  board: Pick<Board, "cards"> & { protection?: Envelope },
): boolean {
  if (board.protection) return true;
  return board.cards.some(
    (c) =>
      !!c.lock || !!c.inheritedLock || (c.canvas && hasProtected(c.canvas)),
  );
}
function cleanBoard(board: Board): Board {
  const result = { ...board, cards: board.cards.map(cleanCard) };
  delete result.protection;
  return result;
}
function cleanCard(card: Card): Card {
  const result = {
    ...card,
    ...(card.canvas ? { canvas: cleanBoard(card.canvas) } : {}),
  };
  delete result.inheritedLock;
  return result;
}
function inherit(board: Board, lock: Envelope): Board {
  let changed = board.protection !== lock;
  const cards = board.cards.map((c) => {
    if (c.lock) return c;
    const canvas = c.canvas ? inherit(c.canvas, lock) : undefined;
    if (c.inheritedLock === lock && canvas === c.canvas) return c;
    changed = true;
    return { ...c, inheritedLock: lock, ...(canvas ? { canvas } : {}) };
  });
  return changed ? { ...board, protection: lock, cards } : board;
}
export const inheritProtection = inherit;
function shell(card: Card, lock: Envelope, blob: Blob): Card {
  const r = cardRect(card);
  return {
    id: card.id,
    kind: "text",
    title: "已锁定组件",
    text: "",
    color: card.color,
    x: card.x,
    y: card.y,
    width: r.width,
    height: r.height,
    group: card.group,
    displayMode: card.displayMode === "small" ? "small" : "large",
    locked: true,
    lock,
    blob,
  };
}
async function encryptContent(card: Card, lock: Envelope, key: CryptoKey) {
  const { serializeBoard } = await import("./storage");
  const bare = cleanCard(card);
  delete bare.lock;
  delete bare.locked;
  const data = utf8.encode(
    JSON.stringify(
      await serializeBoard({ version: 1, cards: [bare], groups: [] }),
    ),
  );
  const iv = random(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad("content:" + lock.id) },
    key,
    data,
  );
  return shell(
    card,
    {
      ...lock,
      dataIV: b64(iv),
      taskIds:
        card.kind === "todo" ? card.tasks?.map((t) => t.id) || [] : undefined,
    },
    new Blob([ciphertext], { type: "application/octet-stream" }),
  );
}
export async function lockCard(
  card: Card,
  profile: LockProfile,
  password: string,
): Promise<Card> {
  const kek = await master(password, profile);
  await protectPreviewCaches();
  if (card.lock && !card.locked) return sealCard(card);
  return lockWithKey(card, profile, kek);
}
async function lockWithKey(
  card: Card,
  profile: LockProfile,
  kek: CryptoKey,
): Promise<Card> {
  const raw = random(32);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  const id = crypto.randomUUID();
  const lock: Envelope = {
    version: 1,
    id,
    profile,
    wrappedKey: await encrypt(raw, kek, "key:" + id),
    dataIV: "",
    ...(card.kind === "todo"
      ? { taskIds: card.tasks?.map((t) => t.id) || [] }
      : {}),
  };
  return encryptContent(card, lock, key);
}
export async function unlockCard(card: Card, password: string): Promise<Card> {
  if (!card.locked || !validEnvelope(card.lock) || !card.blob)
    throw Error("加密组件数据无效");
  const lock = card.lock;
  const kek = await master(password, lock.profile);
  await protectPreviewCaches();
  try {
    const raw = await decrypt(lock.wrappedKey, kek, "key:" + lock.id);
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
    const data = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(lock.dataIV),
        additionalData: aad("content:" + lock.id),
      },
      key,
      await card.blob.arrayBuffer(),
    );
    const { importBoard } = await import("./storage");
    const original = (await importBoard(new TextDecoder().decode(data)))
      .cards[0];
    if (!original || original.lock) throw Error();
    sessions.set(lock.id, { key, kek });
    return {
      ...original,
      ...(original.canvas ? { canvas: inherit(original.canvas, lock) } : {}),
      id: card.id,
      x: card.x,
      y: card.y,
      group: card.group,
      color: card.color,
      lock,
      locked: false,
    };
  } catch {
    throw Error("密码错误或加密数据已损坏");
  }
}
export function forgetCard(card: Card) {
  if (card.lock) sessions.delete(card.lock.id);
  if (card.canvas) card.canvas.cards.forEach(forgetCard);
}
// Imported backups can repeat an encrypted record. Isolate it before editing so
// neither session keys nor hidden canvas identities are shared across copies.
export async function unlockIsolated(
  card: Card,
  password: string,
  root: Board,
) {
  let count = 0;
  const used = new Set<string>();
  const scan = (board: Board) => {
    if (board.id) used.add(board.id);
    for (const c of board.cards) {
      if (c.lock?.id === card.lock?.id) count++;
      if (c.canvas) scan(c.canvas);
    }
  };
  scan(root);
  const unique = (board: Board): Board => {
    let id = board.id;
    if (id && used.has(id)) id = crypto.randomUUID();
    if (id) used.add(id);
    return {
      ...board,
      id,
      cards: board.cards.map((c) =>
        c.canvas ? { ...c, canvas: unique(c.canvas) } : c,
      ),
    };
  };
  let plain = await unlockCard(card, password);
  if (plain.canvas) plain = { ...plain, canvas: unique(plain.canvas) };
  if (count > 1) {
    const bare = { ...plain };
    delete bare.lock;
    delete bare.locked;
    plain = await unlockCard(
      await lockCard(bare, card.lock!.profile, password),
      password,
    );
  }
  return plain;
}
export async function removeEncryption(
  card: Card,
  password: string,
  root: Board,
): Promise<Card> {
  if (!card.lock) throw Error("组件未单独加密");
  // An already open component can contain newer edits than its stored envelope.
  const plain = card.locked
    ? await unlockIsolated(card, password, root)
    : (await master(password, card.lock.profile), card);
  const removedId = plain.lock!.id;
  const stripCard = (value: Card): Card => {
    const next = {
      ...value,
      ...(value.canvas ? { canvas: stripBoard(value.canvas) } : {}),
    };
    if (next.inheritedLock?.id === removedId) delete next.inheritedLock;
    return next;
  };
  const stripBoard = (value: Board): Board => {
    const next = { ...value, cards: value.cards.map(stripCard) };
    if (next.protection?.id === removedId) delete next.protection;
    return next;
  };
  const next = stripCard(plain);
  delete next.lock;
  delete next.locked;
  return next;
}
export function releaseUnusedKeys(root: Board) {
  const used = new Set<string>();
  const scan = (board: Board) => {
    if (board.protection) used.add(board.protection.id);
    for (const card of board.cards) {
      if (card.lock) used.add(card.lock.id);
      if (card.inheritedLock) used.add(card.inheritedLock.id);
      if (card.canvas) scan(card.canvas);
    }
  };
  scan(root);
  for (const id of sessions.keys()) if (!used.has(id)) sessions.delete(id);
}
export function sealCard(card: Card): Promise<Card> {
  if (card.inheritedLock && !card.lock) {
    const cached = sealed.get(card);
    if (cached) return cached;
    const session = sessions.get(card.inheritedLock.id);
    if (!session)
      return Promise.reject(Error("加密会话已失效，请重新解锁组件"));
    const result = lockWithKey(
      cleanCard(card),
      card.inheritedLock.profile,
      session.kek,
    );
    sealed.set(card, result);
    return result;
  }
  if (!card.lock) return Promise.resolve(card);
  if (card.locked) return Promise.resolve(shell(card, card.lock, card.blob!));
  const cached = sealed.get(card);
  if (cached) return cached;
  const key = sessions.get(card.lock.id)?.key;
  if (!key) return Promise.reject(Error("加密会话已失效，请重新解锁组件"));
  const result = encryptContent(card, card.lock, key).catch((error) => {
    sealed.delete(card);
    throw error;
  });
  sealed.set(card, result);
  return result;
}
export async function sealBoard<
  T extends Pick<Board, "cards"> & { protection?: Envelope },
>(board: T): Promise<T> {
  if (board.protection) {
    let result = sealedScopes.get(board);
    if (!result) {
      const scope = board.protection;
      const session = sessions.get(scope.id);
      if (!session) throw Error("加密会话已失效，请重新解锁组件");
      result = lockWithKey(
        {
          id: crypto.randomUUID(),
          kind: "canvas",
          title: "受保护画布",
          text: "",
          x: 0,
          y: 0,
          color: "#ffffff",
          width: 320,
          height: 240,
          canvas: cleanBoard({ version: 1, groups: [], ...board } as Board),
        },
        scope.profile,
        session.kek,
      ).then((card) => ({ version: 1, cards: [card], groups: [] }));
      sealedScopes.set(board, result);
    }
    return (await result) as unknown as T;
  }
  if (!hasProtected(board)) return board;
  const cards = await Promise.all(
    board.cards.map(async (card) =>
      card.lock || card.inheritedLock
        ? sealCard(card)
        : card.canvas
          ? { ...card, canvas: await sealBoard(card.canvas) }
          : card,
    ),
  );
  return { ...board, cards };
}
export async function duplicateProtected(
  board: Board,
  fragment: import("./fragments").Fragment,
  offset: number | { x: number; y: number },
  password: string,
) {
  fragment = await sealBoard(fragment);
  async function reveal<T extends Pick<Board, "cards">>(value: T): Promise<T> {
    const cards = await Promise.all(
      value.cards.map(async (card) => {
        let next = card;
        if (card.lock) {
          if (card.locked) next = await unlockCard(card, password);
          else await master(password, card.lock.profile);
        }
        return next.canvas
          ? { ...next, canvas: await reveal(next.canvas) }
          : next;
      }),
    );
    return { ...value, cards };
  }
  async function protect(value: Board): Promise<Board> {
    const cards = await Promise.all(
      value.cards.map(async (card) => {
        const next = card.canvas
          ? { ...card, canvas: await protect(card.canvas) }
          : card;
        if (!next.lock) return next;
        const bare = { ...next };
        delete bare.lock;
        delete bare.locked;
        return lockCard(bare, next.lock.profile, password);
      }),
    );
    return { ...value, cards };
  }
  const { duplicateFragment } = await import("./fragments");
  const result = duplicateFragment(
    { ...board, cards: [], groups: [], connections: [] },
    await reveal(fragment),
    offset,
  );
  const copied = await protect(result.board);
  return {
    ...result,
    board: {
      ...board,
      cards: [...board.cards, ...copied.cards],
      groups: [...board.groups, ...copied.groups],
      connections: [
        ...(board.connections || []),
        ...(copied.connections || []),
      ],
      ...(copied.strokes
        ? { strokes: [...(board.strokes || []), ...copied.strokes] }
        : {}),
    },
  };
}

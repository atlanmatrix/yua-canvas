import { expect, test, type Page } from "@playwright/test";
import {
  flagCell,
  mineStatus,
  moveTiles,
  newGame,
  revealCell,
  tickSnake,
  tilesStuck,
  turnSnake,
  validGame,
  type GameKind,
  type Mines,
  type Snake,
  type Tiles,
} from "../src/relaxGames";

async function createGame(page: Page, label: string, x = 100) {
  await page
    .locator(".canvas")
    .click({ button: "right", position: { x, y: 110 } });
  await page
    .getByRole("menuitem", { name: "Relax", exact: true })
    .press("ArrowRight");
  const menu = page.getByRole("menu", { name: "Relax", exact: true });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "扫雷",
    "贪吃蛇",
    "2048",
  ]);
  await menu.getByRole("menuitem", { name: label, exact: true }).click();
  return page.getByRole("region", { name: label, exact: true }).last();
}
function savedGame(page: Page, kind: GameKind) {
  return page.evaluate(async (kind) => {
    const { readBoard } = await import("/src/storage.ts" as string);
    const card = (await readBoard())?.cards.find(
      (c: { kind: string }) => c.kind === kind,
    );
    return card && JSON.parse(card.text);
  }, kind);
}
test("Minesweeper protects the first opening, expands blanks, preserves flags and detects wins and losses", () => {
  let game = newGame("minesweeper") as Mines;
  game = flagCell(game, 0);
  expect(revealCell(game, 0)).toBe(game);
  game = revealCell(game, 40);
  expect(game.open).toContain(40);
  expect(game.open.length).toBeGreaterThanOrEqual(9);
  expect(game.mines).toHaveLength(10);
  expect(game.flags).toEqual([0]);
  game = flagCell(game, 0);
  expect(mineStatus(revealCell(game, game.mines[0]))).toBe("lost");
  for (let i = 0; i < 81; i++)
    if (!game.mines.includes(i)) game = revealCell(game, i);
  expect(mineStatus(game)).toBe("won");
  expect(validGame(game.kind, game)).toBe(true);
});
test("Snake grows, rejects reversals, may enter its departing tail and stops on collision or filling the board", () => {
  const start: Snake = {
    kind: "snake",
    body: [17, 16, 15],
    direction: "right",
    food: 18,
    status: "playing",
  };
  expect(turnSnake(start, "left")).toBe(start);
  const eaten = tickSnake(start);
  expect(eaten.body).toEqual([18, 17, 16, 15]);
  expect(eaten.body).not.toContain(eaten.food);
  expect(tickSnake({ ...start, body: [27, 26, 25] }).status).toBe("lost");
  const loop = { ...start, direction: "down" as const, body: [17, 16, 30, 31] };
  expect(tickSnake(loop).body).toEqual([31, 17, 16, 30]);
  expect(tickSnake({ ...loop, body: [...loop.body, 32] }).status).toBe("lost");
  const nearlyFull = Array.from({ length: 196 }, (_, i) => {
    const row = Math.floor(i / 14);
    return row * 14 + (row % 2 ? 13 - (i % 14) : i % 14);
  }).slice(1);
  const won = tickSnake({
    ...start,
    body: nearlyFull,
    direction: "left",
    food: 0,
  });
  expect(won.status).toBe("won");
  expect(validGame(won.kind, won)).toBe(true);
});
test("2048 merges each tile once, scores the merge and spawns only after a legal move", () => {
  const start: Tiles = {
    kind: "2048",
    tiles: [2, 2, 2, 2, 4, 4, 8, 0, 2, 0, 0, 0, 2, 0, 0, 0],
    score: 10,
  };
  const moved = moveTiles(start, "left");
  expect(moved.tiles.slice(0, 2)).toEqual([4, 4]);
  expect(moved.tiles.slice(4, 6)).toEqual([8, 8]);
  expect(moved.score).toBe(26);
  expect(moved.tiles.filter(Boolean)).toHaveLength(7);
  const stuck: Tiles = {
    ...start,
    tiles: [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2],
  };
  expect(tilesStuck(stuck)).toBe(true);
  expect(moveTiles(stuck, "down")).toBe(stuck);
  expect(validGame("2048", { ...start, tiles: [3] })).toBe(false);
});

test("Minesweeper saves the revealed board and flags immediately and keeps separate games independent", async ({
  page,
}) => {
  await page.goto("/");
  const first = await createGame(page, "扫雷");
  await first
    .getByRole("button", { name: "第 1 行，第 1 列，未翻开", exact: true })
    .click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await first
    .getByRole("button", { name: "第 5 行，第 5 列，未翻开", exact: true })
    .click();
  const before = (await savedGame(page, "minesweeper")) as Mines;
  expect(before.flags).toEqual([0]);
  expect(before.open).toContain(40);
  const second = await createGame(page, "扫雷", 500);
  await expect(second.locator("[data-open]")).toHaveCount(0);
  await page.reload();
  const restored = page.locator(".minefield").first();
  await expect(restored.locator("[data-open]")).toHaveCount(before.open.length);
  await expect(restored.locator("[data-flag]")).toHaveCount(1);
  expect(await savedGame(page, "minesweeper")).toEqual(before);
});

test("Snake checkpoints during continuous movement and resumes from rest after reload", async ({
  page,
}) => {
  await page.goto("/");
  const card = await createGame(page, "贪吃蛇");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 5000));
  await card.getByRole("button", { name: "开始", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  const head = (await savedGame(page, "snake")).body[0];
  for (let step = 1; step <= 2; step++) {
    await page.clock.runFor(230);
    await expect
      .poll(async () => (await savedGame(page, "snake")).body[0])
      .toBe(head + step);
  }
  const saved = (await savedGame(page, "snake")) as Snake;
  await page.reload();
  await expect(card.getByRole("button", { name: "继续" })).toBeVisible();
  await page.clock.runFor(1000);
  expect(await savedGame(page, "snake")).toEqual(saved);
  await card.getByRole("button", { name: "继续" }).click();
  await page.keyboard.press("ArrowDown");
  await page.clock.runFor(240);
  await expect
    .poll(async () => (await savedGame(page, "snake")).body[0])
    .toBe(saved.body[0] + 14);
  await page.locator(".canvas").click({ position: { x: 850, y: 110 } });
  await expect(card.getByRole("button", { name: "继续" })).toBeVisible();
});

test("2048 accepts focused keyboard and swipe input, preserves the exact board on reload and restarts", async ({
  page,
}) => {
  await page.goto("/");
  const card = await createGame(page, "2048");
  const before = (await savedGame(page, "2048")) as Tiles;
  const body = card.locator(".relax-body");
  const direction = (["left", "down", "right", "up"] as const).find(
    (d) => moveTiles(before, d) !== before,
  )!;
  await expect(body).toBeFocused();
  await page.keyboard.press(
    {
      left: "ArrowLeft",
      down: "ArrowDown",
      right: "ArrowRight",
      up: "ArrowUp",
    }[direction],
  );
  const after = (await savedGame(page, "2048")) as Tiles;
  expect(after.tiles).not.toEqual(before.tiles);
  await page.reload();
  await expect(card.locator(".tile-board span")).toHaveText(
    after.tiles.map((v) => (v ? String(v) : "")),
  );
  const board = (await card.locator(".tile-board").boundingBox())!;
  const x = board.x + board.width / 2,
    y = board.y + board.height / 2;
  const swipe = (["left", "right"] as const).find(
    (d) => moveTiles(after, d) !== after,
  )!;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (swipe === "left" ? -45 : 45), y);
  await page.mouse.up();
  expect((await savedGame(page, "2048")).tiles).not.toEqual(after.tiles);
  await card.getByRole("button", { name: "重新开始" }).click();
  await expect(
    card.locator(".tile-board span:not([data-power='0'])"),
  ).toHaveCount(2);
  expect((await savedGame(page, "2048")).score).toBe(0);
});

test("game progress survives workspace JSON and component ZIP transfers", async ({
  page,
}) => {
  await page.goto("/");
  const games = [
    revealCell(newGame("minesweeper") as Mines, 0),
    tickSnake({ ...(newGame("snake") as Snake), status: "playing" }),
    moveTiles(newGame("2048") as Tiles, "left"),
  ];
  const restored = await page.evaluate(async (games) => {
    const { importBoard, exportBoard } = await import(
      "/src/storage.ts" as string
    );
    const { createArchive, readArchive } = await import(
      "/src/archive.ts" as string
    );
    const cards = games.map((game, i) => ({
      kind: game.kind,
      id: String(i),
      title: game.kind,
      x: 320 * i,
      y: 0,
      color: "#ffffff",
      text: JSON.stringify(game),
    }));
    const board = await importBoard(
      JSON.stringify({ version: 1, cards, groups: [] }),
    );
    const json = await importBoard(await exportBoard(board));
    const zip = await readArchive(
      new File([await createArchive(board)], "games.zip"),
      { x: 0, y: 0 },
    );
    const states = (cards: { text: string }[]) =>
      cards.map((c) => JSON.parse(c.text));
    return { json: states(json.cards), zip: states(zip.cards) };
  }, games);
  expect(restored.json).toEqual(games);
  expect(restored.zip).toEqual(games);
});

test.describe("touchscreen", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("flag mode and a 2048 swipe work without moving the canvas", async ({
    page,
  }) => {
    await page.goto("/");
    const mine = await createGame(page, "扫雷", 30);
    await mine.getByRole("button", { name: "插旗模式" }).tap();
    await mine.locator(".mine-cell").first().tap();
    await expect(mine.locator("[data-flag]")).toHaveCount(1);
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 20, y: 40 }],
    });
    const relax = page.getByRole("menuitem", { name: "Relax", exact: true });
    await expect(relax).toBeVisible();
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await relax.tap();
    await page.getByRole("menuitem", { name: "2048", exact: true }).tap();
    const board = page.locator(".tile-board");
    await expect(board).toBeVisible();
    const before = (await savedGame(page, "2048")) as Tiles;
    const dir = moveTiles(before, "left") === before ? 1 : -1;
    const box = (await board.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const world = page.locator(".world");
    const camera = await world.evaluate((el) => el.getAttribute("style"));
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + dir * 55, y }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => (await savedGame(page, "2048")).tiles)
      .not.toEqual(before.tiles);
    expect(await world.evaluate((el) => el.getAttribute("style"))).toBe(camera);
    await touch.detach();
  });
});

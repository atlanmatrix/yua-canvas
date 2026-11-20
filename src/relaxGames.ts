export const GAME_KINDS = ["minesweeper", "snake", "2048"] as const;
export type GameKind = (typeof GAME_KINDS)[number];
export const isGameKind = (kind: string): kind is GameKind =>
  (GAME_KINDS as readonly string[]).includes(kind);

export const MINE_SIDE = 9,
  MINE_COUNT = 10,
  SNAKE_SIDE = 14;
export const directions = ["left", "up", "down", "right"] as const;
export type Direction = (typeof directions)[number];
const steps: Record<Direction, [number, number]> = {
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
  right: [1, 0],
};
export type Mines = {
  kind: "minesweeper";
  mines: number[];
  flags: number[];
  open: number[];
};
export type Snake = {
  kind: "snake";
  body: number[];
  direction: Direction;
  food: number | null;
  status: "ready" | "playing" | "lost" | "won";
};
export type Tiles = { kind: "2048"; tiles: number[]; score: number };
export type Game = Mines | Snake | Tiles;

const cells = (length: number) => Array.from({ length }, (_, i) => i);
const randomCell = (pool: number[]) =>
  pool[Math.floor(Math.random() * pool.length)];
function placeFood(body: number[]) {
  const free = cells(SNAKE_SIDE ** 2).filter((i) => !body.includes(i));
  return free.length ? randomCell(free) : null;
}
function spawnTile(tiles: number[]) {
  const free = cells(16).filter((i) => tiles[i] === 0);
  if (free.length) tiles[randomCell(free)] = Math.random() < 0.9 ? 2 : 4;
}
export function newGame(kind: GameKind): Game {
  switch (kind) {
    case "minesweeper":
      return { kind, mines: [], flags: [], open: [] };
    case "snake": {
      const head = Math.floor(SNAKE_SIDE / 2) * SNAKE_SIDE + 5;
      const body = [head, head - 1, head - 2];
      return {
        kind,
        body,
        direction: "right",
        food: placeFood(body),
        status: "ready",
      };
    }
    case "2048": {
      const tiles = Array<number>(16).fill(0);
      spawnTile(tiles);
      spawnTile(tiles);
      return { kind, tiles, score: 0 };
    }
  }
}

function cellAt(x: number, y: number, side: number) {
  return x >= 0 && x < side && y >= 0 && y < side ? y * side + x : -1;
}
function neighbors(i: number) {
  const adjacent: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cell = cellAt(
        (i % MINE_SIDE) + dx,
        Math.floor(i / MINE_SIDE) + dy,
        MINE_SIDE,
      );
      if (cell >= 0 && cell !== i) adjacent.push(cell);
    }
  return adjacent;
}
export function mineNumber(game: Mines, i: number) {
  return neighbors(i).filter((cell) => game.mines.includes(cell)).length;
}
export function mineStatus(game: Mines) {
  if (game.open.some((i) => game.mines.includes(i))) return "lost";
  return game.open.length === MINE_SIDE ** 2 - MINE_COUNT ? "won" : "playing";
}
export function flagCell(game: Mines, i: number): Mines {
  if (mineStatus(game) !== "playing" || game.open.includes(i)) return game;
  const flags = game.flags.includes(i)
    ? game.flags.filter((flag) => flag !== i)
    : game.flags.length < MINE_COUNT
      ? [...game.flags, i]
      : game.flags;
  return flags === game.flags ? game : { ...game, flags };
}
export function revealCell(game: Mines, i: number): Mines {
  if (
    mineStatus(game) !== "playing" ||
    game.open.includes(i) ||
    game.flags.includes(i)
  )
    return game;
  if (!game.mines.length) {
    const safe = new Set([i, ...neighbors(i)]);
    const pool = cells(MINE_SIDE ** 2).filter((cell) => !safe.has(cell));
    const mines = Array.from(
      { length: MINE_COUNT },
      () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0],
    );
    game = { ...game, mines };
  }
  const open = new Set(game.open);
  const pending = [i];
  while (pending.length) {
    const cell = pending.pop()!;
    if (open.has(cell) || game.flags.includes(cell)) continue;
    open.add(cell);
    if (!game.mines.includes(cell) && mineNumber(game, cell) === 0)
      pending.push(...neighbors(cell));
  }
  return { ...game, open: [...open] };
}

function nextHead(head: number, direction: Direction) {
  const [dx, dy] = steps[direction];
  return cellAt(
    (head % SNAKE_SIDE) + dx,
    Math.floor(head / SNAKE_SIDE) + dy,
    SNAKE_SIDE,
  );
}
export function turnSnake(game: Snake, direction: Direction): Snake {
  if (
    game.status === "lost" ||
    game.status === "won" ||
    nextHead(game.body[0], direction) === game.body[1]
  )
    return game;
  return direction === game.direction ? game : { ...game, direction };
}
export function tickSnake(game: Snake): Snake {
  if (game.status !== "playing") return game;
  const head = nextHead(game.body[0], game.direction);
  const eating = head === game.food;
  const rest = eating ? game.body : game.body.slice(0, -1);
  if (head < 0 || rest.includes(head)) return { ...game, status: "lost" };
  const body = [head, ...rest];
  const food = eating ? placeFood(body) : game.food;
  return { ...game, body, food, status: food === null ? "won" : "playing" };
}

export function moveTiles(game: Tiles, direction: Direction): Tiles {
  const tiles = [...game.tiles];
  let score = game.score;
  const vertical = direction === "up" || direction === "down";
  const reverse = direction === "right" || direction === "down";
  for (let line = 0; line < 4; line++) {
    const indices = cells(4).map((i) => {
      const offset = reverse ? 3 - i : i;
      return vertical ? offset * 4 + line : line * 4 + offset;
    });
    const values = indices.map((i) => game.tiles[i]).filter(Boolean);
    const merged: number[] = [];
    for (let i = 0; i < values.length; i++) {
      let value = values[i];
      if (value === values[i + 1]) {
        value *= 2;
        score += value;
        i++;
      }
      merged.push(value);
    }
    indices.forEach((index, i) => {
      tiles[index] = merged[i] || 0;
    });
  }
  if (tiles.every((value, i) => value === game.tiles[i])) return game;
  spawnTile(tiles);
  return { ...game, tiles, score };
}
export function tilesStuck({ tiles }: Tiles) {
  return tiles.every(
    (value, i) =>
      value &&
      (i % 4 === 3 || value !== tiles[i + 1]) &&
      value !== tiles[i + 4],
  );
}

function positions(value: unknown, size: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= size &&
    new Set(value).size === value.length &&
    value.every((i) => Number.isInteger(i) && i >= 0 && i < size)
  );
}
export function validGame(kind: GameKind, data: unknown): data is Game {
  if (
    !data ||
    typeof data !== "object" ||
    !("kind" in data) ||
    data.kind !== kind
  )
    return false;
  const game = data as Game;
  switch (game.kind) {
    case "minesweeper": {
      const size = MINE_SIDE ** 2;
      return (
        positions(game.open, size) &&
        positions(game.flags, size) &&
        positions(game.mines, size) &&
        game.flags.length <= MINE_COUNT &&
        game.flags.every((i) => !game.open.includes(i)) &&
        (game.mines.length === MINE_COUNT ||
          (!game.mines.length && !game.open.length))
      );
    }
    case "snake": {
      const size = SNAKE_SIDE ** 2;
      return (
        positions(game.body, size) &&
        game.body.length >= 3 &&
        directions.includes(game.direction) &&
        ["ready", "playing", "lost", "won"].includes(game.status) &&
        game.body
          .slice(1)
          .every((cell, i) =>
            directions.some((d) => nextHead(game.body[i], d) === cell),
          ) &&
        (game.status === "won"
          ? game.food === null && game.body.length === size
          : typeof game.food === "number" &&
            Number.isInteger(game.food) &&
            game.food >= 0 &&
            game.food < size &&
            !game.body.includes(game.food))
      );
    }
    case "2048":
      return (
        Number.isSafeInteger(game.score) &&
        game.score >= 0 &&
        Array.isArray(game.tiles) &&
        game.tiles.length === 16 &&
        game.tiles.some(Boolean) &&
        game.tiles.every(
          (v) =>
            v === 0 ||
            (Number.isSafeInteger(v) &&
              v >= 2 &&
              Number.isInteger(Math.log2(v))),
        )
      );
  }
}

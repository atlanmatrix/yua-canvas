import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Bomb,
  Worm,
  Grid2X2,
  Flag,
  RotateCcw,
  Play,
  Pause,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowRight,
} from "lucide-react";
import { t as tr, usePreferences } from "./i18n";
import { TOOL_NAMES } from "./tools";
import {
  directions,
  flagCell,
  mineNumber,
  mineStatus,
  moveTiles,
  newGame,
  revealCell,
  tickSnake,
  tilesStuck,
  turnSnake,
  validGame,
  MINE_COUNT,
  MINE_SIDE,
  SNAKE_SIDE,
  type Direction,
  type Game,
  type GameKind,
  type Mines,
  type Snake,
  type Tiles,
} from "./relaxGames";
import "./relax.css";

export const GAME_ICONS = { minesweeper: Bomb, snake: Worm, "2048": Grid2X2 };
const arrows = {
  left: ArrowLeft,
  up: ArrowUp,
  down: ArrowDown,
  right: ArrowRight,
};
const directionLabels = {
  left: "向左",
  up: "向上",
  down: "向下",
  right: "向右",
};
const keys: Record<string, Direction | undefined> = {
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowRight: "right",
  a: "left",
  w: "up",
  s: "down",
  d: "right",
};

function Minefield({
  game,
  marking,
  play,
}: {
  game: Mines;
  marking: boolean;
  play?: (game: Mines) => void;
}) {
  const status = mineStatus(game);
  const [focused, setFocused] = useState(0);
  return (
    <div className="relax-board minefield" role="group" aria-label={tr("雷区")}>
      {Array.from({ length: MINE_SIDE ** 2 }, (_, i) => {
        const open = game.open.includes(i),
          flagged = game.flags.includes(i);
        const mine = status !== "playing" && game.mines.includes(i);
        const number = open && !mine ? mineNumber(game, i) : 0;
        const label = mine
          ? tr("地雷")
          : flagged
            ? tr("已插旗")
            : open
              ? String(number)
              : tr("未翻开");
        const content = mine ? <Bomb /> : flagged ? <Flag /> : number || "";
        const cellProps = {
          className: "mine-cell",
          "aria-label": tr(
            "第 {0} 行，第 {1} 列，{2}",
            Math.floor(i / MINE_SIDE) + 1,
            (i % MINE_SIDE) + 1,
            label,
          ),
          "data-open": open || undefined,
          "data-number": number || undefined,
          "data-mine": mine || undefined,
          "data-flag": flagged || undefined,
        };
        if (!play)
          return (
            <span key={i} {...cellProps}>
              {content}
            </span>
          );
        return (
          <button
            {...cellProps}
            key={i}
            type="button"
            tabIndex={focused === i ? 0 : -1}
            onFocus={() => setFocused(i)}
            onClick={() =>
              play(marking ? flagCell(game, i) : revealCell(game, i))
            }
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              play(flagCell(game, i));
            }}
            onKeyDown={(e) => {
              const offset = {
                ArrowUp: -MINE_SIDE,
                ArrowDown: MINE_SIDE,
                ArrowLeft: -1,
                ArrowRight: 1,
              }[e.key];
              if (offset) {
                e.preventDefault();
                const buttons = e.currentTarget.parentElement!.children;
                (buttons[i + offset] as HTMLButtonElement | undefined)?.focus({
                  preventScroll: true,
                });
              }
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
function SnakeBoard({ game }: { game: Snake }) {
  const coords = (cell: number) => ({
    x: cell % SNAKE_SIDE,
    y: Math.floor(cell / SNAKE_SIDE),
  });
  const head = coords(game.body[0]);
  const angle = { right: 0, down: 90, left: 180, up: 270 }[game.direction];
  return (
    <svg
      className="relax-board snake-board"
      viewBox={`0 0 ${SNAKE_SIDE} ${SNAKE_SIDE}`}
      role="img"
      aria-label={tr("贪吃蛇棋盘")}
    >
      {game.body.map((cell, i) => {
        const { x, y } = coords(cell);
        return (
          <rect
            key={cell}
            className={i === 0 ? "snake-head" : "snake-segment"}
            x={x + 0.05}
            y={y + 0.05}
            width=".9"
            height=".9"
            rx={i === 0 ? ".32" : ".2"}
          />
        );
      })}
      <g
        fill="#f0f7e5"
        transform={`translate(${head.x + 0.5} ${head.y + 0.5}) rotate(${angle})`}
      >
        <circle cx=".19" cy="-.19" r=".085" />
        <circle cx=".19" cy=".19" r=".085" />
      </g>
      {game.food !== null && (
        <circle
          className="snake-food"
          cx={coords(game.food).x + 0.5}
          cy={coords(game.food).y + 0.5}
          r=".36"
        />
      )}
    </svg>
  );
}
function TileBoard({ game }: { game: Tiles }) {
  return (
    <div
      className="relax-board tile-board"
      role="group"
      aria-label={tr("2048 棋盘")}
    >
      {game.tiles.map((v, i) => (
        <span key={i} data-power={v ? Math.min(11, Math.log2(v)) : 0}>
          {v || ""}
        </span>
      ))}
    </div>
  );
}

export function GameCard({
  kind,
  text,
  onChange,
}: {
  kind: GameKind;
  text: string;
  onChange?: (text: string) => void;
}) {
  usePreferences();
  const game = useMemo(() => {
    try {
      const value = JSON.parse(text);
      if (validGame(kind, value)) return value;
    } catch {
      /* A damaged local save can be restarted from this card. */
    }
  }, [kind, text]);
  const [active, setActive] = useState(false);
  const [marking, setMarking] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const commit = (next: Game) => {
    if (next !== game) onChange?.(JSON.stringify(next));
  };
  const running =
    !!onChange && active && game?.kind === "snake" && game.status === "playing";
  const tick = useEffectEvent(() => {
    if (game?.kind !== "snake" || !running) return;
    const next = tickSnake(game);
    if (next.status !== "playing") setActive(false);
    commit(next);
  });
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(tick, 230);
    const pause = () => setActive(false);
    const visibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [running]);
  const toggleSnake = () => {
    if (
      game?.kind !== "snake" ||
      game.status === "won" ||
      game.status === "lost"
    )
      return;
    if (game.status === "ready") commit({ ...game, status: "playing" });
    setActive(!running);
  };
  const move = (direction: Direction) => {
    if (game?.kind === "2048") commit(moveTiles(game, direction));
    if (game?.kind === "snake" && running) commit(turnSnake(game, direction));
  };
  const keyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" || !onChange || e.metaKey || e.ctrlKey || e.altKey)
      return;
    e.stopPropagation();
    if (keys[e.key] && game?.kind !== "minesweeper") {
      e.preventDefault();
      move(keys[e.key]!);
    } else if (
      e.key === " " &&
      e.target === body.current &&
      game?.kind === "snake"
    ) {
      e.preventDefault();
      if (!e.repeat) toggleSnake();
    }
  };
  const restart = () => {
    setActive(false);
    setMarking(false);
    commit(newGame(kind));
    body.current?.focus({ preventScroll: true });
  };
  const Icon = GAME_ICONS[kind];
  const title = tr(TOOL_NAMES[kind]);
  let metric = "",
    message = "";
  if (game?.kind === "minesweeper") {
    metric = tr("剩余雷数 {0}", MINE_COUNT - game.flags.length);
    const status = mineStatus(game);
    message = tr(
      status === "lost"
        ? "踩到地雷了"
        : status === "won"
          ? "雷区已清空！"
          : "点击翻格，右键或切换插旗模式标记地雷",
    );
  } else if (game?.kind === "snake") {
    metric = tr("得分 {0}", game.body.length - 3);
    message = tr(
      game.status === "won"
        ? "已填满棋盘！"
        : game.status === "lost"
          ? "游戏结束"
          : game.status === "playing" && !running
            ? "已暂停"
            : "用方向键或滑动转向，吃到食物后变长",
    );
  } else if (game?.kind === "2048") {
    metric = tr("得分 {0}", game.score);
    message = tr(
      tilesStuck(game)
        ? "没有可移动的方块了"
        : game.tiles.some((v) => v >= 2048)
          ? "已合成 2048！可以继续挑战"
          : "方向键或滑动移动方块，合并相同数字",
    );
  } else message = tr("无法读取游戏存档");
  const snakeFinished =
    game?.kind === "snake" && (game.status === "lost" || game.status === "won");
  return (
    <section className={`relax-game relax-${kind}`} aria-label={title}>
      <header className="relax-heading">
        <span className="relax-icon">
          <Icon size={18} />
        </span>
        <strong>{title}</strong>
        <span className="relax-score">{metric}</span>
      </header>
      <div
        className="relax-body"
        ref={body}
        tabIndex={onChange ? 0 : -1}
        onPointerDown={(e) => {
          if (onChange) e.stopPropagation();
        }}
        onClick={(e) => {
          if (onChange) e.stopPropagation();
        }}
        onDoubleClick={(e) => {
          if (onChange) e.stopPropagation();
        }}
        onKeyDown={keyDown}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setActive(false);
        }}
      >
        <div
          className="relax-playfield"
          onPointerDown={(e) => {
            if (
              !onChange ||
              kind === "minesweeper" ||
              e.button !== 0 ||
              !e.isPrimary
            )
              return;
            body.current?.focus({ preventScroll: true });
            swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            swipe.current = null;
          }}
          onPointerUp={(e) => {
            const start = swipe.current;
            if (start?.id !== e.pointerId) return;
            swipe.current = null;
            const dx = e.clientX - start.x,
              dy = e.clientY - start.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
            move(
              Math.abs(dx) > Math.abs(dy)
                ? dx > 0
                  ? "right"
                  : "left"
                : dy > 0
                  ? "down"
                  : "up",
            );
          }}
        >
          {game?.kind === "minesweeper" && (
            <Minefield
              game={game}
              marking={marking}
              play={onChange ? commit : undefined}
            />
          )}
          {game?.kind === "snake" && <SnakeBoard game={game} />}
          {game?.kind === "2048" && <TileBoard game={game} />}
        </div>
        <div className="relax-message" role="status">
          {message}
        </div>
        {onChange && (
          <div className="relax-controls">
            {game?.kind === "minesweeper" && (
              <button
                type="button"
                aria-pressed={marking}
                onClick={() => setMarking(!marking)}
              >
                <Flag size={15} />
                {tr("插旗模式")}
              </button>
            )}
            {game?.kind === "snake" && !snakeFinished && (
              <button type="button" onClick={toggleSnake}>
                {running ? <Pause size={15} /> : <Play size={15} />}
                {tr(
                  running ? "暂停" : game.status === "ready" ? "开始" : "继续",
                )}
              </button>
            )}
            {game && game.kind !== "minesweeper" && (
              <div className="relax-directions">
                {directions.map((direction) => {
                  const Arrow = arrows[direction],
                    label = tr(directionLabels[direction]);
                  return (
                    <button
                      type="button"
                      key={direction}
                      aria-label={label}
                      title={label}
                      disabled={game.kind === "snake" && !running}
                      onClick={() => move(direction)}
                    >
                      <Arrow size={15} />
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              className="relax-restart"
              aria-label={tr("重新开始")}
              title={tr("重新开始")}
              onClick={restart}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

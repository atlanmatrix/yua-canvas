import { pruneConnections } from "./connections";
import { updateGroupMembership } from "./geometry";
import { useRef, useState } from "react";
import { emptyBoard, type Board } from "./storage";
function normalize(board: Board, previous?: Board, layout = false): Board {
  let next = board;
  const cards = board.cards.map((card) => {
    if (card.kind !== "canvas" || !card.canvas) return card;
    const prior = previous?.cards.find((c) => c.id === card.id)?.canvas;
    if (prior === card.canvas) return card;
    const canvas = normalize(card.canvas, prior, layout && !!prior);
    return canvas === card.canvas ? card : { ...card, canvas };
  });
  if (cards.some((card, i) => card !== board.cards[i]))
    next = { ...board, cards };
  next = pruneConnections(next);
  return layout ? updateGroupMembership(next, previous) : next;
}
export function useBoardHistory() {
  const [board, setState] = useState<Board>(emptyBoard);
  const current = useRef(board),
    past = useRef<Board[]>([]),
    future = useRef<Board[]>([]),
    transaction = useRef<Board | null>(null);
  const push = (b: Board) => {
    past.current = [...past.current.slice(-99), b];
    future.current = [];
  };
  const setBoard = (
    action: Board | ((b: Board) => Board),
    options?: { preserveLayout?: boolean },
  ) => {
    const previous = current.current,
      raw = typeof action === "function" ? action(previous) : action,
      next = normalize(
        raw,
        previous,
        !transaction.current && !options?.preserveLayout,
      );
    if (next === previous) return;
    if (!transaction.current) push(previous);
    current.current = next;
    setState(next);
  };
  const begin = () => {
    if (!transaction.current) transaction.current = current.current;
  };
  const end = () => {
    if (transaction.current) {
      current.current = normalize(current.current, transaction.current, true);
      setState(current.current);
    }
    const start = transaction.current;
    transaction.current = null;
    if (start && start !== current.current) push(start);
  };
  const cancel = () => {
    if (!transaction.current) return;
    current.current = transaction.current;
    transaction.current = null;
    setState(current.current);
  };
  const reset = (raw: Board) => {
    const b = normalize(raw);
    past.current = [];
    future.current = [];
    transaction.current = null;
    current.current = b;
    setState(b);
  };
  const undo = () => {
    end();
    const b = past.current.pop();
    if (b) {
      future.current.push(current.current);
      current.current = b;
      setState(b);
    }
  };
  const redo = () => {
    end();
    const b = future.current.pop();
    if (b) {
      past.current.push(current.current);
      current.current = b;
      setState(b);
    }
  };
  return { board, setBoard, reset, begin, end, undo, redo, cancel };
}

import { pruneConnections } from "./connections";
import { updateGroupMembership } from "./geometry";
import { useRef, useState } from "react";
import { emptyBoard, type Board } from "./storage";
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
      raw = pruneConnections(
        typeof action === "function" ? action(previous) : action,
      ),
      next =
        transaction.current || options?.preserveLayout
          ? raw
          : updateGroupMembership(raw, previous);
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
      current.current = updateGroupMembership(
        current.current,
        transaction.current,
      );
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
    const b = pruneConnections(raw);
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

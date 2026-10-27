import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBoardHistory } from "./history";
import {
  type Board,
  type View,
  type Navigation,
  type Card,
  validView,
} from "./storage";
export const DEFAULT_VIEW: View = { x: 65, y: 55, z: 1 };
export const newBoard = (): Board => ({
  version: 1,
  id: crypto.randomUUID(),
  cards: [],
  groups: [],
});
export const canvasCard = (
  canvas: Board,
  title = "子画布",
  point = { x: 80, y: 100 },
): Card => ({
  id: crypto.randomUUID(),
  kind: "canvas",
  title,
  text: "",
  color: "#ffffff",
  width: 240,
  height: 180,
  ...point,
  canvas,
});
export function locateBoard(root: Board, path: string[]) {
  let board = root;
  const valid: string[] = [],
    names: string[] = [];
  for (const id of path) {
    const card = board.cards.find(
      (c) => c.id === id && c.kind === "canvas" && c.canvas,
    );
    if (!card?.canvas) break;
    valid.push(id);
    names.push(card.title || "子画布");
    board = card.canvas;
  }
  return { board, path: valid, names };
}
export function replaceBoard(
  root: Board,
  path: string[],
  update: (board: Board) => Board,
): Board {
  if (!path.length) return update(root);
  const [id, ...rest] = path;
  const card = root.cards.find((c) => c.id === id && c.kind === "canvas");
  if (!card?.canvas) return root;
  const canvas = replaceBoard(card.canvas, rest, update);
  return canvas === card.canvas
    ? root
    : {
        ...root,
        cards: root.cards.map((c) => (c === card ? { ...c, canvas } : c)),
      };
}
export function findBoardPath(
  root: Board,
  key: string,
  path: string[] = [],
): string[] | undefined {
  if ((root.id || "") === key) return path;
  for (const card of root.cards)
    if (card.canvas) {
      const found = findBoardPath(card.canvas, key, [...path, card.id]);
      if (found) return found;
    }
}
function importedContent(board: Board, id?: string): Board {
  return {
    ...board,
    id,
    cards: board.cards.map((card) =>
      card.canvas
        ? { ...card, canvas: importedContent(card.canvas, crypto.randomUUID()) }
        : card,
    ),
  };
}
const savedView = (views: Record<string, View>, key: string) =>
  validView(views[key]) ? views[key] : DEFAULT_VIEW;
export function useCanvasWorkspace() {
  const history = useBoardHistory();
  const [path, setPath] = useState<string[]>([]),
    [views, setViews] = useState<Record<string, View>>({}),
    [view, setView] = useState<View>(DEFAULT_VIEW);
  const active = locateBoard(history.board, path),
    key = active.board.id || "",
    previous = useRef(key);
  const pathKey = JSON.stringify(active.path);
  const navigation = useMemo<Navigation>(
    () => ({ path: active.path, views: { ...views, [key]: view } }),
    [pathKey, views, key, view],
  );
  useLayoutEffect(() => {
    if (previous.current !== key) {
      const prior = previous.current;
      previous.current = key;
      setViews((v) => ({ ...v, [prior]: view }));
      setView(savedView(views, key));
    }
    if (JSON.stringify(path) !== pathKey) setPath(active.path);
  }, [key, pathKey]);
  const activate = (root: Board, nextPath: string[]) => {
    const next = locateBoard(root, nextPath),
      nextKey = next.board.id || "";
    setViews((v) => ({ ...v, [key]: view }));
    setPath(next.path);
    if (nextKey !== key) setView(savedView(views, nextKey));
    previous.current = nextKey;
  };
  const setBoard = (
    action: Board | ((board: Board) => Board),
    options?: { preserveLayout?: boolean },
  ) =>
    history.setBoard((root) => {
      const target = findBoardPath(root, key);
      return target
        ? replaceBoard(root, target, (b) =>
            typeof action === "function"
              ? action(b)
              : {
                  ...importedContent(action, b.id),
                  ...(b.parentCreated ? { parentCreated: true } : {}),
                },
          )
        : root;
    }, options);
  const canCreateParent = !active.path.length && !history.board.parentCreated;
  const wrapParent = () => {
    if (!canCreateParent) return;
    const parent = { ...newBoard(), parentCreated: true };
    let updated = history.board;
    history.setBoard((root) => {
      const current = locateBoard(root, active.path);
      parent.cards = [
        canvasCard(current.board, current.names.at(-1) || "画布"),
      ];
      updated = replaceBoard(root, current.path, () => parent);
      if (current.path.length)
        updated = replaceBoard(updated, current.path.slice(0, -1), (b) => ({
          ...b,
          cards: b.cards.map((c) =>
            c.id === current.path.at(-1) ? { ...c, title: "父画布" } : c,
          ),
        }));
      return updated;
    });
    activate(updated, active.path);
  };
  const restore = (
    root: Board,
    savedView?: View,
    savedNavigation?: Navigation,
  ) => {
    history.reset(root);
    const current = locateBoard(root, savedNavigation?.path || []),
      currentKey = current.board.id || "";
    setPath(current.path);
    setViews(savedNavigation?.views || {});
    setView(
      (JSON.stringify(current.path) ===
      JSON.stringify(savedNavigation?.path || [])
        ? savedView
        : undefined) ||
        savedNavigation?.views[currentKey] ||
        DEFAULT_VIEW,
    );
    previous.current = currentKey;
  };
  return {
    ...history,
    root: history.board,
    board: active.board,
    path: active.path,
    names: active.names,
    view,
    setView,
    navigation,
    setBoard,
    restore,
    navigate: (next: string[]) => activate(history.board, next),
    wrapParent,
    canCreateParent,
    updateRoot: history.setBoard,
  };
}

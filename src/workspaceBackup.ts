import {
  importBoard,
  serializeBoard,
  validView,
  type Board,
  type Navigation,
  type View,
} from "./storage";
import { locateBoard } from "./workspace";

export type WorkspaceSnapshot = {
  board: Board;
  view: View;
  navigation: Navigation;
};
export type CanvasImport = {
  board: Board;
  workspace?: Omit<WorkspaceSnapshot, "board">;
};
const FORMAT = "yua-canvas-workspace";

export async function exportWorkspace({
  board,
  view,
  navigation,
}: WorkspaceSnapshot) {
  return JSON.stringify(
    {
      ...(await serializeBoard(board)),
      format: FORMAT,
      workspace: { version: 1, view, navigation },
    },
    null,
    2,
  );
}

export async function readCanvasImport(raw: string): Promise<CanvasImport> {
  const data = JSON.parse(raw);
  if (data?.format !== undefined && data.format !== FORMAT)
    throw Error("不支持的工作区备份格式");
  const board = await importBoard(raw);
  if (data.format !== FORMAT) return { board };
  const state = data.workspace;
  if (!state || state.version !== 1 || !validView(state.view))
    throw Error("工作区视图数据无效");
  const navigation = state.navigation;
  if (
    !navigation ||
    !Array.isArray(navigation.path) ||
    !navigation.path.every((id: unknown) => typeof id === "string") ||
    !navigation.views ||
    typeof navigation.views !== "object" ||
    Array.isArray(navigation.views)
  )
    throw Error("工作区导航数据无效");
  if (
    locateBoard(board, navigation.path).path.length !== navigation.path.length
  )
    throw Error("工作区导航引用了不存在的画布");
  const views: Record<string, View> = Object.create(null);
  for (const [id, view] of Object.entries(navigation.views)) {
    if (!validView(view)) throw Error("工作区画布视图无效");
    views[id] = { x: view.x, y: view.y, z: view.z };
  }
  const view = { x: state.view.x, y: state.view.y, z: state.view.z };
  const active = locateBoard(board, navigation.path).board;
  views[active.id || ""] = view;
  return {
    board,
    workspace: { view, navigation: { path: [...navigation.path], views } },
  };
}

export function workspaceCounts(board: Board): {
  canvases: number;
  components: number;
} {
  return board.cards.reduce(
    (counts, card) => {
      if (card.kind === "canvas" && card.canvas) {
        const child = workspaceCounts(card.canvas);
        counts.canvases += child.canvases;
        counts.components += child.components;
      }
      counts.components++;
      return counts;
    },
    { canvases: 1, components: 0 },
  );
}

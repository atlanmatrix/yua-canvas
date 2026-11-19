import { validPresentation, type TextStyle } from "./presentation";

export type MindNode = {
  id: string;
  text: string;
  children: MindNode[];
  style?: TextStyle;
  fill?: string;
  border?: string;
  // A checked branch overrides its descendants without erasing their previous choices.
  checked?: boolean;
};
export type MindMapData = {
  root: MindNode;
  view: "map" | "table";
  checkboxes: boolean;
};
export const newMindNode = (text: string): MindNode => ({
  id: crypto.randomUUID(),
  text,
  children: [],
});
export const newMindMap = (): MindMapData => ({
  root: newMindNode("root"),
  view: "map",
  checkboxes: false,
});

export function parseMindMap(text: string): MindMapData {
  const map = JSON.parse(text);
  const ids = new Set<string>();
  function valid(node: MindNode): boolean {
    if (
      !node ||
      typeof node.id !== "string" ||
      !node.id ||
      ids.has(node.id) ||
      typeof node.text !== "string" ||
      !Array.isArray(node.children) ||
      (node.checked !== undefined && typeof node.checked !== "boolean") ||
      [node.fill, node.border].some(
        (c) =>
          c !== undefined &&
          (typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c)),
      ) ||
      !validPresentation({ textStyle: node.style })
    )
      return false;
    ids.add(node.id);
    return node.children.every(valid);
  }
  if (
    !map ||
    !["table", "map"].includes(map.view) ||
    typeof map.checkboxes !== "boolean" ||
    !valid(map.root)
  )
    throw Error("思维导图数据无效");
  return map;
}

export function updateMindNode(
  node: MindNode,
  id: string,
  update: (node: MindNode) => MindNode,
): MindNode {
  if (node.id === id) return update(node);
  const children = node.children.map((child) =>
    updateMindNode(child, id, update),
  );
  return children.some((child, i) => child !== node.children[i])
    ? { ...node, children }
    : node;
}

export function addMindNode(
  root: MindNode,
  id: string,
  child: MindNode,
  sibling: boolean,
) {
  const parent = sibling ? indexMindMap(root).parents.get(id)?.id : id;
  if (!parent) return root;
  return updateMindNode(root, parent, (node) => {
    const at = sibling
      ? node.children.findIndex((child) => child.id === id) + 1
      : node.children.length;
    return {
      ...node,
      children: [
        ...node.children.slice(0, at),
        child,
        ...node.children.slice(at),
      ],
    };
  });
}

type CheckState = boolean | "mixed";
type MindCell = { node: MindNode; depth: number; branch: number; span: number };
export function indexMindMap(root: MindNode) {
  const cells = new Map<string, MindCell>();
  const parents = new Map<string, MindNode>();
  const states = new Map<string, CheckState>();
  const rows: MindCell[][] = [];
  let columns = 1;
  function visit(
    node: MindNode,
    depth: number,
    branch: number,
    inherited: boolean,
  ) {
    columns = Math.max(columns, depth + 1);
    const row = rows.length;
    const full = inherited || !!node.checked;
    if (!node.children.length) rows.push([]);
    const cell = { node, depth, branch, span: 0 };
    let all = true,
      any = false;
    node.children.forEach((child, i) => {
      parents.set(child.id, node);
      visit(child, depth + 1, depth === 0 ? i : branch, full);
      const state = states.get(child.id);
      all &&= state === true;
      any ||= state !== false;
    });
    states.set(
      node.id,
      full || (node.children.length > 0 && all) || (any && "mixed"),
    );
    cell.span = rows.length - row;
    rows[row].unshift(cell);
    cells.set(node.id, cell);
  }
  visit(root, 0, 0, false);
  return { cells, parents, states, rows, columns };
}

// When editing below an overridden branch, transfer the override to its child
// branches. An untouched sibling can still restore its original selection.
export function toggleMindNode(root: MindNode, id: string): MindNode {
  const { cells, parents, states } = indexMindMap(root);
  if (!cells.has(id)) return root;
  const path = new Set([id]);
  for (let p = parents.get(id); p; p = parents.get(p.id)) path.add(p.id);
  const clear = (n: MindNode): MindNode => ({
    ...n,
    checked: false,
    children: n.children.map(clear),
  });
  function toggle(node: MindNode): MindNode {
    if (node.id === id) {
      if (states.get(id) !== true) return { ...node, checked: true };
      const restored = { ...node, checked: false };
      if (node.checked && indexMindMap(restored).states.get(id) !== true)
        return restored;
      return clear(node);
    }
    return {
      ...node,
      checked: false,
      children: node.children.map((child) => {
        const next = node.checked ? { ...child, checked: true } : child;
        return path.has(child.id) ? toggle(next) : next;
      }),
    };
  }
  return toggle(root);
}

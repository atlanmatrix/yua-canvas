import type { MindMapData, MindNode } from "./mindMapData";
import { textCss } from "./presentation";

const lightBranches = [
  // Accent, soft fill and edge. Solid fills support white branch labels.
  ["#2563eb", "#eff6ff", "#bfdbfe"],
  ["#047857", "#ecfdf5", "#a7f3d0"],
  ["#b45309", "#fffbeb", "#f5d08c"],
  ["#7c3aed", "#f5f3ff", "#ddd6fe"],
  ["#be123c", "#fff1f2", "#fecdd3"],
  ["#0e7490", "#ecfeff", "#a5f3fc"],
];
const darkBranches = [
  ["#58a6ff", "#192c42", "#35577b"],
  ["#56c676", "#1c3027", "#345d42"],
  ["#e3ac4d", "#332b20", "#695439"],
  ["#b394ff", "#2c233d", "#574371"],
  ["#f78fba", "#37252f", "#714457"],
  ["#57cdd5", "#1a3036", "#345f65"],
];
export function branchPalette(branch: number, dark: boolean) {
  return (dark ? darkBranches : lightBranches)[branch % lightBranches.length];
}

// Older maps may have explicit light or dark fills without a text override.
function textOnFill(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#000000" : "#ffffff";
}

export function mindNodeStyle(
  node: MindNode,
  depth: number,
  branch: number,
  view: MindMapData["view"],
  dark: boolean,
) {
  const level = Math.min(depth, 4);
  const [accent, tint, edge] = branchPalette(branch, dark);
  const table = view === "table";
  const rootFill = dark ? "#174c9f" : "#0f172a";
  const rootBorder = dark ? "#58a6ff" : "#334155";
  const fill = node.fill ?? [rootFill, accent, tint][depth] ?? "transparent";
  const border = node.border ?? [rootBorder, accent, edge][depth] ?? accent;
  const foreground = [
    "#ffffff",
    dark ? "#0f172a" : "#ffffff",
    dark ? "#e6edf3" : "#1e293b",
    dark ? "#e6edf3" : "#334155",
    dark ? "#b1bdcd" : "#475569",
  ][level];
  const text = {
    fontFamily: "system-ui",
    fontSize: (table ? [24, 17, 14, 13, 13] : [22, 16, 14, 13, 12])[level],
    color: node.fill ? textOnFill(node.fill) : foreground,
    bold: depth < 2,
    ...node.style,
  };
  const label = textCss(text);
  if (!table) {
    label.lineHeight = ["1.3", "1.4", "1.45", "1.5", "1.5"][level];
    if (node.style?.bold === undefined)
      label.fontWeight = [700, 600, 500, 400, 400][level];
  }
  return { accent, fill, border, text, label };
}

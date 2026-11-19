import { isTextFile } from "./clipboard";
import { addressLayout, noteCardHref, NOTE_LINK_TEXT_STYLE } from "./noteLinks";
import {
  textCss,
  textSegments,
  type TextRun,
  type TextStyle,
} from "./presentation";
import { type Board, type Card, type Rect, attachParents } from "./storage";
const textContext = document.createElement("canvas").getContext("2d")!;
textContext.font = "13px monospace";
export const TEXT_MAX_WIDTH =
  Math.ceil(textContext.measureText("0").width * 80) + 26;
export const TEXT_MAX_LINES = 20;
let scrollbar: number | undefined;
function scrollbarSize() {
  if (scrollbar !== undefined) return scrollbar;
  const element = document.createElement("div");
  element.style.cssText =
    "position:fixed;visibility:hidden;width:100px;height:100px;overflow:scroll;border:0;padding:0";
  document.body.append(element);
  scrollbar = element.offsetHeight - element.clientHeight;
  element.remove();
  return scrollbar;
}
type CardGeometry = Pick<Card, "x" | "y" | "width" | "height"> &
  Partial<
    Pick<
      Card,
      | "kind"
      | "displayMode"
      | "customSize"
      | "editableFile"
      | "previewWidth"
      | "previewHeight"
      | "mime"
      | "title"
      | "contentAspectRatio"
      | "linkDisabled"
      | "locked"
      | "masked"
      | "textRuns"
      | "textStyle"
      | "text"
      | "textMode"
      | "textAutoHeight"
    >
  >;
export const pdfGeometry = (c: Pick<CardGeometry, "kind" | "mime" | "title">) =>
  c.kind === "file" &&
  (c.mime === "application/pdf" || /\.pdf$/i.test(c.title || ""));
export function contentCardSize(c: CardGeometry) {
  const factor = pdfGeometry(c) ? 1.5 : 1;
  const width = (c.width || 240) * factor;
  return {
    width,
    height: c.contentAspectRatio
      ? width / c.contentAspectRatio
      : (c.height || 250) * factor,
  };
}
const previewTextHeights = new WeakMap<
  CardGeometry,
  { width: number; height: number }
>();
function previewTextHeight(c: CardGeometry, width: number) {
  const cached = previewTextHeights.get(c);
  if (cached?.width === width) return cached.height;
  const height = textSize(
    c.text || "",
    c.textMode,
    width,
    c.textStyle,
    c.textRuns,
  ).height;
  previewTextHeights.set(c, { width, height });
  return height;
}
export function pastedLinkWidth(text: string) {
  textContext.font = `${NOTE_LINK_TEXT_STYLE.fontSize}px system-ui`;
  // Frame border, horizontal insets, icon and the gap beside it.
  return Math.min(
    320,
    Math.ceil(textContext.measureText(text.trim()).width) +
      addressLayout.border * 2 +
      addressLayout.icon +
      addressLayout.inset +
      addressLayout.end +
      addressLayout.gap,
  );
}

// Document widths exclude the two 1px frame edges and the reading insets.
const documentLayouts = {
  medium: { contentWidth: 410, insetX: 24, insetY: 16 },
  large: { contentWidth: 820, insetX: 48, insetY: 32 },
};
export function documentLayout(c: CardGeometry) {
  if (c.kind !== "file" || pdfGeometry(c) || !isTextFile(c)) return;
  const large =
    c.displayMode === "large" ||
    (c.displayMode === "custom" && c.customSize?.base === "large");
  return documentLayouts[large ? "large" : "medium"];
}

export const cardRect = (c: CardGeometry): Rect => {
  const { width, height } = contentCardSize(c);
  if (c.kind !== "canvas" && c.displayMode === "small") {
    let width = 56;
    if (c.title && !c.masked && !c.locked) {
      textContext.font = "13px system-ui";
      width = Math.min(
        320,
        56 + Math.ceil(textContext.measureText(c.title).width),
      );
    }
    return { x: c.x, y: c.y, width, height: 56 };
  }
  if (noteCardHref(c)) {
    const previewWidth =
      c.displayMode === "medium"
        ? c.previewWidth || Math.min(width, 320)
        : c.displayMode === "custom"
          ? c.customSize?.width || width
          : width;
    const baseSize = c.textStyle?.fontSize || NOTE_LINK_TEXT_STYLE.fontSize;
    const fontSize = (c.textRuns || []).reduce(
      (max, run) => Math.max(max, run.style.fontSize || baseSize),
      baseSize,
    );
    return {
      x: c.x,
      y: c.y,
      width: Math.max(64, previewWidth),
      height:
        Math.max(addressLayout.icon, Math.ceil(fontSize * 1.5)) +
        2 * (addressLayout.inset + addressLayout.border),
    };
  }
  if (c.displayMode === "custom" && c.customSize) {
    const { width, height } = c.customSize;
    return {
      x: c.x,
      y: c.y,
      width,
      height:
        c.kind === "text" && c.textAutoHeight
          ? previewTextHeight(c, width)
          : height,
    };
  }
  const layout = documentLayout(c);
  if (
    layout &&
    !(c.displayMode === "medium" && (c.previewWidth || c.previewHeight))
  ) {
    return {
      x: c.x,
      y: c.y,
      width: layout.contentWidth + 2 * layout.insetX + 2,
      height: Math.round(layout.contentWidth * 0.75) + 2 * layout.insetY + 2,
    };
  }
  if (c.kind !== "canvas" && c.displayMode === "medium") {
    const mediumWidth = documentLayouts.medium.contentWidth;
    const scale = pdfGeometry(c)
      ? 1 / 1.5
      : Math.min(1, mediumWidth / width, (mediumWidth * 0.75) / height);
    const previewWidth =
      c.previewWidth ||
      (c.kind === "text" && c.textAutoHeight
        ? Math.min(width, mediumWidth)
        : width * scale);
    const previewHeight =
      c.kind === "text" && c.textAutoHeight && typeof c.text === "string"
        ? previewTextHeight(c, previewWidth)
        : c.previewHeight ||
          Math.max(
            c.kind === "text"
              ? 26 + Math.max(24, (c.textStyle?.fontSize || 13) * 1.5)
              : 0,
            c.contentAspectRatio
              ? previewWidth / c.contentAspectRatio
              : height * scale,
          );
    return {
      x: c.x,
      y: c.y,
      width: previewWidth,
      height: previewHeight,
    };
  }
  return { x: c.x, y: c.y, width, height };
};

// Older versions recorded a manual resize as a medium preview override.
export function savedCustomSize(card: Card) {
  if (card.customSize) return card.customSize;
  if (card.previewWidth || card.previewHeight) {
    const { width, height } = cardRect({ ...card, displayMode: "medium" });
    return { width, height };
  }
}

export function resizeRect(
  bounds: Rect,
  edge: string,
  dx: number,
  dy: number,
  proportional = false,
  minWidth = 64,
  minHeight = 32,
  maxWidth = 8000,
) {
  const horizontal = edge.includes("e") || edge.includes("w");
  const vertical = edge.includes("n") || edge.includes("s");
  let width = bounds.width + (edge.includes("w") ? -dx : horizontal ? dx : 0);
  let height = bounds.height + (edge.includes("n") ? -dy : vertical ? dy : 0);
  if (proportional) {
    const sx = width / bounds.width,
      sy = height / bounds.height;
    let scale = !horizontal
      ? sy
      : !vertical
        ? sx
        : Math.abs(sx - 1) >= Math.abs(sy - 1)
          ? sx
          : sy;
    scale = Math.max(
      Math.max(minWidth / bounds.width, minHeight / bounds.height),
      Math.min(maxWidth / bounds.width, 8000 / bounds.height, scale),
    );
    width = bounds.width * scale;
    height = bounds.height * scale;
  } else {
    if (horizontal) width = Math.max(minWidth, Math.min(maxWidth, width));
    if (vertical) height = Math.max(minHeight, Math.min(8000, height));
  }
  return {
    x: edge.includes("w")
      ? bounds.x + bounds.width - width
      : proportional && !horizontal
        ? bounds.x + (bounds.width - width) / 2
        : bounds.x,
    y: edge.includes("n")
      ? bounds.y + bounds.height - height
      : proportional && !vertical
        ? bounds.y + (bounds.height - height) / 2
        : bounds.y,
    width,
    height,
  };
}

export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width - 0.001 &&
  a.x + a.width > b.x + 0.001 &&
  a.y < b.y + b.height - 0.001 &&
  a.y + a.height > b.y + 0.001;
export const contains = (a: Rect, b: Rect) =>
  b.x >= a.x - 0.001 &&
  b.y >= a.y - 0.001 &&
  b.x + b.width <= a.x + a.width + 0.001 &&
  b.y + b.height <= a.y + a.height + 0.001;
export function textSize(
  text: string,
  mode: "wrap" | "scroll" = "wrap",
  requestedWidth = TEXT_MAX_WIDTH,
  style?: TextStyle,
  runs?: TextRun[],
) {
  const css = textCss(style);
  textContext.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize}px ${css.fontFamily}`;
  const ctx = textContext,
    inset = 26;
  const width = Math.max(64, Math.min(TEXT_MAX_WIDTH, requestedWidth));
  const contentWidth = width - inset;
  let used = 0,
    longest = 0,
    row = 1,
    height = 0;
  let rowHeight = parseFloat(css.lineHeight);
  const nextRow = () => {
    if (row <= TEXT_MAX_LINES) height += rowHeight;
    row++;
    used = 0;
    rowHeight = parseFloat(css.lineHeight);
  };
  for (const segment of textSegments(text, runs, style)) {
    const font = textCss(segment.style);
    ctx.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`;
    const advances = new Map<string, number>();
    const tab = ctx.measureText("0").width * 4;
    for (const character of segment.text) {
      if (character === "\n") {
        nextRow();
        continue;
      }
      let advance = advances.get(character);
      if (advance === undefined) {
        advance = ctx.measureText(character).width;
        advances.set(character, advance);
      }
      if (character === "\t") advance = tab - (used % tab);
      if (mode === "wrap" && used && used + advance > contentWidth) nextRow();
      used += advance;
      rowHeight = Math.max(rowHeight, parseFloat(font.lineHeight));
      longest = Math.max(used, longest);
    }
  }
  if (row <= TEXT_MAX_LINES) height += rowHeight;
  const horizontal =
    mode === "scroll" &&
    longest > contentWidth - (row > TEXT_MAX_LINES ? scrollbarSize() : 0);
  return { width, height: height + inset + (horizontal ? scrollbarSize() : 0) };
}

export function settleGroups(board: Board, moved: string[]): Board {
  if (!board.groups.length) return board;
  let groups = board.groups.map((g) => ({
    ...g,
    bounds: g.bounds ? { ...g.bounds } : undefined,
  }));
  const expand = (id: string, rect: Rect) => {
    const g = groups.find((g) => g.id === id);
    if (g?.bounds && !contains(g.bounds, rect)) {
      const b = g.bounds;
      const x = Math.min(b.x, rect.x - 20),
        y = Math.min(b.y, rect.y - 45);
      g.bounds = {
        x,
        y,
        width: Math.max(b.x + b.width, rect.x + rect.width + 20) - x,
        height: Math.max(b.y + b.height, rect.y + rect.height + 20) - y,
      };
    }
  };
  const cards = board.cards.map((c) => {
    if (!moved.includes(c.id)) return c;
    const rect = cardRect(c),
      old = groups.find((g) => g.id === c.group);
    const target =
      old?.bounds && overlaps(old.bounds, rect)
        ? old
        : groups
            .filter((g) => g.bounds && overlaps(g.bounds, rect))
            .sort(
              (a, b) =>
                a.bounds!.width * a.bounds!.height -
                b.bounds!.width * b.bounds!.height,
            )[0];
    if (target) {
      expand(target.id, rect);
      return { ...c, group: target.id };
    }
    return { ...c, group: undefined };
  });
  // Retain a child's parent while their frames still intersect. Repeated passes
  // propagate growth through all ancestor levels without moving any content.
  for (let pass = 0; pass < groups.length; pass++) {
    let changed = false;
    for (const g of groups) {
      const parent = groups.find((p) => p.id === g.parent);
      if (
        g.bounds &&
        parent?.bounds &&
        overlaps(g.bounds, parent.bounds) &&
        !contains(parent.bounds, g.bounds)
      ) {
        expand(parent.id, g.bounds);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { ...board, cards, groups: attachParents(groups) };
}
export function updateGroupMembership(board: Board, previous?: Board): Board {
  const old = new Map(previous?.cards.map((c) => [c.id, c]) || []);
  const changed = board.cards.filter((c) => {
    const p = old.get(c.id);
    return (
      !p ||
      c.x !== p.x ||
      c.y !== p.y ||
      cardRect(c).width !== cardRect(p).width ||
      cardRect(c).height !== cardRect(p).height
    );
  });
  if (!changed.length) return board;
  return settleGroups(
    board,
    changed.map((c) => c.id),
  );
}

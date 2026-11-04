import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { type Board, type Card, groupDepth } from "./storage";
import type { CSSProperties } from "react";
import { Folder, PanelsTopLeft, ListTodo, FileText } from "./icons";
import { cardRect } from "./geometry";
import { strokeBounds, surfaceColor, customColor } from "./presentation";
import {
  curve,
  curveMidpoint,
  curveBounds,
  endpointPoint,
} from "./connections";
import { ConnectionArrow } from "./ConnectionArrow";
import { StrokeView } from "./PaintLayer";
import {
  PreviewFrame,
  StaticContent,
  TypeIcon,
  Mask,
  Remark,
  GroupList,
  groupCards,
  groupFrame,
  presentationHidden,
} from "./CardPresentation";
import { ExportPreviewContext } from "./ExportPreviewContext";
import { readPreviewText } from "./previewCache";
import { isTextFile, isMarkdownFile, isPdfFile } from "./clipboard";
import { t as tr } from "./i18n";

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function ExportContent({ card }: { card: Card }) {
  if (card.kind === "canvas")
    return (
      <>
        <svg className="canvas-card-inner-border">
          <rect x="0.5" y="0.5" rx="10" />
        </svg>
        <div className="canvas-card-preview">
          <button>
            <PanelsTopLeft size={36} />
          </button>
        </div>
        <div className="attachment-title">
          <PanelsTopLeft size={16} />
          <span>{card.title || tr("子画布")}</span>
        </div>
      </>
    );
  const header =
    card.kind === "todo" ||
    (card.kind === "file" && !isTextFile(card) && !isPdfFile(card));
  return (
    <>
      {header && (
        <div className="card-top">
          <span>
            {card.kind === "todo" ? (
              <ListTodo size={13} />
            ) : (
              <FileText size={13} />
            )}{" "}
            {card.kind === "todo" ? "TODO" : "FILE"}
          </span>
        </div>
      )}
      <StaticContent card={card} />
    </>
  );
}

/** A frozen, readonly scene: never mounts agent settings, live embeds or selection UI. */
export async function exportPng(board: Board): Promise<Blob> {
  const cards = board.cards.filter((c) => !presentationHidden(board, c.group));
  const groups = board.groups
    .filter((g) => g.bounds && !presentationHidden(board, g.parent))
    .sort(
      (a, b) => groupDepth(board.groups, a.id) - groupDepth(board.groups, b.id),
    );
  const previews = new Map(cards.map((card) => [card.id, card]));
  for (const group of groups) {
    if (group.masked || group.displayMode !== "list") continue;
    const children = groupCards(board, group.id);
    const active =
      children.find((card) => card.id === group.activeCard) || children[0];
    if (active) previews.set(active.id, active);
  }
  const edges = (board.connections || []).filter((c) =>
    [c.from.card, c.to.card].every((id) =>
      cards.some((card) => card.id === id),
    ),
  );
  const rects = [
    ...cards.map(cardRect),
    ...groups.map(groupFrame),
    ...strokeBounds(board.strokesHidden ? [] : board.strokes),
  ];
  if (!rects.length) throw new Error(tr("没有可导出的内容"));
  // A Bezier stays inside its control hull, including reversed endpoints.
  for (const edge of edges) {
    const a = endpointPoint(edge.from, cards),
      b = endpointPoint(edge.to, cards);
    rects.push(curveBounds(a, b, edge.from.side, edge.to.side));
  }
  const x = Math.min(...rects.map((r) => r.x)) - 32;
  const y = Math.min(...rects.map((r) => r.y)) - 40;
  let width = Math.ceil(Math.max(...rects.map((r) => r.x + r.width)) - x + 32);
  let height = Math.ceil(
    Math.max(...rects.map((r) => r.y + r.height)) - y + 32,
  );
  const host = document.createElement("div");
  host.inert = true;
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;";
  document.body.append(host);
  const root = createRoot(host);
  try {
    await Promise.all(
      [...previews.values()]
        .filter((c) => !c.masked && c.blob && isTextFile(c))
        .map((c) =>
          readPreviewText(c.blob!, isMarkdownFile(c) ? c.blob!.size : 65536),
        ),
    );
    const pixelRatio = Math.min(
      2,
      8192 / width,
      8192 / height,
      Math.sqrt(16_000_000 / (width * height)),
    );
    const arrow = `export-arrow-${crypto.randomUUID()}`;
    flushSync(() =>
      root.render(
        <ExportPreviewContext.Provider value={pixelRatio}>
          <div
            className="png-export"
            style={{
              position: "relative",
              width,
              height,
              overflow: "hidden",
              background: "var(--canvas-bg)",
              color: "var(--ink)",
            }}
          >
            <div style={{ position: "absolute", left: -x, top: -y }}>
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="group-boundary"
                  style={{
                    position: "absolute",
                    left: groupFrame(g).x,
                    top: groupFrame(g).y,
                    width: groupFrame(g).width,
                    height: groupFrame(g).height,
                    background: g.color,
                    ...({ "--group-header-color": g.color } as CSSProperties),
                    pointerEvents: "none",
                  }}
                >
                  <button className="group-title">
                    <Folder size={14} />
                    {g.masked ? tr("已遮罩") : g.name}
                  </button>
                  {g.masked ? (
                    <Mask />
                  ) : g.displayMode === "list" ? (
                    <GroupList group={g} cards={groupCards(board, g.id)} />
                  ) : null}
                  {!g.masked && <Remark text={g.remark} />}
                </div>
              ))}
              <svg
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  overflow: "visible",
                }}
              >
                <defs>
                  <ConnectionArrow
                    id={arrow}
                    size={8}
                    color="var(--connection-color)"
                  />
                </defs>
                <StrokeView
                  strokes={board.strokesHidden ? [] : board.strokes}
                />
                {edges.map((c) => {
                  const a = endpointPoint(c.from, cards),
                    b = endpointPoint(c.to, cards),
                    mid = curveMidpoint(a, b, c.from.side, c.to.side);
                  return (
                    <g key={c.id}>
                      <path
                        d={curve(a, b, c.from.side, c.to.side)}
                        stroke="var(--connection-color)"
                        strokeWidth={2}
                        fill="none"
                        markerEnd={`url(#${arrow})`}
                      />
                      {c.label && (
                        <text
                          x={mid.x}
                          y={mid.y - 8}
                          textAnchor="middle"
                          fill="currentColor"
                          fontSize={12}
                        >
                          {c.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              {cards.map((c) => {
                const r = cardRect(c);
                return (
                  <div
                    key={c.id}
                    className={`card card-${c.kind}`}
                    data-custom-color={customColor(c.color)}
                    style={{
                      position: "absolute",
                      left: r.x,
                      top: r.y,
                      width: r.width,
                      height: r.height,
                      background:
                        c.kind === "miniature"
                          ? "transparent"
                          : surfaceColor(c.color),
                      transform: "none",
                    }}
                  >
                    {c.masked ? (
                      <Mask />
                    ) : c.kind !== "canvas" && c.displayMode === "small" ? (
                      <TypeIcon card={c} />
                    ) : (
                      <PreviewFrame card={c}>
                        <ExportContent card={c} />
                      </PreviewFrame>
                    )}
                    {!c.masked && <Remark text={c.remark} />}
                  </div>
                );
              })}
            </div>
          </div>
        </ExportPreviewContext.Provider>,
      ),
    );
    const scene = host.firstElementChild as HTMLElement;
    await frame();
    await frame();
    // Wait for asynchronous PDF/diagram previews instead of exporting placeholders.
    const deadline = performance.now() + 30000;
    while (
      scene.querySelector(
        '.pdf-preview[aria-busy="true"],[data-diagram-state="loading"],[data-file-preview-state="loading"]',
      )
    ) {
      if (performance.now() > deadline)
        throw new Error(tr("预览尚未完成，请稍后重试导出"));
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    await document.fonts.ready;
    await Promise.all(
      [...scene.querySelectorAll("img")].map((img) =>
        img.decode().catch(() => {}),
      ),
    );
    // Remarks and long edge labels can extend beyond their component frames.
    const bounds = scene.getBoundingClientRect();
    let left = 0,
      top = 0,
      right = width,
      bottom = height;
    for (const annotation of scene.querySelectorAll(
      ".component-remark,svg text",
    )) {
      const r = annotation.getBoundingClientRect();
      left = Math.min(left, r.left - bounds.left - 24);
      top = Math.min(top, r.top - bounds.top - 24);
      right = Math.max(right, r.right - bounds.left + 24);
      bottom = Math.max(bottom, r.bottom - bounds.top + 24);
    }
    width = Math.ceil(right - left);
    height = Math.ceil(bottom - top);
    const world = scene.firstElementChild as HTMLElement;
    world.style.left = `${-x - left}px`;
    world.style.top = `${-y - top}px`;
    scene.style.width = `${width}px`;
    scene.style.height = `${height}px`;
    const ratio = Math.min(
      pixelRatio,
      8192 / width,
      8192 / height,
      Math.sqrt(16_000_000 / (width * height)),
    );
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(scene, {
      pixelRatio: ratio,
      skipFonts: true,
      filter: (node) =>
        !(node instanceof Element && node.matches(".pdf-navigation")),
    });
    if (!blob) throw new Error(tr("导出失败，请重试"));
    return blob;
  } finally {
    root.unmount();
    host.remove();
  }
}

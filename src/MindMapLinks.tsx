import { useLayoutEffect, useRef, useState } from "react";
import type { indexMindMap } from "./mindMapData";
import { branchPalette } from "./mindMapStyle";
import { curve, curveMidpoint } from "./connections";
import { t as tr } from "./i18n";

// Layout coordinates are independent of camera zoom and preview scaling.
function bounds(node: HTMLElement, tree: HTMLElement) {
  let x = 0,
    y = 0;
  for (
    let el: HTMLElement | null = node;
    el && el !== tree;
    el = el.offsetParent as HTMLElement | null
  ) {
    x += el.offsetLeft;
    y += el.offsetTop;
  }
  return {
    x,
    y,
    right: x + node.offsetWidth,
    bottom: y + node.offsetHeight,
    anchorY:
      y +
      (node.dataset.depth === "3"
        ? node.offsetHeight - 0.75
        : node.offsetHeight / 2),
  };
}
type MapIndex = ReturnType<typeof indexMindMap>;
type Edge = { id: string; d: string; x: number; y: number };
export function MindMapLinks({
  parents,
  cells,
  dark,
  moving,
  onLabelChange,
}: Pick<MapIndex, "parents" | "cells"> & {
  dark: boolean;
  moving?: { x: number; y: number };
  onLabelChange?: (id: string, text: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [editing, setEditing] = useState<string>();
  const cancelled = useRef(false);
  useLayoutEffect(() => {
    const tree = svg.current!.parentElement!;
    const nodes = [...tree.querySelectorAll<HTMLElement>("[data-mind-node]")];
    const draw = () => {
      const boxes = new Map(
        nodes.map((node) => [node.dataset.mindNode!, bounds(node, tree)]),
      );
      const paths = Array.from(parents, ([id, parent]) => {
        const a = boxes.get(parent.id)!,
          b = boxes.get(id)!;
        const forward = a.right + a.x <= b.right + b.x;
        const from = { x: forward ? a.right : a.x, y: a.anchorY },
          to = { x: forward ? b.x : b.right, y: b.anchorY };
        const args = [
          from,
          to,
          forward ? "e" : "w",
          forward ? "w" : "e",
        ] as const;
        return { id, d: curve(...args), ...curveMidpoint(...args) };
      });
      setEdges(paths);
    };
    draw();
    const observer = new ResizeObserver(draw);
    nodes.forEach((n) => observer.observe(n));
    observer.observe(tree);
    return () => observer.disconnect();
  }, [parents, moving]);
  useLayoutEffect(() => {
    const layer = svg.current!,
      tree = layer.parentElement!;
    const lines = layer.getBBox();
    let left = Math.min(0, lines.x),
      top = Math.min(0, lines.y),
      right = Math.max(tree.offsetWidth, lines.x + lines.width),
      bottom = Math.max(tree.offsetHeight, lines.y + lines.height);
    for (const node of tree.querySelectorAll<HTMLElement>(
      "[data-mind-node],.mind-edge-label",
    )) {
      const box = bounds(node, tree);
      const centered = node.classList.contains("mind-edge-label");
      const dx = centered ? node.offsetWidth / 2 : 0,
        dy = centered ? node.offsetHeight / 2 : 0;
      left = Math.min(left, box.x - dx);
      top = Math.min(top, box.y - dy);
      right = Math.max(right, box.right - dx);
      bottom = Math.max(bottom, box.bottom - dy);
    }
    tree.style.margin = `${Math.ceil(-top)}px ${Math.ceil(right - tree.offsetWidth)}px ${Math.ceil(bottom - tree.offsetHeight)}px ${Math.ceil(-left)}px`;
  }, [edges]);
  const edit = (id: string) => {
    cancelled.current = false;
    setEditing(id);
  };
  return (
    <>
      <svg
        ref={svg}
        className="mind-links"
        aria-hidden={onLabelChange ? undefined : true}
      >
        {edges.map(({ id, d }) => {
          const cell = cells.get(id);
          if (!cell) return null;
          return (
            <g key={id}>
              <path
                d={d}
                data-to={id}
                data-from={parents.get(id)?.id}
                data-trunk={cell.depth === 1 || undefined}
                stroke={branchPalette(cell.branch, dark)[0]}
                fill="none"
                strokeWidth={cell.depth === 1 ? 3 : cell.depth === 2 ? 2 : 1.5}
              />
              {onLabelChange && (
                <path
                  d={d}
                  className="mind-link-hit"
                  role="button"
                  aria-label={tr("连线文字") + " · " + cell.node.text}
                  tabIndex={0}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    edit(id);
                  }}
                  onKeyDown={(e) => {
                    if (["Enter", " ", "F2"].includes(e.key)) {
                      e.stopPropagation();
                      e.preventDefault();
                      edit(id);
                    }
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>
      {edges.map(({ id, x, y }) => {
        const node = cells.get(id)?.node;
        if (!node) return null;
        const style = { left: x, top: y };
        if (editing === id && onLabelChange)
          return (
            <input
              key={id}
              className="mind-edge-editor canvas-editor"
              style={style}
              autoFocus
              aria-label={tr("连线文字")}
              maxLength={1000}
              defaultValue={node.edgeLabel ?? ""}
              onFocus={(e) => e.target.select()}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const label = e.target.value.trim();
                if (!cancelled.current && label !== (node.edgeLabel ?? ""))
                  onLabelChange(id, label);
                setEditing(undefined);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  cancelled.current = e.key === "Escape";
                  e.currentTarget.blur();
                  svg.current?.parentElement
                    ?.querySelector<HTMLElement>(
                      "[data-mind-node][data-selected]",
                    )
                    ?.focus({ preventScroll: true });
                }
              }}
            />
          );
        return (
          node.edgeLabel && (
            <span
              key={id}
              className="mind-edge-label"
              style={style}
              onPointerDown={
                onLabelChange ? (e) => e.stopPropagation() : undefined
              }
              onDoubleClick={
                onLabelChange
                  ? (e) => {
                      e.stopPropagation();
                      edit(id);
                    }
                  : undefined
              }
            >
              {node.edgeLabel}
            </span>
          )
        );
      })}
    </>
  );
}

import { useLayoutEffect, useRef } from "react";
import type { indexMindMap } from "./mindMapData";
import { branchPalette } from "./mindMapStyle";

// Work in the map's own layout coordinates, including in scaled previews and 3D.
function anchor(node: HTMLElement, layout: HTMLElement) {
  let x = 0,
    y = 0;
  for (
    let el: HTMLElement | null = node;
    el && el !== layout;
    el = el.offsetParent as HTMLElement | null
  ) {
    x += el.offsetLeft;
    y += el.offsetTop;
  }
  y +=
    node.dataset.depth === "3"
      ? node.offsetHeight - 0.75
      : node.offsetHeight / 2;
  return { x, y, right: x + node.offsetWidth };
}

type MapIndex = ReturnType<typeof indexMindMap>;
export function MindMapLinks({
  parents,
  cells,
  dark,
}: Pick<MapIndex, "parents" | "cells"> & { dark: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const container = svg.current!;
    const layout = container.parentElement!;
    const nodes = Array.from(
      layout.querySelectorAll<HTMLElement>("[data-mind-node]"),
    );
    const paths = Array.from(container.querySelectorAll("path"));
    const draw = () => {
      const positions = new Map(
        nodes.map((node) => [node.dataset.mindNode!, anchor(node, layout)]),
      );
      for (const path of paths) {
        const to = positions.get(path.dataset.to!)!;
        const from = positions.get(path.dataset.from!)!;
        const mid = (from.right + to.x) / 2;
        const curve = (a: number, b: number) =>
          `C ${mid} ${a}, ${mid} ${b}, ${to.x} ${b}`;
        const d = path.hasAttribute("data-trunk")
          ? `M ${from.right} ${from.y - 1.5} ${curve(from.y - 1.5, to.y - 0.75)} L ${to.x} ${to.y + 0.75} C ${mid} ${to.y + 0.75}, ${mid} ${from.y + 1.5}, ${from.right} ${from.y + 1.5} Z`
          : `M ${from.right} ${from.y} ${curve(from.y, to.y)}`;
        path.setAttribute("d", d);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    nodes.forEach((node) => observer.observe(node));
    observer.observe(layout);
    return () => observer.disconnect();
  }, [parents]);
  return (
    <svg ref={svg} className="mind-links" aria-hidden="true">
      {Array.from(parents, ([id, parent]) => {
        const { depth, branch } = cells.get(id)!;
        const accent = branchPalette(branch, dark)[0];
        return (
          <path
            key={id}
            data-to={id}
            data-from={parent.id}
            data-trunk={depth === 1 || undefined}
            stroke={accent}
            fill={depth === 1 ? accent : "none"}
            strokeWidth={depth === 2 ? 2 : depth === 3 ? 1.5 : 1}
          />
        );
      })}
    </svg>
  );
}

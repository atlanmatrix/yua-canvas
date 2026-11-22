import { memo, useContext, useMemo, type ReactNode, type SVGProps } from "react";
import { FullContentExportContext } from "./ExportPreviewContext";
import { t as tr, useDarkTheme } from "./i18n";
import {
  parseFlowchart,
  type FlowchartData,
  type FlowNode,
  type FlowPoint,
  type FlowShape,
  type FlowTone,
} from "./flowchartData";
import { flowRoute } from "./flowchartGeometry";
import "./flowchart.css";

const palettes: Record<
  FlowTone,
  { light: [string, string]; dark: [string, string] }
> = {
  neutral: { light: ["#f8fafc", "#94a3b8"], dark: ["#323d4e", "#95a5bd"] },
  blue: { light: ["#eaf1ff", "#6994ef"], dark: ["#253d65", "#7aa6f9"] },
  mint: { light: ["#e4f5ee", "#53a385"], dark: ["#23493d", "#6cbfa3"] },
  amber: { light: ["#fff3d8", "#bd8d35"], dark: ["#513f26", "#e3b761"] },
  violet: { light: ["#f2ebff", "#9b7bd5"], dark: ["#423360", "#b89be9"] },
  rose: { light: ["#fcebf0", "#c77b91"], dark: ["#52313f", "#db91a6"] },
};

export const flowPalette = (tone: FlowTone, dark: boolean) => {
  const [fill, stroke] = palettes[tone][dark ? "dark" : "light"];
  return { fill, stroke };
};

export function FlowShapeView({
  shape,
  width: w,
  height: h,
  ...svg
}: { shape: FlowShape; width: number; height: number } & Pick<
  SVGProps<SVGElement>,
  "fill" | "stroke" | "strokeWidth" | "strokeLinejoin"
>) {
  const slant = Math.min(15, w / 8);
  const curve = Math.min(12, h / 5);
  switch (shape) {
    case "terminal":
      return <rect width={w} height={h} rx={h / 2} {...svg} />;
    case "process":
      return <rect width={w} height={h} rx={Math.min(6, h / 8)} {...svg} />;
    case "decision":
      return (
        <polygon
          points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
          {...svg}
        />
      );
    case "data":
      return (
        <polygon
          points={`${slant},0 ${w},0 ${w - slant},${h} 0,${h}`}
          {...svg}
        />
      );
    case "document":
      return (
        <path
          d={`M0 0 H${w} V${h - curve / 2} C${w * 0.72} ${h + curve} ${w * 0.34} ${h - curve * 1.5} 0 ${h} Z`}
          {...svg}
        />
      );
    case "database":
      return (
        <g {...svg}>
          <path
            d={`M0 ${curve} C0 ${-curve / 3} ${w} ${-curve / 3} ${w} ${curve} V${h - curve} C${w} ${h + curve / 3} 0 ${h + curve / 3} 0 ${h - curve} Z`}
          />
          <path
            d={`M0 ${curve} C0 ${curve * 2.3} ${w} ${curve * 2.3} ${w} ${curve}`}
            fill="none"
          />
        </g>
      );
  }
}

function textLines(text: string, width: number, height: number) {
  const lines: string[] = [];
  const limit = Math.max(1, Math.floor(height / 16));
  let line = "",
    used = 0;
  for (const character of text) {
    const advance = /[^\x00-\x7f]/.test(character) ? 14 : 7.5;
    if (character === "\n" || (line && used + advance > width)) {
      lines.push(line);
      line = "";
      used = 0;
      if (lines.length === limit) {
        lines[limit - 1] =
          Array.from(lines[limit - 1])
            .slice(0, -1)
            .join("") + "…";
        return lines;
      }
    }
    if (character !== "\n") {
      line += character;
      used += advance;
    }
  }
  return [...lines, line];
}

export function FlowNodeView({
  node,
  dark,
}: {
  node: FlowNode;
  dark: boolean;
}) {
  const { width, height, shape, label } = node;
  const lines = textLines(
    label,
    Math.max(20, shape === "decision" ? width * 0.55 : width - 24),
    shape === "decision" ? height * 0.58 : height - 12,
  );
  return (
    <>
      <FlowShapeView
        shape={shape}
        width={width}
        height={height}
        {...flowPalette(node.tone, dark)}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <text
        fill={dark ? "#edf3fc" : "#22324a"}
        fontSize="14"
        fontWeight="550"
        textAnchor="middle"
        dominantBaseline="central"
        pointerEvents="none"
      >
        {lines.map((line, i) => (
          <tspan
            key={i}
            x={width / 2}
            y={
              height / 2 +
              (i - (lines.length - 1) / 2) * 16 +
              (shape === "database" ? Math.min(6, height / 12) : 0)
            }
          >
            {line}
          </tspan>
        ))}
      </text>
    </>
  );
}

export function flowLayout(data: FlowchartData) {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const edges = data.edges.flatMap((edge) => {
    const from = nodes.get(edge.from.node);
    const to = nodes.get(edge.to.node);
    return from && to
      ? [{ edge, ...flowRoute(from, to, edge.from.side, edge.to.side) }]
      : [];
  });
  const points = [
    ...data.nodes.flatMap((node) => [
      { x: node.x, y: node.y },
      { x: node.x + node.width, y: node.y + node.height },
    ]),
    ...edges.flatMap(({ edge, points, label }) =>
      edge.label
        ? [
            ...points,
            { x: label.x - 65, y: label.y - 10 },
            { x: label.x + 65, y: label.y + 10 },
          ]
        : points,
    ),
  ];
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  const bounds = points.length
    ? { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
    : { x: 0, y: 0, width: 1, height: 1 };
  return { edges, bounds };
}

const coords = (points: FlowPoint[]) =>
  points.map(({ x, y }) => `${x},${y}`).join(" ");

export function FlowEdgeView({
  layout,
  dark,
  selected,
  hit,
}: {
  layout: ReturnType<typeof flowLayout>["edges"][number];
  dark: boolean;
  selected?: boolean;
  hit?: boolean;
}) {
  const { points, arrow, label, edge } = layout;
  const ink = selected
    ? dark
      ? "#97b9ff"
      : "#2563eb"
    : dark
      ? "#9aaac0"
      : "#66768e";
  return (
    <>
      {hit && <polyline points={coords(points)} className="flow-edge-hit" />}
      <polyline
        points={coords(points)}
        stroke={ink}
        strokeWidth={selected ? 2.6 : 1.65}
        strokeLinejoin="round"
        fill="none"
      />
      <polygon points={coords(arrow)} fill={ink} />
      {edge.label && (
        <text
          x={label.x}
          y={label.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="12"
          fontWeight="600"
          fill={ink}
          stroke={dark ? "var(--surface, #131c2e)" : "#fff"}
          strokeWidth="5"
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {textLines(edge.label.replaceAll("\n", " "), 120, 16)[0]}
        </text>
      )}
    </>
  );
}

export function FlowArtwork({
  data,
  layout = flowLayout(data),
  dark,
  renderNode,
  renderEdge,
}: {
  data: FlowchartData;
  layout?: ReturnType<typeof flowLayout>;
  dark: boolean;
  renderNode?: (node: FlowNode, contents: ReactNode) => ReactNode;
  renderEdge?: (
    layout: ReturnType<typeof flowLayout>["edges"][number],
  ) => ReactNode;
}) {
  return (
    <>
      {layout.edges.map((entry) =>
        renderEdge ? (
          renderEdge(entry)
        ) : (
          <FlowEdgeView key={entry.edge.id} layout={entry} dark={dark} />
        ),
      )}
      {data.nodes.map((node) => (
        <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
          {renderNode ? (
            renderNode(node, <FlowNodeView node={node} dark={dark} />)
          ) : (
            <FlowNodeView node={node} dark={dark} />
          )}
        </g>
      ))}
    </>
  );
}

export const FlowchartPreview = memo(function FlowchartPreview({
  text,
}: {
  text: string;
}) {
  const fullContentExport = useContext(FullContentExportContext);
  const dark = useDarkTheme() && !fullContentExport;
  const data = useMemo(() => {
    try {
      return parseFlowchart(text);
    } catch {
      return undefined;
    }
  }, [text]);
  if (!data?.nodes.length)
    return (
      <div className="flow-preview flow-preview-empty">
        {tr(data ? "空流程图" : "流程图数据无效")}
      </div>
    );
  const layout = flowLayout(data);
  const { x, y, width, height } = layout.bounds;
  return (
    <svg
      className="flow-preview"
      role="img"
      aria-label={tr("流程图")}
      viewBox={`${x - 18} ${y - 18} ${width + 36} ${height + 36}`}
    >
      <FlowArtwork data={data} layout={layout} dark={dark} />
    </svg>
  );
});

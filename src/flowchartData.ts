export const FLOW_SHAPES = {
  terminal: { name: "开始 / 结束", width: 116, height: 46, tone: "mint" },
  process: { name: "处理步骤", width: 144, height: 56, tone: "blue" },
  decision: { name: "条件判断", width: 152, height: 88, tone: "amber" },
  data: { name: "输入 / 输出", width: 144, height: 56, tone: "violet" },
  document: { name: "文档", width: 144, height: 64, tone: "neutral" },
  database: { name: "数据库", width: 128, height: 70, tone: "neutral" },
} as const;
export const FLOW_TONES = {
  neutral: "中性",
  blue: "蓝色",
  mint: "绿色",
  amber: "黄色",
  violet: "紫色",
  rose: "红色",
} as const;
export const FLOW_SIDES = ["n", "e", "s", "w"] as const;
export const FLOW_LIMITS = {
  nodes: 300,
  edges: 600,
  label: 180,
  edgeLabel: 80,
  position: 100_000,
};
export type FlowSide = (typeof FLOW_SIDES)[number];
export type FlowShape = keyof typeof FLOW_SHAPES;
export type FlowTone = keyof typeof FLOW_TONES;
export type FlowPoint = { x: number; y: number };
export type FlowNode = FlowPoint & {
  id: string;
  shape: FlowShape;
  tone: FlowTone;
  label: string;
  width: number;
  height: number;
};
export type FlowPort = { node: string; side?: FlowSide };
export type FlowEdge = {
  id: string;
  from: FlowPort;
  to: FlowPort;
  label: string;
};
export type FlowchartData = {
  version: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export function newFlowNode(
  shape: FlowShape,
  point: FlowPoint,
  label: string,
): FlowNode {
  const { width, height, tone } = FLOW_SHAPES[shape];
  return {
    id: crypto.randomUUID(),
    shape,
    tone,
    label,
    width,
    height,
    ...point,
  };
}

export function newFlowchart(
  translate: (key: string) => string,
): FlowchartData {
  const start = newFlowNode("terminal", { x: 109, y: 8 }, translate("开始"));
  const task = newFlowNode("process", { x: 95, y: 92 }, translate("处理步骤"));
  const decision = newFlowNode(
    "decision",
    { x: 91, y: 188 },
    translate("通过判断？"),
  );
  const finish = newFlowNode("terminal", { x: 109, y: 330 }, translate("结束"));
  const retry = {
    ...newFlowNode("process", { x: 319, y: 204 }, translate("返回修改")),
    tone: "rose" as const,
  };
  const edge = (from: FlowNode, to: FlowNode, label = ""): FlowEdge => ({
    id: crypto.randomUUID(),
    from: { node: from.id },
    to: { node: to.id },
    label: label && translate(label),
  });
  return {
    version: 1,
    nodes: [start, task, decision, finish, retry],
    edges: [
      edge(start, task),
      edge(task, decision),
      edge(decision, finish, "是"),
      edge(decision, retry, "否"),
    ],
  };
}

export function parseFlowchart(text: string): FlowchartData {
  const invalid = () => new Error("流程图数据无效");
  if (text.length > 1_000_000) throw invalid();
  let data: FlowchartData;
  try {
    data = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (
    data?.version !== 1 ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges) ||
    data.nodes.length > FLOW_LIMITS.nodes ||
    data.edges.length > FLOW_LIMITS.edges
  )
    throw invalid();
  const idValid = (id: unknown) =>
    typeof id === "string" && id.length > 0 && id.length <= 128;
  const nodeIds = new Set<string>();
  const nodes = data.nodes.map((node) => {
    if (
      !node ||
      !idValid(node.id) ||
      nodeIds.has(node.id) ||
      !Object.hasOwn(FLOW_SHAPES, node.shape) ||
      !Object.hasOwn(FLOW_TONES, node.tone) ||
      typeof node.label !== "string" ||
      node.label.length > FLOW_LIMITS.label ||
      ![node.x, node.y].every(
        (value) =>
          Number.isFinite(value) && Math.abs(value) <= FLOW_LIMITS.position,
      ) ||
      ![node.width, node.height].every(
        (value) => Number.isFinite(value) && value >= 36 && value <= 2000,
      )
    )
      throw invalid();
    const { id, x, y, width, height, label, tone, shape } = node;
    nodeIds.add(id);
    return { id, x, y, width, height, label, tone, shape };
  });
  const portValid = (port: FlowPort) =>
    !!port &&
    nodeIds.has(port.node) &&
    (port.side === undefined || FLOW_SIDES.includes(port.side));
  const edgeIds = new Set<string>();
  const edges = data.edges.map((edge) => {
    if (
      !edge ||
      !idValid(edge.id) ||
      edgeIds.has(edge.id) ||
      !portValid(edge.from) ||
      !portValid(edge.to) ||
      edge.from.node === edge.to.node ||
      typeof edge.label !== "string" ||
      edge.label.length > FLOW_LIMITS.edgeLabel
    )
      throw invalid();
    edgeIds.add(edge.id);
    const { id, from, to, label } = edge;
    return {
      id,
      from: { node: from.node, side: from.side },
      to: { node: to.node, side: to.side },
      label,
    };
  });
  return { version: 1, nodes, edges };
}

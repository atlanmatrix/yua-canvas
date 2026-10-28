export const DEFAULT_MERMAID = "flowchart TD\n  A[开始] --> B[完成]";

export function mermaidSource(text: string): string | undefined {
  const value = text.trim();
  const fenced = value.match(/^```mermaid[^\S\n]*\n([\s\S]*?)\n```$/i);
  if (fenced) return fenced[1].trim();
  // Comments and front matter can precede the diagram declaration.
  const code = value
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "")
    .replace(/^(?:\s*%%[^\n]*(?:\n|$))*/, "")
    .trimStart();
  return /^(?:(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b|(?:sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|sankey-beta|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|architecture-beta|kanban|zenuml)\b)/.test(
    code,
  )
    ? value
    : undefined;
}

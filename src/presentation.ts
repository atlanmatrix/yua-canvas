export type DisplayMode = "small" | "medium" | "large";
export const FONT_FAMILIES = [
  "monospace",
  "system-ui",
  "serif",
  "Georgia",
] as const;
export type TextStyle = {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
};
export type Stroke = {
  id: string;
  color: string;
  width: number;
  points: { x: number; y: number }[];
};
const hex = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7;
export function validPresentation(value: any, group = false): boolean {
  if (!value || typeof value !== "object") return false;
  if (
    value.displayMode !== undefined &&
    !(group ? ["flat", "list"] : ["small", "medium", "large"]).includes(
      value.displayMode,
    )
  )
    return false;
  if (value.masked !== undefined && typeof value.masked !== "boolean")
    return false;
  if (
    value.remark !== undefined &&
    (typeof value.remark !== "string" || value.remark.length > 10000)
  )
    return false;
  if (group)
    return (
      value.activeCard === undefined || typeof value.activeCard === "string"
    );
  for (const k of ["previewWidth", "previewHeight"])
    if (value[k] !== undefined && (!finite(value[k]) || value[k] <= 0))
      return false;
  const s = value.textStyle;
  return (
    s === undefined ||
    (!!s &&
      typeof s === "object" &&
      !Array.isArray(s) &&
      (s.fontFamily === undefined || FONT_FAMILIES.includes(s.fontFamily)) &&
      (s.fontSize === undefined ||
        (Number.isFinite(s.fontSize) && s.fontSize >= 8 && s.fontSize <= 96)) &&
      (s.color === undefined || hex(s.color)) &&
      ["bold", "italic", "underline", "strikethrough"].every(
        (k) => s[k] === undefined || typeof s[k] === "boolean",
      ))
  );
}
export function validStrokes(value: unknown): value is Stroke[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 10000) return false;
  const ids = new Set<string>();
  let points = 0;
  return value.every((s) => {
    if (
      !s ||
      typeof s.id !== "string" ||
      ids.has(s.id) ||
      !hex(s.color) ||
      !Number.isFinite(s.width) ||
      s.width < 1 ||
      s.width > 48 ||
      !Array.isArray(s.points) ||
      !s.points.length ||
      s.points.length > 20000
    )
      return false;
    ids.add(s.id);
    points += s.points.length;
    return (
      points <= 500000 &&
      s.points.every((p: any) => p && finite(p.x) && finite(p.y))
    );
  });
}
export function strokePath({ points }: Stroke): string {
  const [first] = points;
  if (!first) return "";
  if (points.length === 1) return `M${first.x},${first.y}l.01,0`;
  let path = `M${first.x},${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    path += `Q${a.x},${a.y} ${(a.x + b.x) / 2},${(a.y + b.y) / 2}`;
  }
  const last = points.at(-1)!;
  return path + `L${last.x},${last.y}`;
}
export function strokeBounds(strokes: Stroke[] = []) {
  return strokes.map((s) => {
    const xs = s.points.map((p) => p.x),
      ys = s.points.map((p) => p.y),
      x = Math.min(...xs) - s.width / 2,
      y = Math.min(...ys) - s.width / 2;
    return {
      x,
      y,
      width: Math.max(...xs) - x + s.width / 2,
      height: Math.max(...ys) - y + s.width / 2,
    };
  });
}
export function textCss(s: TextStyle = {}) {
  return {
    fontFamily: s.fontFamily || "monospace",
    fontSize: s.fontSize || 13,
    lineHeight: `${Math.max(24, (s.fontSize || 13) * 1.5)}px`,
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? "italic" : "normal",
    textDecoration:
      [s.underline && "underline", s.strikethrough && "line-through"]
        .filter(Boolean)
        .join(" ") || "none",
    color: s.color || "#334155",
  };
}

export function remarkBounds(
  rect: { x: number; y: number; width: number; height: number },
  text?: string,
) {
  return text
    ? [
        {
          x: rect.x + rect.width + 14,
          y: rect.y,
          width: 224,
          height: Math.min(
            260,
            Math.max(44, text.split("\n").length * 21 + 24),
          ),
        },
      ]
    : [];
}

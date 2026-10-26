import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const BACKGROUND_COLORS = [
  { name: "白色", value: "#ffffff" },
  { name: "浅粉", value: "#ffe4e6" },
  { name: "浅橙", value: "#ffedd5" },
  { name: "浅黄", value: "#fef9c3" },
  { name: "浅绿", value: "#dcfce7" },
  { name: "浅蓝", value: "#dbeafe" },
  { name: "浅紫", value: "#ede9fe" },
] as const;

export function ColorPalette({
  value,
  onChange,
}: {
  value?: string;
  onChange: (color: string) => void;
}) {
  return (
    <div
      className="color-palette"
      role="group"
      aria-label="背景颜色"
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const buttons = [
          ...e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (index + (e.key === "ArrowLeft" ? -1 : 1) + buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }}
    >
      {BACKGROUND_COLORS.map((color) => (
        <button
          key={color.value}
          className="color-swatch"
          role="menuitemradio"
          aria-label={`背景色：${color.name}`}
          aria-checked={value?.toLowerCase() === color.value}
          title={color.name}
          style={{ background: color.value }}
          onClick={() => onChange(color.value)}
        />
      ))}
    </div>
  );
}
export function MenuSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="context-menu-section" role="group" aria-label={label}>
      {children}
    </div>
  );
}
export function CanvasContextMenu({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  useLayoutEffect(() => {
    const place = () => {
      const bounds = ref.current?.getBoundingClientRect();
      if (!bounds) return;
      const next = {
        x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
        y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
      };
      setPosition((previous) =>
        previous.x === next.x && previous.y === next.y ? previous : next,
      );
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [x, y, children]);
  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

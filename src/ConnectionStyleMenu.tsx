import { MenuSection } from "./CanvasContextMenu";
import type { ConnectionStyle } from "./connections";
import { t as tr } from "./i18n";
import { Check } from "./icons";

export function ConnectionStyleMenu({
  routing = "curve",
  arrowheads = "end",
  onChange,
}: ConnectionStyle & { onChange: (style?: ConnectionStyle) => void }) {
  return (
    <>
      <MenuSection label={tr("连线样式")}>
        {(
          [
            ["curve", "曲线"],
            ["elbow", "折线"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="connection-style-option"
            role="menuitemradio"
            aria-checked={routing === value}
            onClick={() =>
              onChange(routing === value ? undefined : { routing: value })
            }
          >
            <Check
              size={14}
              style={{ visibility: routing === value ? "visible" : "hidden" }}
            />
            {tr(label)}
          </button>
        ))}
      </MenuSection>
      <MenuSection label={tr("连线箭头")}>
        {(
          [
            ["none", "无箭头"],
            ["end", "单向箭头"],
            ["both", "双向箭头"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="connection-style-option"
            role="menuitemradio"
            aria-checked={arrowheads === value}
            onClick={() =>
              onChange(arrowheads === value ? undefined : { arrowheads: value })
            }
          >
            <Check
              size={14}
              style={{
                visibility: arrowheads === value ? "visible" : "hidden",
              }}
            />
            {tr(label)}
          </button>
        ))}
      </MenuSection>
    </>
  );
}

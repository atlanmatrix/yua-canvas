import type { KeyboardEvent } from "react";
import { MenuSection } from "./CanvasContextMenu";
import { MenuButton } from "./MenuShortcut";
import type {
  ConnectionArrowheads,
  ConnectionRouting,
  ConnectionStyle,
} from "./connections";
import { t as tr } from "./i18n";
import { ArrowLeftRight, Pencil, Trash2 } from "./icons";

function RoutingGlyph({ routing }: { routing: ConnectionRouting }) {
  return (
    <svg
      className="connection-style-glyph"
      viewBox="0 0 24 16"
      width="20"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={
          routing === "curve"
            ? "M 3.5 12.5 C 10.5 12.5, 13.5 3.5, 20.5 3.5"
            : "M 3.5 12.5 H 12 V 3.5 H 20.5"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="3.5" cy="12.5" r="1.65" fill="currentColor" />
      <circle cx="20.5" cy="3.5" r="1.65" fill="currentColor" />
    </svg>
  );
}

function ArrowGlyph({ arrowheads }: { arrowheads: ConnectionArrowheads }) {
  return (
    <svg
      className="connection-style-glyph"
      viewBox="0 0 28 14"
      width="24"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1={arrowheads === "both" ? 7 : 3.5}
        y1="7"
        x2={arrowheads === "none" ? 24.5 : 21}
        y2="7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {arrowheads === "both" && (
        <path d="M 9.5 3.3 L 3 7 L 9.5 10.7 Z" fill="currentColor" />
      )}
      {arrowheads !== "none" && (
        <path d="M 18.5 3.3 L 25 7 L 18.5 10.7 Z" fill="currentColor" />
      )}
    </svg>
  );
}

function onSegmentKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  e.stopPropagation();
  const buttons = [
    ...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:enabled"),
  ];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0 || !buttons.length) return;
  const next =
    (index + (e.key === "ArrowLeft" ? -1 : 1) + buttons.length) %
    buttons.length;
  buttons[next]?.focus();
}

export function ConnectionStyleMenu({
  routing = "curve",
  arrowheads = "end",
  hasLabel = false,
  canReverse = true,
  onChange,
  onEditLabel,
  onReverse,
  onDelete,
}: ConnectionStyle & {
  hasLabel?: boolean;
  canReverse?: boolean;
  onChange: (style?: ConnectionStyle) => void;
  onEditLabel: () => void;
  onReverse: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="connection-style-menu">
      <MenuSection label={tr("连线样式")}>
        <div className="connection-menu-heading" aria-hidden="true">
          {tr("连线样式")}
        </div>
        <div
          className="connection-style-grid connection-style-routing"
          onKeyDown={onSegmentKeyDown}
        >
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
              aria-label={tr(label)}
              title={tr(label)}
              onClick={() =>
                onChange(routing === value ? undefined : { routing: value })
              }
            >
              <RoutingGlyph routing={value} />
              <span>{tr(label)}</span>
            </button>
          ))}
        </div>
      </MenuSection>
      <MenuSection label={tr("连线箭头")}>
        <div className="connection-menu-heading" aria-hidden="true">
          {tr("连线箭头")}
        </div>
        <div
          className="connection-style-grid connection-style-arrows"
          onKeyDown={onSegmentKeyDown}
        >
          {(
            [
              ["none", "无箭头", "无"],
              ["end", "单向箭头", "单向"],
              ["both", "双向箭头", "双向"],
            ] as const
          ).map(([value, label, shortLabel]) => (
            <button
              key={value}
              type="button"
              className="connection-style-option"
              role="menuitemradio"
              aria-checked={arrowheads === value}
              aria-label={tr(label)}
              title={tr(label)}
              onClick={() =>
                onChange(
                  arrowheads === value ? undefined : { arrowheads: value },
                )
              }
            >
              <ArrowGlyph arrowheads={value} />
              <span>{tr(shortLabel)}</span>
            </button>
          ))}
        </div>
      </MenuSection>
      <MenuSection label={tr("连线操作")}>
        <MenuButton
          shortcut="editLabel"
          type="button"
          role="menuitem"
          onClick={onEditLabel}
        >
          <Pencil size={14} />
          {tr(hasLabel ? "编辑文字" : "添加文字")}
        </MenuButton>
        <button
          type="button"
          role="menuitem"
          disabled={!canReverse}
          onClick={onReverse}
        >
          <ArrowLeftRight size={14} />
          {tr("反转方向")}
        </button>
      </MenuSection>
      <MenuSection label={tr("删除操作")}>
        <MenuButton
          shortcut="delete"
          type="button"
          className="danger"
          role="menuitem"
          onClick={onDelete}
        >
          <Trash2 size={14} />
          {tr("删除")}
        </MenuButton>
      </MenuSection>
    </div>
  );
}

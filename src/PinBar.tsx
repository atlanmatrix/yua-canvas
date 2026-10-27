import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pin } from "lucide-react";
import { collectPins, type PinnedItem } from "./pins";
import type { Board, PinColor } from "./storage";
import { CanvasContextMenu } from "./CanvasContextMenu";
const colors: { value: PinColor; label: string }[] = [
  { value: "info", label: "info：蓝色" },
  { value: "warn", label: "warn：橙色" },
  { value: "danger", label: "danger：红色" },
  { value: "normal", label: "normal：默认" },
];
export function PinBar({
  board,
  path,
  onJump,
  onRename,
  onColorChange,
}: {
  board: Board;
  path: string[];
  onJump: (pin: PinnedItem) => void;
  onRename: (pin: PinnedItem, name: string) => void;
  onColorChange: (pin: PinnedItem, color: PinColor) => void;
}) {
  const [editing, setEditing] = useState<string>(),
    [name, setName] = useState("");
  const [menu, setMenu] = useState<{
    pin: PinnedItem;
    x: number;
    y: number;
    trigger: HTMLButtonElement;
  }>();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => {
    menu?.trigger.focus();
    setMenu(undefined);
  };
  useEffect(() => {
    if (!menu) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
    const dismiss = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(undefined);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [menu]);
  const pins = collectPins(board, path);
  if (!pins.length) return null;
  return (
    <>
      <nav className="pin-bar" aria-label="Pin 定位">
        <Pin size={13} aria-hidden="true" />
        {pins.map((pin) => {
          const key = JSON.stringify([pin.path, pin.kind, pin.id]);
          return editing === key ? (
            <input
              key={key}
              aria-label="Pin 名称"
              maxLength={100}
              autoFocus
              value={name}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim()) onRename(pin, name.trim());
                setEditing(undefined);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setEditing(undefined);
                }
              }}
            />
          ) : (
            <button
              key={key}
              data-pin-color={pin.color || "normal"}
              title={pin.name + "（双击重命名，右键设置颜色）"}
              aria-haspopup="menu"
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({
                  pin,
                  x: e.clientX,
                  y: e.clientY,
                  trigger: e.currentTarget,
                });
              }}
              onClick={() => onJump(pin)}
              onDoubleClick={() => {
                setName(pin.name);
                setEditing(key);
              }}
            >
              <span>{pin.name}</span>
            </button>
          );
        })}
      </nav>
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape" || e.key === "Tab") {
                if (e.key === "Escape") e.preventDefault();
                closeMenu();
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const items = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              ];
              const current = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? items.length - 1
                    : (current +
                        (e.key === "ArrowUp" ? -1 : 1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            }}
          >
            <CanvasContextMenu x={menu.x} y={menu.y}>
              <div
                className="pin-color-menu"
                role="group"
                aria-label="Pin 颜色"
              >
                {colors.map((color) => (
                  <button
                    key={color.value}
                    role="menuitemradio"
                    aria-checked={(menu.pin.color || "normal") === color.value}
                    onClick={() => {
                      onColorChange(menu.pin, color.value);
                      closeMenu();
                    }}
                  >
                    <span
                      className="pin-color-dot"
                      data-pin-color={color.value}
                      aria-hidden="true"
                    />
                    {color.label}
                  </button>
                ))}
              </div>
            </CanvasContextMenu>
          </div>,
          document.body,
        )}
    </>
  );
}

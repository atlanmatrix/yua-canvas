import { useState } from "react";
import { Pin } from "lucide-react";
import { collectPins, type PinnedItem } from "./pins";
import type { Board } from "./storage";
export function PinBar({
  root,
  onJump,
  onRename,
}: {
  root: Board;
  onJump: (pin: PinnedItem) => void;
  onRename: (pin: PinnedItem, name: string) => void;
}) {
  const [editing, setEditing] = useState<string>(),
    [name, setName] = useState("");
  const pins = collectPins(root);
  if (!pins.length) return null;
  return (
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
            title={pin.name + "（双击重命名）"}
            onClick={() => onJump(pin)}
            onDoubleClick={() => {
              setName(pin.name);
              setEditing(key);
            }}
          >
            {pin.name}
          </button>
        );
      })}
    </nav>
  );
}

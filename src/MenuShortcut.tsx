import type { ButtonHTMLAttributes, ReactNode } from "react";

const mac =
  /Mac|iPhone|iPad|iPod/.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent,
  );
export type Shortcut =
  | "copy"
  | "cut"
  | "paste"
  | "addChild"
  | "addSibling"
  | "duplicate"
  | "import"
  | "export"
  | "parent"
  | "child"
  | "delete"
  | "open"
  | "mask"
  | "text"
  | "todo"
  | "image";
const keys: Record<Shortcut, string[]> = {
  copy: ["mod", "C"],
  cut: ["mod", "X"],
  paste: ["mod", "V"],
  duplicate: ["mod", "D"],
  addChild: ["Tab"],
  addSibling: ["mod", "Enter"],
  import: ["mod", "O"],
  export: ["mod", "shift", "E"],
  parent: ["mod", "↑"],
  child: ["mod", "↓"],
  delete: [mac ? "⌫" : "Del"],
  open: ["Enter"],
  mask: ["H"],
  text: ["N"],
  todo: ["T"],
  image: ["I"],
};
export function ShortcutHint({ shortcut }: { shortcut: Shortcut }) {
  return (
    <kbd className="menu-shortcut" aria-hidden="true">
      {keys[shortcut]
        .map((key) =>
          key === "mod"
            ? mac
              ? "⌘"
              : "Ctrl"
            : key === "shift"
              ? mac
                ? "⇧"
                : "Shift"
              : key,
        )
        .join(mac ? "" : "+")}
    </kbd>
  );
}
export function MenuButton({
  shortcut,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  shortcut?: Shortcut;
  children: ReactNode;
}) {
  return (
    <button {...props}>
      {children}
      {shortcut && <ShortcutHint shortcut={shortcut} />}
    </button>
  );
}

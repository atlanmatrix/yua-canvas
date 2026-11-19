import { navigateMenu } from "./menuKeyboard";
import { t as tr } from "./i18n";
import { ChevronRight } from "./icons";
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
const SubmenuContext = createContext<
  | {
      active?: string;
      setActive: Dispatch<SetStateAction<string | undefined>>;
      mode: RefObject<"pointer" | "keyboard">;
    }
  | undefined
>(undefined);

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
    <ColorSwatches
      label={tr("背景颜色")}
      optionLabel={tr("背景色")}
      colors={BACKGROUND_COLORS}
      value={value?.toLowerCase()}
      onChange={onChange}
    />
  );
}

export function ColorSwatches<T extends string>({
  label,
  optionLabel,
  colors,
  value,
  onChange,
}: {
  label: string;
  optionLabel: string;
  colors: readonly { name: string; value: T; background?: string }[];
  value?: string;
  onChange: (color: T) => void;
}) {
  return (
    <div
      className="color-palette"
      role="group"
      aria-label={label}
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
      {colors.map((color) => (
        <button
          key={color.value}
          className="color-swatch"
          role="menuitemradio"
          aria-label={`${optionLabel}：${tr(color.name)}`}
          aria-checked={value === color.value}
          title={tr(color.name)}
          style={{ background: color.background || color.value }}
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
  useLayoutEffect(() => {
    if (!ref.current?.contains(document.activeElement))
      ref.current
        ?.querySelector<HTMLButtonElement>("button:enabled")
        ?.focus({ preventScroll: true });
  }, []);
  const [position, setPosition] = useState({
    x: Number.isFinite(x) ? x : 8,
    y: Number.isFinite(y) ? y : 8,
  });
  const [active, setActive] = useState<string>();
  const mode = useRef<"pointer" | "keyboard">("pointer");
  useLayoutEffect(() => {
    const place = () => {
      const bounds = ref.current?.getBoundingClientRect();
      if (!bounds) return;
      const next = {
        x: Math.max(
          8,
          Math.min(
            Number.isFinite(x) ? x : 8,
            window.innerWidth - bounds.width - 8,
          ),
        ),
        y: Math.max(
          8,
          Math.min(
            Number.isFinite(y) ? y : 8,
            window.innerHeight - bounds.height - 8,
          ),
        ),
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
    <SubmenuContext.Provider value={{ active, setActive, mode }}>
      <div
        ref={ref}
        className="context-menu"
        role="menu"
        onKeyDown={navigateMenu}
        onKeyDownCapture={() => {
          mode.current = "keyboard";
        }}
        onPointerMoveCapture={() => {
          mode.current = "pointer";
        }}
        style={{ left: position.x, top: position.y }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </SubmenuContext.Provider>
  );
}

export function ContextSubmenu({
  label,
  children,
  icon,
  menuLabel,
  buttonClassName,
  buttonRole = "menuitem",
  disabled,
}: {
  label: string;
  children: ReactNode;
  icon?: ReactNode;
  menuLabel?: string;
  buttonClassName?: string;
  buttonRole?: "button" | "menuitem";
  disabled?: boolean;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const controller = useContext(SubmenuContext),
    id = useId();
  const open = controller ? controller.active === id : localOpen;
  const setOpen = (value: boolean) =>
    controller
      ? controller.setActive((current) =>
          value ? id : current === id ? undefined : current,
        )
      : setLocalOpen(value);
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    bridge?: CSSProperties;
  }>({ x: 0, y: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const focusFirst = useRef(false);
  const cancelClose = () => clearTimeout(closeTimer.current);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const element = submenu.current;
      if (!anchor || !element) return;
      const bounds = element.getBoundingClientRect();
      const parent =
        trigger.current
          ?.closest(".context-menu, .settings-popover")
          ?.getBoundingClientRect() ?? anchor;
      const inset =
        element.clientTop + parseFloat(getComputedStyle(element).paddingTop);
      const preferred = parent.right + 8;
      const below =
        preferred + bounds.width > innerWidth - 8 &&
        parent.left - bounds.width - 8 < 8;
      const opensRight = preferred + bounds.width <= innerWidth - 8;
      const x = Math.max(
        8,
        Math.min(
          below
            ? anchor.left
            : opensRight
              ? preferred
              : parent.left - bounds.width - 8,
          innerWidth - bounds.width - 8,
        ),
      );
      const y = Math.max(
        8,
        Math.min(
          below
            ? anchor.bottom + 8 + bounds.height <= innerHeight - 8
              ? anchor.bottom + 8
              : anchor.top - bounds.height - 8
            : anchor.top - inset,
          innerHeight - bounds.height - 8,
        ),
      );
      // Span the gap from the trigger edge to both near corners of the panel.
      // The clipped hit area stays out of adjacent rows while moving diagonally.
      const top = Math.min(y, anchor.top);
      const near = opensRight ? "0%" : "100%";
      const far = opensRight ? "100%" : "0%";
      const bridge = below
        ? undefined
        : {
            left: opensRight ? anchor.right : x + bounds.width,
            top,
            width: opensRight
              ? x - anchor.right
              : anchor.left - x - bounds.width,
            height: Math.max(anchor.bottom, y + bounds.height) - top,
            clipPath: `polygon(${near} ${anchor.top - top}px, ${far} ${y - top}px, ${far} ${y + bounds.height - top}px, ${near} ${anchor.bottom - top}px)`,
          };
      setPosition({ x, y, bridge });
      if (focusFirst.current) {
        submenu.current
          ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
          ?.focus();
        focusFirst.current = false;
      }
    };
    place();
    window.addEventListener("resize", place);
    const panel = trigger.current?.closest(".settings-popover, .context-menu");
    panel?.addEventListener("scroll", place);
    return () => {
      panel?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      cancelClose();
    };
  }, [open, children]);
  const close = () => {
    cancelClose();
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="context-submenu-host"
      onPointerEnter={(e) => {
        cancelClose();
        if (e.pointerType === "touch") return;
        if (!disabled && controller?.mode.current !== "keyboard") setOpen(true);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        if (!disabled && !open && controller?.mode.current !== "keyboard") {
          cancelClose();
          setOpen(true);
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "touch") return;
        cancelClose();
        closeTimer.current = setTimeout(() => setOpen(false), 150);
      }}
    >
      <button
        ref={trigger}
        role={buttonRole}
        className={buttonClassName}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          cancelClose();
          focusFirst.current = !e.detail;
          if (open && !e.detail)
            submenu.current
              ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
              ?.focus();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          const settings = !!trigger.current?.closest(".settings-popover");
          if (
            e.key === "ArrowRight" ||
            (settings ? e.key === "ArrowLeft" : e.key === "ArrowDown")
          ) {
            e.preventDefault();
            e.stopPropagation();
            focusFirst.current = true;
            if (open)
              submenu.current
                ?.querySelector<HTMLButtonElement>("button")
                ?.focus();
            else setOpen(true);
          }
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        {icon}
        <span>{label}</span>
        <ChevronRight className="submenu-arrow" size={14} aria-hidden="true" />
      </button>
      {open && position.bridge && (
        <span
          aria-hidden="true"
          className="submenu-bridge"
          style={position.bridge}
        />
      )}
      {open && (
        <div
          ref={submenu}
          className="context-menu context-submenu"
          role="menu"
          aria-label={menuLabel || tr("{0}组件", label)}
          style={{ left: position.x, top: position.y }}
          onKeyDown={(e) => {
            if (
              ["Escape", "ArrowLeft"].includes(e.key) ||
              (e.key === "ArrowRight" &&
                trigger.current?.closest(".settings-popover"))
            ) {
              e.stopPropagation();
              e.preventDefault();
              close();
              return;
            }
            navigateMenu(e);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

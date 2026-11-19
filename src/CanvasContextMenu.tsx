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
  type RefObject,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
type SubmenuContent = {
  id: string;
  trigger: RefObject<HTMLButtonElement | null>;
  focusFirst: RefObject<boolean>;
  label: string;
  children: ReactNode;
};

const SubmenuContext = createContext<
  | {
      active?: string;
      setContent: Dispatch<SetStateAction<SubmenuContent | undefined>>;
      setActive: Dispatch<SetStateAction<string | undefined>>;
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
// Project the pointer's latest movement onto the near edge of the open panel.
function movingTowardSubmenu(
  previous: { x: number; y: number },
  current: { x: number; y: number },
  panel: DOMRect,
) {
  if (current.x >= panel.left && current.x <= panel.right) return false;
  const dx = current.x - previous.x;
  const edge = current.x < panel.left ? panel.left : panel.right;
  const distance = edge - current.x;
  if (!dx || distance / dx <= 0) return false;
  const y = current.y + (current.y - previous.y) * (distance / dx);
  return y >= panel.top && y <= panel.bottom;
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
  const [content, setContent] = useState<SubmenuContent>();
  const previousPointer = useRef<{ x: number; y: number } | undefined>(
    undefined,
  );
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cancelHover = () => clearTimeout(hoverTimer.current);
  useLayoutEffect(() => cancelHover, []);
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
    <SubmenuContext.Provider value={{ active, setActive, setContent }}>
      <div
        ref={ref}
        className="context-menu"
        role="menu"
        onKeyDown={navigateMenu}
        onKeyDownCapture={() => {
          cancelHover();
          previousPointer.current = undefined;
        }}
        onPointerDownCapture={cancelHover}
        onPointerMoveCapture={(e) => {
          if (e.pointerType === "touch") return;
          cancelHover();
          const previous = previousPointer.current;
          const current = { x: e.clientX, y: e.clientY };
          previousPointer.current = current;
          const target = e.target as Element;
          if (target.closest(".context-submenu, .submenu-bridge")) return;
          // Keep the panel alive while crossing the padding between sections.
          if (active && !target.closest("button")) {
            hoverTimer.current = setTimeout(() => setActive(undefined), 150);
            return;
          }
          const trigger = target.closest<HTMLButtonElement>(
            "button[aria-haspopup=menu]:enabled",
          );
          const next = trigger?.id;
          if (next === active) return;
          const panel =
            active && e.currentTarget.querySelector(".context-submenu");
          if (
            previous &&
            panel &&
            movingTowardSubmenu(
              previous,
              current,
              panel.getBoundingClientRect(),
            )
          ) {
            // Allow diagonal travel across rows, then switch if the pointer rests here.
            hoverTimer.current = setTimeout(() => setActive(next), 150);
          } else {
            setActive(next);
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "touch") return;
          previousPointer.current = undefined;
          cancelHover();
          hoverTimer.current = setTimeout(() => setActive(undefined), 150);
        }}
        style={{ left: position.x, top: position.y }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
        {active && content && (
          <SubmenuPanel
            content={content}
            onClose={() => setActive(undefined)}
          />
        )}
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
  const trigger = useRef<HTMLButtonElement>(null);
  const entryX = useRef<number | undefined>(undefined);
  const focusFirst = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cancelClose = () => clearTimeout(closeTimer.current);
  useLayoutEffect(() => cancelClose, []);
  const accessibleLabel = menuLabel || tr("{0}组件", label);
  const setContent = controller?.setContent;
  useLayoutEffect(() => {
    if (!open || !setContent) return;
    const content = {
      id,
      trigger,
      focusFirst,
      label: accessibleLabel,
      children,
    };
    setContent(content);
    return () =>
      setContent((current) => (current === content ? undefined : current));
  }, [id, open, setContent, accessibleLabel, children]);
  const openMenu = (focus: boolean) => {
    if (open && focus) {
      document
        .getElementById(id + "-menu")
        ?.querySelector<HTMLButtonElement>("button:enabled")
        ?.focus();
    } else {
      focusFirst.current = focus;
    }
    setOpen(true);
  };
  const close = () => {
    cancelClose();
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="context-submenu-host"
      onPointerEnter={(e) => {
        if (controller) return;
        cancelClose();
        if (e.pointerType === "touch") return;
        if (!disabled) {
          if (!open) entryX.current = e.clientX;
          setOpen(true);
        }
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        if (!controller && !disabled && !open) {
          cancelClose();
          setOpen(true);
        }
      }}
      onPointerLeave={(e) => {
        if (controller || e.pointerType === "touch") return;
        cancelClose();
        closeTimer.current = setTimeout(() => setOpen(false), 150);
      }}
    >
      <button
        ref={trigger}
        id={id}
        role={buttonRole}
        className={buttonClassName}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id + "-menu" : undefined}
        onClick={(e) => {
          cancelClose();
          openMenu(!e.detail);
        }}
        onKeyDown={(e) => {
          const settings = !!trigger.current?.closest(".settings-popover");
          if (
            e.key === "ArrowRight" ||
            (settings ? e.key === "ArrowLeft" : e.key === "ArrowDown")
          ) {
            e.preventDefault();
            e.stopPropagation();
            openMenu(true);
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
      {open && !controller && (
        <SubmenuPanel
          content={{
            id,
            trigger,
            focusFirst,
            label: accessibleLabel,
            children,
          }}
          entryX={entryX}
          onClose={() => setLocalOpen(false)}
        />
      )}
    </div>
  );
}

function SubmenuPanel({
  content: { id, trigger, focusFirst, label, children },
  entryX,
  onClose,
}: {
  content: SubmenuContent;
  entryX?: RefObject<number | undefined>;
  onClose: () => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [bridge, setBridge] = useState<CSSProperties>();
  useLayoutEffect(() => {
    layer.current?.showPopover();
  }, []);
  useLayoutEffect(() => {
    const settings = trigger.current?.closest(".settings-popover");
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "closed") onClose();
    };
    settings?.addEventListener("beforetoggle", onToggle);
    return () => settings?.removeEventListener("beforetoggle", onToggle);
  }, [trigger, onClose]);
  useLayoutEffect(() => {
    const sizeSource = inner.current ?? submenu.current;
    if (!sizeSource) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const element = submenu.current;
      if (!anchor || !element) return;
      const bounds = sizeSource.getBoundingClientRect();
      const width = bounds.width + (inner.current ? 2 * element.clientLeft : 0);
      const height =
        bounds.height + (inner.current ? 2 * element.clientTop : 0);
      const parent =
        trigger.current
          ?.closest(".context-menu, .settings-popover")
          ?.getBoundingClientRect() ?? anchor;
      const inset =
        element.clientTop + parseFloat(getComputedStyle(sizeSource).paddingTop);
      const gap = entryX ? 8 : -10;
      const preferred = parent.right + gap;
      const below =
        preferred + width > innerWidth - 8 && parent.left - width - gap < 8;
      const opensRight = preferred + width <= innerWidth - 8;
      const x = Math.max(
        8,
        Math.min(
          below
            ? anchor.left
            : opensRight
              ? preferred
              : parent.left - width - gap,
          innerWidth - width - 8,
        ),
      );
      const y = Math.max(
        8,
        Math.min(
          below
            ? anchor.bottom + 8 + height <= innerHeight - 8
              ? anchor.bottom + 8
              : anchor.top - height - 8
            : anchor.top - inset,
          innerHeight - height - 8,
        ),
      );
      let bridge: CSSProperties | undefined;
      if (below) {
        const left = Math.max(x, anchor.left);
        bridge = {
          left,
          width: Math.max(0, Math.min(x + width, anchor.right) - left),
          top: y >= anchor.bottom ? anchor.bottom : y + height,
          height: Math.max(0, y - anchor.bottom, anchor.top - y - height),
        };
      } else if (entryX) {
        // Standalone settings submenus span a gap between the two panels.
        const top = Math.min(y, anchor.top);
        const edge = opensRight ? anchor.right : anchor.left;
        const entry = Math.max(
          anchor.left,
          Math.min(
            anchor.right,
            entryX.current ?? (anchor.left + anchor.right) / 2,
          ),
        );
        const start = opensRight
          ? Math.min(edge, entry + 8)
          : Math.max(edge, entry - 8);
        const end = opensRight ? x : x + width;
        const left = Math.min(start, end);
        const point = (px: number, py: number) =>
          `${px - left}px ${py - top}px`;
        bridge = {
          left,
          top,
          width: Math.abs(end - start),
          height: Math.max(anchor.bottom, y + height) - top,
          clipPath: `polygon(${[
            point(start, anchor.top),
            point(end, y),
            point(end, y + height),
            point(start, anchor.bottom),
            point(edge, anchor.bottom),
            point(edge, anchor.top),
          ].join(", ")})`,
        };
      }
      if (inner.current) {
        // Measure the intrinsic content independently of the animating shell.
        element.classList.toggle("submenu-morphing", !!element.style.left);
        element.style.width = width + "px";
        element.style.height = height + "px";
      }
      element.style.left = x + "px";
      element.style.top = y + "px";
      setBridge(bridge);
      if (focusFirst.current) {
        submenu.current
          ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
          ?.focus();
        focusFirst.current = false;
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(sizeSource);
    window.addEventListener("resize", place);
    const panel = trigger.current?.closest(".settings-popover, .context-menu");
    panel?.addEventListener("scroll", place);
    return () => {
      panel?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      observer.disconnect();
    };
  }, [trigger, children, entryX, focusFirst]);
  return (
    <div ref={layer} popover="manual" className="submenu-layer">
      {bridge && (
        <span aria-hidden="true" className="submenu-bridge" style={bridge} />
      )}
      <div
        ref={submenu}
        id={id + "-menu"}
        className={
          "context-menu context-submenu" + (entryX ? "" : " shared-submenu")
        }
        role="menu"
        aria-label={label}
        onKeyDown={(e) => {
          if (
            ["Escape", "ArrowLeft"].includes(e.key) ||
            (e.key === "ArrowRight" &&
              trigger.current?.closest(".settings-popover"))
          ) {
            e.stopPropagation();
            e.preventDefault();
            onClose();
            trigger.current?.focus();
            return;
          }
          navigateMenu(e);
        }}
      >
        {entryX ? (
          children
        ) : (
          <div key={id} ref={inner} className="submenu-content">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

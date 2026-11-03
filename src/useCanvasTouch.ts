import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import type { View } from "./storage";
type Point = { x: number; y: number };
type Contact = Point & { start: Point; target: Element; moved: boolean };
type Context = {
  kind: "card" | "group" | "canvas";
  id: string;
  x: number;
  y: number;
};
const controls =
  "button:not(.group-title):not(.vscode-pill),input,textarea,select,a,[contenteditable=true],.connection-label-editor,.resize-handle";
function scrollParent(
  target: Element,
  surface: HTMLElement,
): HTMLElement | undefined {
  for (
    let el = target as HTMLElement | null;
    el && el !== surface;
    el = el.parentElement
  ) {
    const css = getComputedStyle(el);
    if (
      (/auto|scroll/.test(css.overflowY) &&
        el.scrollHeight > el.clientHeight + 1) ||
      (/auto|scroll/.test(css.overflowX) && el.scrollWidth > el.clientWidth + 1)
    )
      return el;
  }
}
export function useCanvasTouch(options: {
  scope: string;
  surface: RefObject<HTMLDivElement | null>;
  view: View;
  tapsEnabled: boolean;
  minZoom?: number;
  onViewChange: (view: View) => void;
  onCancel: () => void;
  onActivity: (moved: boolean) => void;
  onMenu: (context: Context) => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const contacts = useRef(new Map<number, Contact>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const locked = useRef(false),
    pressed = useRef(false),
    ignoreClick = useRef(0);
  const pinch = useRef<
    { view: View; distance: number; anchor: Point } | undefined
  >(undefined);
  const scroll = useRef<
    { element: HTMLElement; x: number; y: number; scale: number } | undefined
  >(undefined);
  const lastTap = useRef<
    { time: number; point: Point; target: Element } | undefined
  >(undefined);
  const lastTouch = useRef(-Infinity);
  const synthetic = useRef(false);
  const clearTimer = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  const clear = () => {
    clearTimer();
    contacts.current.clear();
    locked.current = false;
    pressed.current = false;
    pinch.current = undefined;
    scroll.current = undefined;
    lastTap.current = undefined;
  };
  useEffect(() => {
    const cancel = () => {
      if (contacts.current.size) latest.current.onCancel();
      clear();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [options.scope]);
  const consume = (e: ReactPointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return false;
    lastTouch.current = performance.now();
    const target = e.target as Element;
    if (!contacts.current.size) ignoreClick.current = 0;
    if (target.closest("input,textarea,select,[contenteditable=true],iframe")) {
      lastTap.current = undefined;
      // Mobile browsers can consume the first compatibility click after a swipe.
      // Focus in the trusted touch event so the software keyboard still opens.
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        if (!target.disabled) target.focus({ preventScroll: true });
      }
      return false;
    }
    const p = { x: e.clientX, y: e.clientY };
    const previous = lastTap.current;
    if (
      !target.closest(controls) &&
      previous &&
      performance.now() - previous.time < 360 &&
      Math.hypot(p.x - previous.point.x, p.y - previous.point.y) < 24
    ) {
      // Prevent compatibility mousedown from blurring the editor opened by this double tap.
      e.preventDefault();
    }
    if (!contacts.current.size) {
      ignoreClick.current = 0;
      pressed.current = false;
      latest.current.onActivity(false);
    }
    contacts.current.set(e.pointerId, { ...p, start: p, target, moved: false });
    if (contacts.current.size >= 2) {
      clearTimer();
      lastTap.current = undefined;
      scroll.current = undefined;
      latest.current.onCancel();
      latest.current.onActivity(true);
      locked.current = true;
      const [a, b] = [...contacts.current.values()];
      const view = latest.current.view,
        r = e.currentTarget.getBoundingClientRect();
      pinch.current = {
        view,
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        anchor: {
          x: ((a.x + b.x) / 2 - r.left - view.x) / view.z,
          y: ((a.y + b.y) / 2 - r.top - view.y) / view.z,
        },
      };
      // Transferring capture also cancels any pending paint stroke.
      for (const id of contacts.current.keys())
        e.currentTarget.setPointerCapture(id);
      consume(e);
      return true;
    }
    if (locked.current) {
      consume(e);
      return true;
    }
    const element =
      !target.closest(controls) && scrollParent(target, e.currentTarget);
    if (element) {
      scroll.current = {
        element,
        x: element.scrollLeft,
        y: element.scrollTop,
        scale: element.getBoundingClientRect().width / element.offsetWidth || 1,
      };
      // No preventDefault here: taps and text selection retain their normal behavior.
      e.stopPropagation();
      return true;
    }
    if (
      latest.current.tapsEnabled &&
      !target.closest(
        `${controls},.agent-messages,.agent-settings,.canvas-editor`,
      )
    ) {
      clearTimer();
      timer.current = setTimeout(() => {
        const contact = contacts.current.get(e.pointerId);
        if (
          !contact ||
          !target.isConnected ||
          contact.moved ||
          contacts.current.size !== 1
        )
          return;
        latest.current.onCancel();
        latest.current.onActivity(true);
        pressed.current = true;
        ignoreClick.current = performance.now() + 900;
        lastTap.current = undefined;
        const card = target.closest<HTMLElement>(
            "[data-card-id],[data-context-card-id]",
          ),
          group = target.closest<HTMLElement>("[data-group-id]");
        latest.current.onMenu({
          ...p,
          kind: card ? "card" : group ? "group" : "canvas",
          id:
            card?.dataset.cardId ||
            card?.dataset.contextCardId ||
            group?.dataset.groupId ||
            "",
        });
      }, 550);
    }
    return false;
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const contact = contacts.current.get(e.pointerId);
    if (e.pointerType !== "touch" || !contact) return false;
    contact.x = e.clientX;
    contact.y = e.clientY;
    if (
      Math.hypot(contact.x - contact.start.x, contact.y - contact.start.y) > 8
    ) {
      contact.moved = true;
      clearTimer();
      lastTap.current = undefined;
    }
    if (locked.current) {
      const p = pinch.current;
      if (contacts.current.size >= 2 && p) {
        const [a, b] = [...contacts.current.values()],
          r = e.currentTarget.getBoundingClientRect();
        const z = Math.min(
          3,
          Math.max(
            latest.current.minZoom ?? 0.2,
            (p.view.z * Math.hypot(a.x - b.x, a.y - b.y)) / p.distance,
          ),
        );
        latest.current.onViewChange({
          x: (a.x + b.x) / 2 - r.left - p.anchor.x * z,
          y: (a.y + b.y) / 2 - r.top - p.anchor.y * z,
          z,
        });
      }
      consume(e);
      return true;
    }
    if (pressed.current) {
      consume(e);
      return true;
    }
    if (scroll.current) {
      if (contact.moved) {
        const s = scroll.current;
        s.element.scrollLeft = s.x - (contact.x - contact.start.x) / s.scale;
        s.element.scrollTop = s.y - (contact.y - contact.start.y) / s.scale;
        latest.current.onActivity(true);
        ignoreClick.current = performance.now() + 700;
        e.currentTarget.setPointerCapture(e.pointerId);
        consume(e);
      } else e.stopPropagation();
      return true;
    }
    return false;
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const contact = contacts.current.get(e.pointerId);
    if (e.pointerType !== "touch" || !contact) return false;
    lastTouch.current = performance.now();
    clearTimer();
    contacts.current.delete(e.pointerId);
    const handled = locked.current || pressed.current || !!scroll.current;
    if (locked.current && contacts.current.size >= 2) {
      const [a, b] = [...contacts.current.values()],
        r = e.currentTarget.getBoundingClientRect(),
        view = latest.current.view;
      pinch.current = {
        view,
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        anchor: {
          x: ((a.x + b.x) / 2 - r.left - view.x) / view.z,
          y: ((a.y + b.y) / 2 - r.top - view.y) / view.z,
        },
      };
    }
    if (handled) {
      if (locked.current || pressed.current || contact.moved)
        ignoreClick.current = performance.now() + 700;
      if (!contacts.current.size) {
        locked.current = false;
        pressed.current = false;
        pinch.current = undefined;
        scroll.current = undefined;
      }
      e.stopPropagation();
      return true;
    }
    if (
      e.type !== "pointercancel" &&
      !contact.moved &&
      latest.current.tapsEnabled &&
      !contact.target.closest(`${controls},.agent-card,.canvas-editor`)
    ) {
      const previous = lastTap.current,
        now = performance.now();
      const context = (target: Element) =>
        target.closest("[data-card-id],[data-group-id],[data-connection-id]") ||
        latest.current.surface.current;
      if (
        previous &&
        now - previous.time < 360 &&
        Math.hypot(contact.x - previous.point.x, contact.y - previous.point.y) <
          24 &&
        context(previous.target) === context(contact.target)
      ) {
        lastTap.current = undefined;
        ignoreClick.current = now + 700;
        const target = contact.target,
          x = e.clientX,
          y = e.clientY;
        queueMicrotask(() => {
          if (!target.isConnected) return;
          synthetic.current = true;
          target.dispatchEvent(
            new MouseEvent("dblclick", {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: x,
              clientY: y,
              detail: 2,
            }),
          );
          synthetic.current = false;
        });
      } else
        lastTap.current = {
          time: now,
          point: { x: contact.x, y: contact.y },
          target: contact.target,
        };
    } else lastTap.current = undefined;
    return false;
  };
  return {
    down,
    move,
    up,
    click: (e: ReactMouseEvent) => {
      if (performance.now() < ignoreClick.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    doubleClick: (e: ReactMouseEvent) => {
      if (!synthetic.current && performance.now() - lastTouch.current < 900) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    context: (e: ReactMouseEvent) => {
      if (
        contacts.current.size &&
        !(e.target as Element).closest(
          "input,textarea,[contenteditable=true],.agent-messages",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
      return false;
    },
    lostCapture: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && contacts.current.has(e.pointerId)) {
        latest.current.onCancel();
        clear();
      }
    },
  };
}

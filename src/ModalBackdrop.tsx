import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from "react";

const tabbable =
  'button, a[href], input, textarea, select, [tabindex], [contenteditable="true"]';

export function ModalBackdrop({
  children,
  className = "modal-backdrop",
  ...props
}: ComponentPropsWithoutRef<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement);
  useLayoutEffect(() => {
    const overlay = ref.current!;
    const controls = () =>
      [...overlay.querySelectorAll<HTMLElement>(tabbable)].filter(
        (el) =>
          el.tabIndex >= 0 &&
          !el.matches(":disabled") &&
          !el.closest("[inert]") &&
          el.checkVisibility(),
      );
    const enter = () =>
      (controls()[0] || overlay).focus({ preventScroll: true });
    if (!overlay.contains(document.activeElement)) enter();
    const top = () =>
      !document.querySelector("dialog:modal") &&
      [...document.querySelectorAll(".modal-backdrop")].at(-1) === overlay;
    const focus = (e: FocusEvent) => {
      if (top() && !overlay.contains(e.target as Node)) enter();
    };
    const tab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !top()) return;
      const items = controls();
      if (
        !items.length ||
        document.activeElement === (e.shiftKey ? items[0] : items.at(-1))
      ) {
        e.preventDefault();
        (e.shiftKey ? items.at(-1) : items[0])?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", tab, true);
    const previous = opener.current;
    const returnTarget =
      previous instanceof HTMLElement && previous.closest(".settings-popover")
        ? document.querySelector<HTMLElement>(".settings-trigger")
        : previous;
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", tab, true);
      if (
        returnTarget instanceof HTMLElement &&
        returnTarget.isConnected &&
        (overlay.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        returnTarget.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <div {...props} ref={ref} className={className} tabIndex={-1}>
      {children}
    </div>
  );
}

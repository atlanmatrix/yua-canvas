import { isVisible } from "./menuKeyboard";

// A single top-layer hint also works for controls inside clipped toolbars.
export function installTooltips() {
  const hint = document.createElement("div");
  hint.id = "canvas-control-hint";
  hint.className = "control-tooltip";
  hint.popover = "manual";
  hint.setAttribute("role", "tooltip");
  let anchor: HTMLElement | undefined;
  let timer: number | undefined;
  const hide = () => {
    clearTimeout(timer);
    if (anchor) {
      const ids = anchor
        .getAttribute("aria-describedby")
        ?.split(/\s+/)
        .filter((id) => id !== hint.id)
        .join(" ");
      if (ids) anchor.setAttribute("aria-describedby", ids);
      else anchor.removeAttribute("aria-describedby");
    }
    hint.remove();
    anchor = undefined;
  };
  const show = (target: HTMLElement, delay: number) => {
    hide();
    anchor = target;
    timer = window.setTimeout(() => {
      if (!isVisible(target) || target.closest("[inert]")) return hide();
      hint.textContent = target.dataset.tooltip || "";
      (target.closest("dialog:modal, :popover-open") || document.body).append(
        hint,
      );
      try {
        hint.showPopover?.();
      } catch {}
      const box = target.getBoundingClientRect();
      const { width, height } = hint.getBoundingClientRect();
      const left = Math.min(
        innerWidth - width - 8,
        box.left + (box.width - width) / 2,
      );
      const top =
        box.top >= height + 16 ? box.top - height - 8 : box.bottom + 8;
      hint.style.left = Math.max(8, left) + "px";
      hint.style.top =
        Math.max(8, Math.min(innerHeight - height - 8, top)) + "px";
      target.setAttribute(
        "aria-describedby",
        [target.getAttribute("aria-describedby"), hint.id]
          .filter(Boolean)
          .join(" "),
      );
    }, delay);
  };
  const control = (node: EventTarget | null) =>
    node instanceof Element
      ? node.closest<HTMLElement>("[data-tooltip]:not(:disabled)")
      : null;
  const over = (event: PointerEvent) => {
    const target = control(event.target);
    if (
      event.pointerType !== "touch" &&
      !event.buttons &&
      target &&
      target !== anchor
    )
      show(target, 350);
  };
  const out = (event: PointerEvent | FocusEvent) => {
    if (
      anchor &&
      control(event.target) === anchor &&
      control(event.relatedTarget) !== anchor
    )
      hide();
  };
  const focus = (event: FocusEvent) => {
    const target = control(event.target);
    if (target?.matches(":focus-visible")) show(target, 0);
  };
  const abort = new AbortController();
  const options = { capture: true, signal: abort.signal };
  document.addEventListener("pointerover", over, options);
  document.addEventListener("pointerout", out, options);
  document.addEventListener("focusin", focus, options);
  document.addEventListener("focusout", out, options);
  document.addEventListener("pointerdown", hide, options);
  document.addEventListener("keydown", hide, options);
  document.addEventListener("scroll", hide, options);
  window.addEventListener("blur", hide, options);
  window.addEventListener("resize", hide, options);
  return () => {
    abort.abort();
    hide();
  };
}

import type { KeyboardEvent } from "react";

// Leave sliders and text fields to the browser. Nested menus handle their own keys.
export function navigateMenu(event: KeyboardEvent<HTMLElement>) {
  const { key, currentTarget, target } = event;
  if (
    !["ArrowUp", "ArrowDown", "Home", "End"].includes(key) ||
    !(target instanceof HTMLElement) ||
    target.matches("input, textarea, select")
  )
    return;
  const items = [
    ...currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ),
  ].filter(
    (el) =>
      el.checkVisibility() &&
      el.closest('[role="menu"], .settings-popover') === currentTarget,
  );
  if (!items.length) return;
  const i = items.indexOf(target as HTMLButtonElement);
  const next =
    key === "Home"
      ? 0
      : key === "End"
        ? items.length - 1
        : (i + (key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
  event.preventDefault();
  event.stopPropagation();
  items[next].focus();
}

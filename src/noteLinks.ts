import type { CSSProperties } from "react";
import type { TextStyle } from "./presentation";
import type { Card } from "./storage";

export const addressLayout = {
  icon: 32,
  inset: 4,
  end: 14,
  gap: 10,
  border: 1,
} as const;
export const addressStyle = {
  "--address-icon": `${addressLayout.icon}px`,
  "--address-inset": `${addressLayout.inset}px`,
  "--address-end": `${addressLayout.end}px`,
  "--address-gap": `${addressLayout.gap}px`,
  "--address-border": `${addressLayout.border}px`,
} as CSSProperties;

export const NOTE_LINK_TEXT_STYLE = {
  fontFamily: "system-ui",
  fontSize: 13,
} satisfies TextStyle;

export function noteCardHref(
  card: Partial<
    Pick<
      Card,
      "kind" | "text" | "locked" | "masked" | "displayMode" | "linkDisabled"
    >
  >,
) {
  if (
    card.kind === "text" &&
    !card.locked &&
    !card.masked &&
    card.displayMode !== "small"
  )
    return linkTarget(card.text || "", card.linkDisabled);
}

export function linkTarget(text: string, disabled = false): string | undefined {
  const value = text.trim();
  if (disabled || !value || /[\s<>]/u.test(value)) return;
  const email = value.replace(/^mailto:/i, "");
  const match =
    /^([a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/i.exec(
      email,
    );
  if (match && match[1].length <= 64 && email.length <= 254)
    return `mailto:${encodeURIComponent(match[1]).replaceAll("%2B", "+")}@${match[2]}`;
  if (!/^(?:https?:|www\.)/i.test(value)) return;
  try {
    const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
    if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname)
      return url.href;
  } catch {
    /* Other text has no link destination. */
  }
}

export function openLink(href: string) {
  if (href.startsWith("mailto:")) window.location.href = href;
  else window.open(href, "_blank", "noopener,noreferrer");
}

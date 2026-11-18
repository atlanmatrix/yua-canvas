export const NOTE_LINK_PREFIX_WIDTH = 24;

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

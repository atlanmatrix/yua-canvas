export const MINIATURE_EXAMPLE = {
  title: "被自然收回的城市街角",
  src: "https://atlanmatrix.github.io/codex-playground/city/",
};

export function miniatureUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return;
    return url.href;
  } catch {
    return;
  }
}

export function miniatureViewUrl(
  source: string,
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return;
  const base = miniatureUrl(source),
    candidate = miniatureUrl(value);
  if (!base || !candidate) return;
  const expected = new URL(base),
    url = new URL(candidate);
  if (
    url.origin !== expected.origin ||
    url.pathname.replace(/\/$/, "") !== expected.pathname.replace(/\/$/, "")
  )
    return;
  for (const key of ["parentOrigin", "screenshot", "preview"])
    url.searchParams.delete(key);
  return url.href;
}

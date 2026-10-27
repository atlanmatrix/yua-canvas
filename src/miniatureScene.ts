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

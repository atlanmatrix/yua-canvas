// Keep canvas routes in the query string so static hosting subpaths and the
// existing share / 3D hash routes continue to work.
export function readCanvasPath(): string[] | undefined {
  const value = new URL(location.href).searchParams.get("canvas");
  if (value === null) return undefined;
  try {
    return value ? value.split("/").map(decodeURIComponent) : [];
  } catch {
    return [];
  }
}

export function writeCanvasPath(path: string[], push = false) {
  const url = new URL(location.href);
  url.searchParams.set("canvas", path.map(encodeURIComponent).join("/"));
  if (url.href === location.href) return;
  if (push) history.pushState(history.state, "", url);
  else history.replaceState(history.state, "", url);
}

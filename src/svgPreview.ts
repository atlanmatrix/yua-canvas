// Reused SVG layouts need instance-local IDs: markers, clip paths and Mermaid's
// scoped styles must keep working when another copy leaves the viewport.
export function instantiateSvg(source: string, prefix: string) {
  if (!source) return "";
  const root = new DOMParser().parseFromString(
    source,
    "image/svg+xml",
  ).documentElement;
  const ids = new Map<string, string>();
  for (const element of [root, ...root.querySelectorAll("[id]")]) {
    const id = element.getAttribute("id");
    if (id) {
      const next = `${prefix}-${id}`;
      ids.set(id, next);
      element.setAttribute("id", next);
    }
  }
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name === "id") continue;
      let value = attribute.value.replace(
        /url\(\s*(["']?)#([^)'"\s]+)\1\s*\)/g,
        (match, quote, id) => (ids.has(id) ? `url(#${ids.get(id)})` : match),
      );
      if (
        ["href", "xlink:href"].includes(attribute.name) &&
        value.startsWith("#") &&
        ids.has(value.slice(1))
      )
        value = `#${ids.get(value.slice(1))}`;
      if (["aria-labelledby", "aria-describedby"].includes(attribute.name))
        value = value
          .split(/\s+/)
          .map((id) => ids.get(id) || id)
          .join(" ");
      if (value !== attribute.value)
        element.setAttribute(attribute.name, value);
    }
  }
  for (const style of root.querySelectorAll("style")) {
    let css = style.textContent || "";
    for (const [id, next] of ids) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      css = css.replace(new RegExp(`#${escaped}(?![\\w-])`, "g"), `#${next}`);
    }
    style.textContent = css;
  }
  return root.outerHTML;
}

import { PreviewCache, previewMetrics } from "./previewCache";
const trees = new PreviewCache<string, { id: number; tree: unknown }>(
  24 * 1024 * 1024,
  64,
);
let sequence = 0;
// react-markdown installs remark-parse before user plugins. Reuse its parser
// with the same GFM extensions, cloning cached trees before downstream transforms.
export function cachedMarkdownParser(this: any) {
  const parser = this.parser;
  this.parser = (source: string, file: any) => {
    let entry = trees.get(source);
    if (!entry) {
      previewMetrics.markdownParses++;
      entry = { id: ++sequence, tree: parser(source, file) };
      trees.set(source, entry, source.length * 12);
    }
    file.data.previewSource = entry.id;
    return structuredClone(entry.tree);
  };
}
export function virtualMarkdownChunks() {
  return (tree: any, file: any) => {
    const elements = tree.children.filter(
      (node: any) => node.type === "element",
    );
    if (elements.length <= 64) return;
    const groups: any[][] = [];
    let current: any[] = [],
      count = 0;
    for (const node of tree.children) {
      current.push(node);
      if (node.type === "element" && ++count === 8) {
        groups.push(current);
        current = [];
        count = 0;
      }
    }
    if (current.some((node) => node.type === "element")) groups.push(current);
    else if (current.length) groups.at(-1)?.push(...current);
    tree.children = groups.map((children, index) => {
      let lines = 0;
      const anchors: string[] = [];
      const scan = (node: any) => {
        if (node.properties?.id) anchors.push(String(node.properties.id));
        node.children?.forEach(scan);
      };
      for (const node of children) {
        if (node.type === "element")
          lines += Math.max(
            2,
            (node.position?.end?.line || 1) -
              (node.position?.start?.line || 1) +
              2,
          );
        scan(node);
      }
      return {
        type: "element",
        tagName: "markdown-chunk",
        properties: {
          "data-preview-id": `${file.data.previewSource}:${index}`,
          "data-preview-height": Math.max(120, Math.min(2400, lines * 24)),
          "data-preview-anchors": JSON.stringify(anchors),
        },
        children,
      };
    });
  };
}

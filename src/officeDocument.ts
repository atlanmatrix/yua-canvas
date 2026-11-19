import { unzip, zip, type Unzipped } from "fflate";
import { officeMimes, type OfficeKind } from "./files";
import {
  officeMainPart,
  officeRelations,
  officeXml,
  serializeOfficeXml,
} from "./officePackage";

type TextSpan = {
  type: "text";
  key: string;
  value: string;
  runs: number[];
  paragraph: number;
};
type Span =
  TextSpan | { type: "break" | "tab" } | { type: "image"; blob: Blob };
export type OfficeParagraph = { title: boolean; spans: Span[] };
export type OfficePage = {
  path: string;
  paragraphs: OfficeParagraph[];
  namespace: string;
  layout?: {
    ratio: number;
    shapes: {
      x: number;
      y: number;
      width: number;
      height: number;
      start: number;
      end: number;
    }[];
  };
};
export type OfficeDocument = Awaited<ReturnType<typeof parseOffice>>;
const imageTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

function relationship(el: Element, name: string) {
  return Array.from(el.attributes).find(
    (attr) =>
      attr.localName === name && attr.namespaceURI?.endsWith("/relationships"),
  )?.value;
}

function shapeBox(shape: Element) {
  const xfrm =
    Array.from(shape.children).find((child) => child.localName === "xfrm") ??
    Array.from(shape.children)
      .find((child) => child.localName === "spPr")
      ?.getElementsByTagNameNS("*", "xfrm")[0];
  const offset = xfrm?.getElementsByTagNameNS("*", "off")[0];
  const extent = xfrm?.getElementsByTagNameNS("*", "ext")[0];
  if (!offset || !extent) return;
  const width = Number(extent.getAttribute("cx")),
    height = Number(extent.getAttribute("cy"));
  if (width > 0 && height > 0)
    return {
      x: Number(offset.getAttribute("x")),
      y: Number(offset.getAttribute("y")),
      width,
      height,
    };
}

function readPage(
  parts: Unzipped,
  path: string,
  kind: OfficeKind,
  slideSize?: { width: number; height: number },
): OfficePage {
  const doc = officeXml(parts, path);
  const word = kind === "docx";
  const root = doc.documentElement;
  const expected = word ? "document" : "sld";
  if (root.localName !== expected) throw Error("Invalid Office document");
  const namespace = word
    ? root.namespaceURI!
    : root.lookupNamespaceURI("a") ||
      (root.namespaceURI?.startsWith("http://purl.oclc.org/")
        ? "http://purl.oclc.org/ooxml/drawingml/main"
        : "http://schemas.openxmlformats.org/drawingml/2006/main");
  const runs = Array.from(doc.getElementsByTagNameNS(namespace, "t"));
  const runIds = new Map(runs.map((run, i) => [run, i]));
  const allParagraphs = Array.from(doc.getElementsByTagNameNS(namespace, "p"));
  const paragraphIds = new Map(allParagraphs.map((p, i) => [p, i]));
  const relations = officeRelations(parts, path);
  const images = new Map<string, Blob>();
  const paragraphs: OfficeParagraph[] = [];
  function visit(node: Element, block?: OfficeParagraph, paragraph = -1) {
    if (["del", "Fallback", "pPr", "rPr"].includes(node.localName)) return;
    if (paragraphIds.has(node)) {
      paragraph = paragraphIds.get(node)!;
      const style = node.getElementsByTagNameNS(namespace, "pStyle")[0];
      const styleName =
        style &&
        Array.from(style.attributes).find((a) => a.localName === "val")?.value;
      let ancestor: Element | null = node;
      while (ancestor && ancestor.localName !== "sp")
        ancestor = ancestor.parentElement;
      const placeholder = ancestor
        ?.getElementsByTagNameNS("*", "ph")[0]
        ?.getAttribute("type");
      block = {
        title: word
          ? /^(title|heading1|标题1)$/i.test(styleName || "")
          : ["title", "ctrTitle"].includes(placeholder || ""),
        spans: [],
      };
      paragraphs.push(block);
      for (const child of node.children) visit(child, block, paragraph);
      if (!block.spans.length)
        block.spans.push({
          type: "text",
          value: "",
          key: path + "#p" + paragraph,
          runs: [],
          paragraph,
        });
      return;
    }
    if (node.localName === "blip") {
      const id = relationship(node, "embed");
      const file = id && relations.find((r) => r.id === id)?.path;
      const mime = file && imageTypes[file.split(".").pop()!.toLowerCase()];
      if (!file || !mime || !parts[file]) return;
      let blob = images.get(file);
      if (!blob) {
        blob = new Blob([new Uint8Array(parts[file])], { type: mime });
        images.set(file, blob);
      }
      if (!block)
        paragraphs.push({ title: false, spans: [{ type: "image", blob }] });
      else block.spans.push({ type: "image", blob });
      return;
    }
    if (block && node.namespaceURI === namespace) {
      if (node.localName === "t") {
        const index = runIds.get(node)!;
        const previous = block.spans.at(-1);
        if (previous?.type === "text") {
          previous.runs.push(index);
          previous.value += node.textContent || "";
        } else
          block.spans.push({
            type: "text",
            value: node.textContent || "",
            key: path + "#t" + index,
            runs: [index],
            paragraph,
          });
        return;
      }
      if (node.localName === "br" || node.localName === "cr")
        block.spans.push({ type: "break" });
      else if (
        node.localName === "tab" &&
        node.parentElement?.localName === "r"
      )
        block.spans.push({ type: "tab" });
    }
    for (const child of node.children) visit(child, block, paragraph);
  }
  let layout: OfficePage["layout"];
  const tree = root.getElementsByTagNameNS("*", "spTree")[0];
  if (slideSize && tree) {
    const shapes: NonNullable<OfficePage["layout"]>["shapes"] = [];
    const layoutPart = relations.find((r) =>
      r.type?.endsWith("/slideLayout"),
    )?.path;
    const placeholders =
      layoutPart && parts[layoutPart]
        ? Array.from(
            officeXml(parts, layoutPart).getElementsByTagNameNS("*", "sp"),
          )
        : [];
    const masterPart =
      layoutPart &&
      officeRelations(parts, layoutPart).find((r) =>
        r.type?.endsWith("/slideMaster"),
      )?.path;
    const masterShapes =
      masterPart && parts[masterPart]
        ? Array.from(
            officeXml(parts, masterPart).getElementsByTagNameNS("*", "sp"),
          )
        : [];
    let positioned = true;
    for (const shape of tree.children) {
      const start = paragraphs.length;
      visit(shape);
      if (start === paragraphs.length) continue;
      const ph = shape.getElementsByTagNameNS("*", "ph")[0];
      const inherited =
        ph &&
        placeholders.find((candidate) => {
          const other = candidate.getElementsByTagNameNS("*", "ph")[0];
          return (
            other &&
            (other.getAttribute("idx") || "0") ===
              (ph.getAttribute("idx") || "0")
          );
        });
      const placeholderType =
        inherited?.getElementsByTagNameNS("*", "ph")[0]?.getAttribute("type") ||
        ph?.getAttribute("type") ||
        "obj";
      const masterType =
        placeholderType === "ctrTitle"
          ? "title"
          : ["obj", "subTitle"].includes(placeholderType)
            ? "body"
            : placeholderType;
      const master =
        ph &&
        masterShapes.find(
          (candidate) =>
            candidate
              .getElementsByTagNameNS("*", "ph")[0]
              ?.getAttribute("type") === masterType,
        );
      const box =
        shapeBox(shape) ??
        (inherited && shapeBox(inherited)) ??
        (master && shapeBox(master));
      if (!box) {
        positioned = false;
        continue;
      }
      shapes.push({
        x: (100 * box.x) / slideSize.width,
        y: (100 * box.y) / slideSize.height,
        width: (100 * box.width) / slideSize.width,
        height: (100 * box.height) / slideSize.height,
        start,
        end: paragraphs.length,
      });
    }
    if (positioned && shapes.length)
      layout = { ratio: slideSize.width / slideSize.height, shapes };
  } else visit(root);
  return { path, namespace, paragraphs, layout };
}

async function parseOffice(blob: Blob, kind: OfficeKind) {
  const input = new Uint8Array(await blob.arrayBuffer());
  const parts = await new Promise<Unzipped>((resolve, reject) =>
    unzip(input, (err, result) => (err ? reject(err) : resolve(result))),
  );
  const main = officeMainPart(parts);
  let paths = [main];
  let size: { width: number; height: number } | undefined;
  if (kind === "pptx") {
    const doc = officeXml(parts, main);
    if (doc.documentElement.localName !== "presentation")
      throw Error("Invalid presentation");
    const dimensions = doc.getElementsByTagNameNS("*", "sldSz")[0];
    const width = Number(dimensions?.getAttribute("cx")),
      height = Number(dimensions?.getAttribute("cy"));
    if (width > 0 && height > 0) size = { width, height };
    const links = officeRelations(parts, main);
    paths = Array.from(doc.getElementsByTagNameNS("*", "sldId")).map(
      (slide) => {
        const id = relationship(slide, "id");
        const path = links.find(
          (r) => r.id === id && r.type?.endsWith("/slide"),
        )?.path;
        if (!path) throw Error("Invalid slide relationship");
        return path;
      },
    );
  }
  return {
    kind,
    parts,
    pages: paths.map((path) => readPage(parts, path, kind, size)),
  };
}
const cache = new WeakMap<
  Blob,
  { kind: OfficeKind; parsed: Promise<OfficeDocument> }
>();
export function loadOffice(blob: Blob, kind: OfficeKind) {
  const cached = cache.get(blob);
  if (cached?.kind === kind) return cached.parsed;
  const parsed = parseOffice(blob, kind);
  cache.set(blob, { kind, parsed });
  return parsed;
}

function writeRun(node: Element, value: string, kind: OfficeKind) {
  const lines = value.split(/\r\n?|\n/);
  const make = (local: string, from = node) =>
    node.ownerDocument.createElementNS(
      from.namespaceURI,
      from.prefix ? from.prefix + ":" + local : local,
    );
  const put = (text: Element, line: string) => {
    text.textContent = line;
    text.setAttributeNS(
      "http://www.w3.org/XML/1998/namespace",
      "xml:space",
      "preserve",
    );
  };
  put(node, lines[0]);
  let anchor = kind === "docx" ? node : node.parentElement!;
  for (const line of lines.slice(1)) {
    const text = make("t");
    put(text, line);
    if (kind === "docx") {
      anchor.after(make("br"), text);
      anchor = text;
    } else {
      const run = make("r");
      const style = node.parentElement?.getElementsByTagNameNS(
        node.namespaceURI,
        "rPr",
      )[0];
      if (style) run.append(style.cloneNode(true));
      run.append(text);
      anchor.after(make("br"), run);
      anchor = run;
    }
  }
}

// Apply only the changed substring, retaining unchanged prefixes/suffixes in
// their original styled runs and leaving other package parts byte-for-byte intact.
function replaceText(
  nodes: Element[],
  before: string,
  after: string,
  kind: OfficeKind,
) {
  let left = 0,
    right = 0;
  while (
    left < before.length &&
    left < after.length &&
    before[left] === after[left]
  )
    left++;
  while (
    right < before.length - left &&
    right < after.length - left &&
    before[before.length - 1 - right] === after[after.length - 1 - right]
  )
    right++;
  let offset = 0,
    inserted = false;
  const middle = after.slice(left, after.length - right);
  nodes.forEach((node, i) => {
    const value = node.textContent || "";
    const start = offset;
    offset += value.length;
    let next = value.slice(0, Math.max(0, left - start));
    if (!inserted && (left < offset || i === nodes.length - 1)) {
      next += middle;
      inserted = true;
    }
    next += value.slice(Math.max(0, before.length - right - start));
    if (next !== value) writeRun(node, next, kind);
  });
}
export async function saveOffice(
  model: OfficeDocument,
  edits: Map<string, string>,
) {
  const parts = { ...model.parts };
  for (const page of model.pages) {
    const changed = page.paragraphs
      .flatMap((p) => p.spans)
      .filter((s): s is TextSpan => s.type === "text" && edits.has(s.key));
    if (!changed.length) continue;
    const doc = officeXml(parts, page.path);
    const runs = Array.from(doc.getElementsByTagNameNS(page.namespace, "t"));
    const paragraphs = doc.getElementsByTagNameNS(page.namespace, "p");
    for (const span of changed) {
      const nodes = span.runs.map((i) => runs[i]);
      if (!nodes.length) {
        const p = paragraphs[span.paragraph];
        const make = (name: string) =>
          doc.createElementNS(
            page.namespace,
            p.prefix ? p.prefix + ":" + name : name,
          );
        const run = make("r"),
          text = make("t");
        run.append(text);
        p.insertBefore(
          run,
          Array.from(p.children).find((el) => el.localName === "endParaRPr") ??
            null,
        );
        nodes.push(text);
      }
      replaceText(nodes, span.value, edits.get(span.key)!, model.kind);
    }
    parts[page.path] = serializeOfficeXml(doc);
  }
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(parts, { level: 3 }, (err, result) =>
      err ? reject(err) : resolve(result),
    ),
  );
  return new Blob([new Uint8Array(bytes)], { type: officeMimes[model.kind] });
}

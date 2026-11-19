import { unzipSync, zipSync } from "fflate";
import {
  officeMainPart,
  officeRelations,
  officeXml,
  serializeOfficeXml,
} from "./officePackage";
import { xlsxMime } from "./files";

export type CellEdit = {
  row: number;
  column: number;
  value: string;
  original: unknown;
};

export function columnName(column: number): string {
  let name = "";
  for (let n = column + 1; n; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// Edit individual worksheet cells so other sheets, styles, drawings and workbook
// parts survive a save. All package paths are resolved inside the archive.
export async function writeCells(blob: Blob, edits: CellEdit[]) {
  const parts = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const elements = (node: Document | Element, tag: string) =>
    Array.from(node.getElementsByTagNameNS("*", tag));
  const bookPath = officeMainPart(parts);
  const book = officeXml(parts, bookPath);
  const first = elements(book, "sheet")[0];
  const id = Array.from(first.attributes).find(
    (attr) => attr.localName === "id",
  )?.value;
  const path = officeRelations(parts, bookPath).find(
    (rel) => id && rel.id === id,
  )?.path;
  if (!path) throw Error("Missing worksheet");
  const sheet = officeXml(parts, path);
  const ns = sheet.documentElement.namespaceURI;
  const make = (tag: string) => sheet.createElementNS(ns, tag);
  const data = elements(sheet, "sheetData")[0];
  if (!data || elements(sheet, "sheetProtection").length)
    throw Error("工作表受保护或无法编辑");
  const rowMap = new Map(
    elements(data, "row").map((row) => [Number(row.getAttribute("r")), row]),
  );
  for (const { row, column, value, original } of edits) {
    const index = row + 1;
    let line = rowMap.get(index);
    if (!line) {
      line = make("row");
      line.setAttribute("r", String(index));
      const after = Array.from(data.children).find(
        (el) => Number(el.getAttribute("r")) > index,
      );
      data.insertBefore(line, after ?? null);
      rowMap.set(index, line);
    }
    const address = columnName(column) + index;
    let cell = elements(line, "c").find((c) => c.getAttribute("r") === address);
    if (!cell) {
      cell = make("c");
      cell.setAttribute("r", address);
      const next = Array.from(line.children).find((el) => {
        const ref = el.getAttribute("r") || "";
        return (
          el.localName !== "c" ||
          ref.length > address.length ||
          (ref.length === address.length && ref > address)
        );
      });
      line.insertBefore(cell, next ?? null);
      line.removeAttribute("spans");
    }
    // Shared and array formulas can span several cells.
    if (elements(cell, "f").length) throw Error("公式单元格为只读");
    for (const child of Array.from(cell.children))
      if (["v", "is"].includes(child.localName)) child.remove();
    cell.removeAttribute("t");
    if (!value) continue;
    const numeric =
      typeof original !== "string" &&
      /^-?(0|[1-9]\d*)(\.\d+)?([Ee][+-]?\d+)?$/.test(value);
    const bool = typeof original === "boolean" && /^(true|false)$/i.test(value);
    const date =
      original instanceof Date &&
      /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) &&
      Number.isFinite(Date.parse(value));
    const element = make(numeric || bool || date ? "v" : "is");
    if (numeric || bool || date) {
      cell.setAttribute("t", date ? "d" : bool ? "b" : "n");
      element.textContent = bool
        ? String(Number(value.toLowerCase() === "true"))
        : value;
    } else {
      cell.setAttribute("t", "inlineStr");
      const text = make("t");
      text.setAttributeNS(
        "http://www.w3.org/XML/1998/namespace",
        "xml:space",
        "preserve",
      );
      text.textContent = value.replace(
        /_x[\da-f]{4}_/gi,
        (match) => "_x005F_" + match.slice(1),
      );
      element.append(text);
    }
    cell.insertBefore(element, cell.firstElementChild);
  }
  // Keep dimensions useful to streaming readers as well as Excel.
  const dimension = elements(sheet, "dimension")[0];
  if (dimension) {
    const bounds = (dimension.getAttribute("ref") || "")
      .split(":")
      .map((ref) => {
        const [, letters, row] = /^([A-Z]+)([0-9]+)$/.exec(ref) || [];
        const column = Array.from(letters || "A").reduce(
          (n, ch) => n * 26 + ch.charCodeAt(0) - 64,
          0,
        );
        return { row: Number(row || 1) - 1, column: column - 1 };
      });
    let { row: top, column: left } = bounds[0];
    let { row: bottom, column: right } = bounds[bounds.length - 1];
    for (const { row, column } of edits) {
      top = Math.min(top, row);
      left = Math.min(left, column);
      bottom = Math.max(bottom, row);
      right = Math.max(right, column);
    }
    dimension.setAttribute(
      "ref",
      columnName(left) + (top + 1) + ":" + columnName(right) + (bottom + 1),
    );
  }
  const calc = elements(book, "calcPr")[0];
  if (calc) calc.setAttribute("fullCalcOnLoad", "1");
  parts[path] = serializeOfficeXml(sheet);
  if (calc) parts[bookPath] = serializeOfficeXml(book);
  return new Blob([new Uint8Array(zipSync(parts, { level: 3 }))], {
    type: xlsxMime,
  });
}

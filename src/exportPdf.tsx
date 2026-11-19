import { toSvg } from "html-to-image";
import { PDFDocument } from "pdf-lib";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { StaticContent, presentationHidden } from "./CardPresentation";
import { isPdfFile, isTextFile } from "./clipboard";
import { sealBoard } from "./encryption";
import {
  ExportPreviewContext,
  FullContentExportContext,
} from "./ExportPreviewContext";
import { ExportMarks, waitForExportContent } from "./exportPng";
import { cardRect, documentLayout, documentReadingPreset } from "./geometry";
import { t as tr } from "./i18n";
import { StyledNoteText } from "./NoteText";
import { readPreviewText } from "./previewCache";
import { strokeBounds, textCss } from "./presentation";
import type { Board, Card, Rect } from "./storage";
import { TextFilePreview } from "./TextFilePreview";
import "./exportPdf.css";

function readingWidth(card: Card) {
  const expanded =
    card.displayMode === "small"
      ? { ...card, displayMode: "medium" as const }
      : card;
  const width = cardRect(expanded).width;
  const layout = documentLayout(expanded);
  return Math.max(1, layout ? width - 2 * (1 + layout.insetX) : width);
}

async function content(
  card: Card,
  width: number,
  url: (blob: Blob) => string,
): Promise<ReactNode> {
  if (card.masked) return tr("已遮罩");
  if (card.locked) return tr("已锁定组件");
  if (card.blob && isPdfFile(card)) {
    const { requestPdfPreview } = await import("./pdfPreviewCache");
    const pages: ReactNode[] = [];
    const signal = new AbortController().signal;
    let count = 1;
    for (let page = 1; page <= count; page++) {
      const bitmap = await requestPdfPreview(
        card.blob,
        page,
        width * 2,
        width * 3,
        signal,
      );
      pages.push(
        <img
          className="pdf-export-image"
          key={page}
          src={url(bitmap.blob)}
          alt=""
        />,
      );
      count = bitmap.pages;
    }
    return pages;
  }
  if (card.blob && card.kind === "file" && isTextFile(card))
    return (
      <TextFilePreview
        source={await readPreviewText(card.blob, card.blob.size)}
        name={card.title}
        mime={card.mime}
      />
    );
  if (card.blob && (card.kind === "image" || card.kind === "miniature"))
    return (
      <img className="pdf-export-image" src={url(card.blob)} alt={card.title} />
    );
  if (card.kind === "text")
    return (
      <p className="pdf-export-note" style={textCss(card.textStyle)}>
        <StyledNoteText {...card} />
      </p>
    );
  if (card.kind === "iterm2" || card.kind === "vscode")
    return <pre>{card.text}</pre>;
  if (card.kind === "file" || card.kind === "canvas") return card.title;
  return <StaticContent card={card} />;
}

// Keep rows, images and individual text lines together where they fit on a page.
function pageSlices(world: HTMLElement, height: number, pageHeight: number) {
  if (height <= pageHeight) return [{ start: 0, end: height }];
  const rowBorders = new Set<number>();
  const origin = world.parentElement!.getBoundingClientRect().top;
  const spans: { top: number; bottom: number }[] = [];
  function span(rect: DOMRect) {
    const top = Math.round(rect.top - origin),
      bottom = Math.round(rect.bottom - origin);
    if (bottom > top && bottom - top < pageHeight) spans.push({ top, bottom });
  }
  world.querySelectorAll("tr,img,.markdown-diagram").forEach((el) => {
    const rect = el.getBoundingClientRect();
    span(rect);
    if (
      el instanceof HTMLTableRowElement &&
      el.rowIndex > 0 &&
      el.closest(".markdown")
    )
      rowBorders.add(Math.round(rect.top - origin));
  });
  const walker = document.createTreeWalker(world, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) span(rect);
  }
  spans.sort((a, b) => a.top - b.top);
  const bands: typeof spans = [];
  for (const rect of spans) {
    const last = bands.at(-1);
    if (last && rect.top < last.bottom)
      last.bottom = Math.max(last.bottom, rect.bottom);
    else bands.push(rect);
  }
  const ends: number[] = [];
  let start = 0,
    i = 0;
  while (start + pageHeight < height) {
    let end = start + pageHeight;
    while (i < bands.length && bands[i].bottom <= end) i++;
    if (bands[i] && bands[i].top > start && bands[i].top < end)
      end = bands[i].top;
    ends.push(end);
    start = end;
  }
  ends.push(height);
  // A collapsed border belongs to both adjacent rows. Include that same
  // pixel on both sheets when a Markdown table continues across a page break.
  return ends.map((end, index) => {
    const start = ends[index - 1] ?? 0;
    return {
      start: index > 0 && rowBorders.has(start) ? start - 1 : start,
      end: end < height && rowBorders.has(end) ? end + 1 : end,
    };
  });
}

export async function exportPdf(input: Board): Promise<Blob> {
  const board = await sealBoard(input);
  // A list group exposes one preview at a time on screen. Export every unmasked member.
  const expanded: Board = {
    ...board,
    groups: board.groups.map((g) => ({ ...g, displayMode: "flat" })),
  };
  const cards = board.cards.filter(
    (c) => !presentationHidden(expanded, c.group),
  );
  const strokes = strokeBounds(board.strokesHidden ? [] : board.strokes);
  const groups = expanded.groups.filter(
    (g) =>
      g.bounds &&
      (g.masked || !board.cards.length) &&
      !presentationHidden(expanded, g.parent),
  );
  const single = cards[0];
  if (
    cards.length === 1 &&
    !groups.length &&
    !strokes.length &&
    single.blob &&
    isPdfFile(single) &&
    !single.masked &&
    !single.locked
  )
    return single.blob.slice(0, single.blob.size, "application/pdf");
  if (!cards.length && !strokes.length && !groups.length)
    throw Error(tr("没有可导出的内容"));
  const host = document.createElement("div");
  host.inert = true;
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1";
  document.body.append(host);
  const root = createRoot(host);
  const urls: string[] = [];
  function url(blob: Blob) {
    const result = URL.createObjectURL(blob);
    urls.push(result);
    return result;
  }
  try {
    const items: (Pick<Rect, "x" | "y" | "width"> & {
      id: string;
      body: ReactNode;
      card?: Card;
    })[] = [];
    for (const card of cards) {
      const width = readingWidth(card);
      items.push({
        id: card.id,
        x: card.x,
        y: card.y,
        width,
        body: await content(card, width, url),
        card,
      });
    }
    for (const group of groups) {
      items.push({
        id: group.id,
        x: group.bounds!.x,
        y: group.bounds!.y,
        width: group.bounds!.width,
        body: group.masked ? tr("已遮罩") : group.name,
      });
    }
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const placed: Rect[] = [];
    const anchors: Card[] = [];
    function render() {
      flushSync(() =>
        root.render(
          <FullContentExportContext.Provider value={true}>
            <ExportPreviewContext.Provider value={2}>
              <div className="pdf-export">
                <div className="pdf-export-world">
                  <ExportMarks board={board} cards={anchors} />
                  {items.map((item, i) => (
                    <article
                      key={(item.card ? "card-" : "group-") + item.id}
                      style={{
                        left: item.x,
                        top: placed[i]?.y ?? item.y,
                        width: item.width,
                      }}
                    >
                      {item.body}
                    </article>
                  ))}
                </div>
              </div>
            </ExportPreviewContext.Provider>
          </FullContentExportContext.Provider>,
        ),
      );
    }
    render();
    const scene = host.firstElementChild as HTMLElement;
    const world = scene.firstElementChild as HTMLElement;
    await waitForExportContent(scene);
    // The SVG snapshot reapplies each row's computed height. Whole CSS pixels
    // keep fractional row heights from accumulating differently in that layout.
    const rows = Array.from(world.querySelectorAll("tr"), (row) => ({
      row,
      height: Math.ceil(row.getBoundingClientRect().height),
    }));
    for (const { row, height } of rows) row.style.height = height + "px";
    const articles = world.querySelectorAll<HTMLElement>(":scope > article");
    items.forEach((item, i) => {
      const el = articles[i];
      const rect = el.getBoundingClientRect();
      const width = Math.max(rect.width, el.scrollWidth),
        height = Math.max(1, rect.height, el.scrollHeight);
      let y = item.y;
      for (const prev of placed)
        if (
          item.x < prev.x + prev.width &&
          item.x + width > prev.x &&
          y < prev.y + prev.height
        )
          y = prev.y + prev.height;
      placed.push({ x: item.x, y, width, height });
      if (item.card)
        anchors.push({
          ...item.card,
          y,
          displayMode: "custom",
          customSize: { width, height },
          linkDisabled: true,
          textAutoHeight: false,
        });
    });
    render();
    const bounds = [...placed, ...strokes];
    for (const edge of world.querySelectorAll<SVGGElement>(
      ":scope > svg > g:not(.paint-strokes)",
    )) {
      const r = edge.getBBox();
      bounds.push({
        x: r.x - 4,
        y: r.y - 4,
        width: r.width + 8,
        height: r.height + 8,
      });
    }
    const left = Math.floor(Math.min(...bounds.map((r) => r.x))),
      top = Math.floor(Math.min(...bounds.map((r) => r.y)));
    const width = Math.max(
      1,
      Math.ceil(Math.max(...bounds.map((r) => r.x + r.width)) - left),
    );
    const height = Math.max(
      1,
      Math.ceil(Math.max(...bounds.map((r) => r.y + r.height)) - top),
    );
    world.style.left = -left + "px";
    world.style.top = -top + "px";
    scene.style.width = width + "px";
    const slices = pageSlices(
      world,
      height,
      Math.max(1056, Math.min(1600, Math.round(width * Math.SQRT2))),
    );
    // Freeze the fully laid-out document once. Only allocate a bitmap for the
    // current page, even when the document exceeds the browser's canvas limits.
    scene.style.height = height + "px";
    const snapshot = new Image();
    snapshot.src = await toSvg(scene, { skipFonts: true });
    await snapshot.decode();
    const pdf = await PDFDocument.create();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const { insetX, insetY } = documentReadingPreset(
      items.length === 1 && !strokes.length ? items[0].card : undefined,
    );
    const paperWidth = width + 2 * insetX;
    for (const { start, end } of slices) {
      const h = end - start;
      const ratio = Math.min(
        2,
        8192 / width,
        8192 / h,
        Math.sqrt(16_000_000 / (width * h)),
      );
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      ctx.drawImage(
        snapshot,
        0,
        start,
        width,
        h,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error(tr("导出失败，请重试"))),
          "image/png",
        ),
      );
      const image = await pdf.embedPng(await png.arrayBuffer());
      const paperHeight = h + 2 * insetY;
      const scale = Math.min(0.75, 14400 / Math.max(paperWidth, paperHeight));
      const page = pdf.addPage([paperWidth * scale, paperHeight * scale]);
      page.drawImage(image, {
        x: insetX * scale,
        y: insetY * scale,
        width: width * scale,
        height: h * scale,
      });
    }
    return new Blob([new Uint8Array(await pdf.save())], {
      type: "application/pdf",
    });
  } finally {
    root.unmount();
    host.remove();
    for (const u of urls) URL.revokeObjectURL(u);
  }
}

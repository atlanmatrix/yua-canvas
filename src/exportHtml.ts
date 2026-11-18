import { toPng } from "html-to-image";
import { withExportScene } from "./exportPng";
import type { Board, Card } from "./storage";
import { t as tr } from "./i18n";
import { addressStyle } from "./noteLinks";
import addressCss from "./address.css?raw";
import css from "./htmlExport/page.css?raw";
import runtime from "./htmlExport/page.js?raw";

function noteContent(card: Card, frame: HTMLElement, doc: Document) {
  const note = doc.createElement("div");
  note.className = "note " + (card.textMode || "wrap");
  note.setAttribute("contenteditable", "plaintext-only");
  note.setAttribute("role", "textbox");
  note.setAttribute("aria-label", tr("文本内容"));
  note.setAttribute("aria-multiline", "true");
  const paragraph = frame.querySelector<HTMLElement>(".note-body p")!;
  note.style.cssText = paragraph.style.cssText;
  const spans = paragraph.querySelectorAll("span");
  if (!spans.length) note.textContent = card.text;
  spans.forEach((source, i) => {
    const span = doc.createElement("span");
    span.dataset.run = String(i);
    span.style.cssText = source.style.cssText;
    span.textContent = source.textContent;
    note.append(span);
  });
  return note;
}

function todoContent(card: Card, doc: Document) {
  const list = doc.createElement("div");
  list.className = "tasks";
  const header = doc.createElement("header");
  header.textContent = "TODO";
  list.append(header);
  for (const task of card.tasks || []) {
    const label = doc.createElement("label"),
      check = doc.createElement("input"),
      text = doc.createElement("span");
    check.type = "checkbox";
    check.defaultChecked = task.done;
    text.textContent = task.text;
    label.append(check, text);
    list.append(label);
  }
  return list;
}

// Print tool values and calendar dates as text so the static preview keeps
// their contents without showing inputs, keypads or navigation buttons.
async function previewImage(frame: HTMLElement) {
  let preview = frame;
  if (frame.querySelector(".tool-component")) {
    preview = frame.cloneNode(true) as HTMLElement;
    const selector = "input,select,textarea,.calendar-grid button";
    const fields = frame.querySelectorAll<HTMLElement>(selector);
    preview.querySelectorAll(selector).forEach((copy, i) => {
      const field = fields[i];
      const text = document.createElement("span");
      text.textContent =
        field instanceof HTMLSelectElement
          ? field.selectedOptions[0]?.textContent || ""
          : field instanceof HTMLInputElement ||
              field instanceof HTMLTextAreaElement
            ? field.value || field.placeholder
            : field.textContent;
      text.className = field.className;
      copy.replaceWith(text);
    });
    preview.querySelector(".calculator-keys")?.remove();
    frame.after(preview);
  }
  // The rasterizer copies both physical and logical CSS insets. Measure the
  // offscreen preview at its own origin so distant cards land inside the image.
  const { left, top } = preview.style;
  preview.style.left = "0px";
  preview.style.top = "0px";
  try {
    const w = frame.offsetWidth,
      h = frame.offsetHeight;
    return await toPng(preview, {
      pixelRatio: Math.min(
        2,
        8192 / w,
        8192 / h,
        Math.sqrt(16_000_000 / (w * h)),
      ),
      skipFonts: true,
      style: {
        boxShadow: "none",
        borderColor: "transparent",
      },
      filter: (n) =>
        !(
          n instanceof Element &&
          n.matches(
            ".component-remark,.pdf-navigation,.agent-readonly,button:not(.canvas-card-preview button),input,textarea,select",
          )
        ),
    });
  } finally {
    preview.style.left = left;
    preview.style.top = top;
    if (preview !== frame) preview.remove();
  }
}

export function exportHtml(board: Board) {
  return withExportScene(board, async (scene, cards) => {
    const doc = document.implementation.createHTMLDocument("Yua Canvas");
    doc.documentElement.lang = document.documentElement.lang;
    const nonce = crypto.randomUUID();
    const charset = doc.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    const policy = doc.createElement("meta");
    policy.httpEquiv = "Content-Security-Policy";
    policy.content = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'`;
    const viewport = doc.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    const style = doc.createElement("style");
    style.textContent = css + addressCss;
    doc.head.prepend(charset, policy, viewport);
    doc.head.append(style);
    const colors = getComputedStyle(scene);
    for (const name of [
      "--canvas-bg",
      "--ink",
      "--accent",
      "--border",
      "--muted",
      "--surface",
      "--connection-color",
    ])
      doc.documentElement.style.setProperty(
        name,
        colors.getPropertyValue(name),
      );
    for (const [name, value] of Object.entries(addressStyle))
      doc.documentElement.style.setProperty(name, value);
    const canvas = doc.createElement("main");
    canvas.dataset.export = nonce;
    canvas.style.width = scene.style.width;
    canvas.style.height = scene.style.height;
    const world = scene.firstElementChild as HTMLElement;
    const layout = doc.createElement("div");
    layout.style.cssText = world.style.cssText;
    // This SVG contains only the export renderer's paths, markers and text labels.
    layout.append(world.querySelector(":scope > svg")!.cloneNode(true));
    const frames = world.querySelectorAll<HTMLElement>(":scope > .card");
    for (const [i, card] of cards.entries()) {
      const frame = frames[i],
        article = doc.createElement("article");
      article.style.cssText = frame.style.cssText;
      const frameStyle = getComputedStyle(frame);
      article.style.background = frameStyle.backgroundColor;
      article.style.borderRadius = frameStyle.borderRadius;
      if (frame.dataset.customColor === "true") {
        for (const name of ["--ink", "--muted", "--surface", "--border"])
          article.style.setProperty(name, frameStyle.getPropertyValue(name));
      }
      const editable =
        !card.masked && !card.locked && card.displayMode !== "small";
      if (editable && card.kind === "text") {
        const icon = frame.querySelector(".note-address .note-link-icon");
        if (icon) {
          article.className = "is-link-note note-address";
          article.append(icon.cloneNode(true));
        }
        article.append(noteContent(card, frame, doc));
      } else if (editable && card.kind === "todo")
        article.append(todoContent(card, doc));
      else {
        const image = doc.createElement("img");
        image.alt = card.masked
          ? tr("已遮罩")
          : card.locked
            ? tr("已锁定组件")
            : card.title || card.kind;
        image.src = await previewImage(frame);
        article.append(image);
      }
      if (!card.masked && !card.locked && card.remark) {
        const aside = doc.createElement("aside");
        aside.textContent = card.remark;
        article.append(aside);
      }
      layout.append(article);
    }
    canvas.append(layout);
    const script = doc.createElement("script");
    script.setAttribute("nonce", nonce);
    script.textContent = runtime;
    doc.body.append(canvas, script);
    return new Blob(["<!doctype html>\n", doc.documentElement.outerHTML], {
      type: "text/html;charset=utf-8",
    });
  });
}

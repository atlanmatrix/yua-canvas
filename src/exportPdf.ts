import { PDFDocument } from "pdf-lib";
import { renderScenePng, withExportScene } from "./exportPng";
import type { Board } from "./storage";

export function exportPdf(board: Board): Promise<Blob> {
  return withExportScene(board, async (scene, _cards, ratio) => {
    const png = await renderScenePng(scene, ratio);
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(await png.arrayBuffer());
    // Convert CSS pixels to points, fitting oversized canvases within PDF page limits.
    const { width, height } = scene.getBoundingClientRect();
    const scale = Math.min(72 / 96, 14400 / Math.max(width, height));
    const page = pdf.addPage([width * scale, height * scale]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
    });
    const bytes = await pdf.save();
    return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  });
}

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  PreviewCache,
  pdfQueue,
  previewMetrics,
  checkAbort,
  aborted,
} from "./previewCache";
import { readPdfBitmap, savePdfBitmap, type PdfBitmap } from "./previewDisk";
export const PDF_PREVIEW_MAX_EDGE = 1024;
const bitmaps = new PreviewCache<string, PdfBitmap>(64 * 1024 * 1024, 128);
let id = 0;
const identities = new WeakMap<Blob, number>();
const hashes = new WeakMap<Blob, Promise<string>>();
function identity(blob: Blob) {
  if (!identities.has(blob)) identities.set(blob, ++id);
  return identities.get(blob)!;
}
function digest(blob: Blob) {
  let value = hashes.get(blob);
  if (!value) {
    value = blob
      .arrayBuffer()
      .then((bytes) => crypto.subtle.digest("SHA-256", bytes))
      .then((bytes) =>
        Array.from(new Uint8Array(bytes), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join(""),
      );
    hashes.set(blob, value);
    value.catch(() => hashes.delete(blob));
  }
  return value;
}
export function pdfResolution(value: number) {
  return Math.max(
    128,
    Math.min(
      PDF_PREVIEW_MAX_EDGE,
      2 ** Math.ceil(Math.log2(Math.max(1, value))),
    ),
  );
}
type DocumentEntry = {
  blob: Blob;
  ready: Promise<PDFDocumentProxy>;
  task?: PDFDocumentLoadingTask;
  refs: number;
  used: number;
  disposed: boolean;
  timer?: ReturnType<typeof setTimeout>;
};
const documents = new Map<Blob, DocumentEntry>();
async function dispose(entry: DocumentEntry) {
  if (entry.disposed) return;
  entry.disposed = true;
  clearTimeout(entry.timer);
  if (documents.get(entry.blob) === entry) documents.delete(entry.blob);
  await entry.task?.destroy().catch(() => {});
}
async function trim() {
  const idle = [...documents.values()]
    .filter((e) => !e.refs)
    .sort((a, b) => a.used - b.used);
  let bytes = [...documents.keys()].reduce((sum, b) => sum + b.size, 0);
  for (const entry of idle) {
    if (documents.size <= 3 && bytes <= 32 * 1024 * 1024) break;
    bytes -= entry.blob.size;
    await dispose(entry);
  }
}
async function acquire(blob: Blob, signal: AbortSignal) {
  let entry = documents.get(blob);
  if (!entry) {
    entry = {
      blob,
      refs: 0,
      used: Date.now(),
      disposed: false,
      ready: undefined!,
    };
    const current = entry;
    entry.ready = (async () => {
      const library = await import("pdfjs-dist");
      if (current.disposed) throw aborted();
      library.GlobalWorkerOptions.workerSrc = workerUrl;
      const assets = new URL(
        `${import.meta.env.BASE_URL}assets/pdf/`,
        location.href,
      ).href;
      const bytes = await blob.arrayBuffer();
      if (current.disposed) throw aborted();
      previewMetrics.pdfLoads++;
      current.task = library.getDocument({
        data: new Uint8Array(bytes),
        cMapUrl: assets + "cmaps/",
        cMapPacked: true,
        standardFontDataUrl: assets + "standard_fonts/",
        wasmUrl: assets + "wasm/",
        iccUrl: assets + "iccs/",
      });
      return current.task.promise;
    })();
    documents.set(blob, entry);
  }
  const current = entry;
  clearTimeout(current.timer);
  current.refs++;
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    signal.removeEventListener("abort", cancel);
    current.refs--;
    current.used = Date.now();
    if (!current.refs) {
      if (signal.aborted) await dispose(current);
      else {
        current.timer = setTimeout(() => {
          if (!current.refs) void dispose(current);
        }, 10000);
        await trim();
      }
    }
  };
  const cancel = () => {
    if (current.refs === 1) void dispose(current);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    checkAbort(signal);
    await trim();
    checkAbort(signal);
    const document = await current.ready;
    checkAbort(signal);
    return { document, release };
  } catch (error) {
    await release();
    if (!current.refs) await dispose(current);
    throw error;
  }
}
type Pending = {
  controller: AbortController;
  users: number;
  promise: Promise<PdfBitmap>;
};
const pending = new Map<string, Pending>();
const pageLocks = new Map<string, Promise<void>>();
async function produce(
  blob: Blob,
  page: number,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<PdfBitmap> {
  const hash = await digest(blob);
  checkAbort(signal);
  const key = `pdf-v1:${hash}:${page}:${width}x${height}`;
  const previous = pageLocks.get(key);
  if (previous) {
    await previous;
    checkAbort(signal);
    return produce(blob, page, width, height, signal);
  }
  let release!: () => void;
  const lock = new Promise<void>((resolve) => {
    release = resolve;
  });
  pageLocks.set(key, lock);
  try {
    const disk = await readPdfBitmap(key);
    checkAbort(signal);
    if (disk) {
      previewMetrics.pdfDiskHits++;
      return disk;
    }
    const lease = await acquire(blob, signal);
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    const cancel = () => render?.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const actual = Math.max(1, Math.min(page, lease.document.numPages));
      const documentPage = await lease.document.getPage(actual);
      checkAbort(signal);
      const natural = documentPage.getViewport({ scale: 1 });
      const viewport = documentPage.getViewport({
        scale: Math.min(width / natural.width, height / natural.height),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      previewMetrics.pdfRenders++;
      render = documentPage.render({ canvas, viewport });
      await render.promise;
      checkAbort(signal);
      const bitmap = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("PDF preview failed"))),
          "image/webp",
          0.9,
        ),
      );
      checkAbort(signal);
      const result = {
        blob: bitmap,
        page: actual,
        pages: lease.document.numPages,
        width: canvas.width,
        height: canvas.height,
      };
      canvas.width = canvas.height = 0;
      await savePdfBitmap(key, result);
      checkAbort(signal);
      return result;
    } finally {
      signal.removeEventListener("abort", cancel);
      await lease.release();
    }
  } finally {
    if (pageLocks.get(key) === lock) pageLocks.delete(key);
    release();
  }
}
export function requestPdfPreview(
  blob: Blob,
  page: number,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<PdfBitmap> {
  checkAbort(signal);
  const key = `${identity(blob)}:${page}:${width}x${height}`;
  const hit = bitmaps.get(key);
  if (hit) {
    previewMetrics.pdfMemoryHits++;
    return Promise.resolve(hit);
  }
  let job = pending.get(key);
  if (job?.controller.signal.aborted) job = undefined;
  if (!job) {
    const controller = new AbortController();
    const current: Pending = { controller, users: 0, promise: undefined! };
    current.promise = pdfQueue
      .run(
        () => produce(blob, page, width, height, controller.signal),
        controller.signal,
      )
      .then((value) => {
        bitmaps.set(
          key,
          value,
          Math.max(value.blob.size, value.width * value.height * 4),
        );
        return value;
      })
      .finally(() => {
        if (pending.get(key) === current) pending.delete(key);
      });
    job = current;
    pending.set(key, job);
  }
  const current = job;
  current.users++;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", cancel);
      current.users--;
      if (!current.users) current.controller.abort();
    };
    const cancel = () => {
      finish();
      reject(aborted());
    };
    signal.addEventListener("abort", cancel, { once: true });
    current.promise.then(
      (value) => {
        if (!done) {
          finish();
          resolve(value);
        }
      },
      (error) => {
        if (!done) {
          finish();
          reject(error);
        }
      },
    );
  });
}
export function pdfPreviewStats() {
  return {
    documents: documents.size,
    bitmaps: bitmaps.size,
    bytes: bitmaps.usedBytes,
    running: pdfQueue.running,
    queued: pdfQueue.waiting,
    ...previewMetrics,
  };
}

// A bounded LRU for disposable derived previews. Source attachments stay in the
// workspace; evicting this cache never removes user data.
export class PreviewCache<K, V> {
  private entries = new Map<K, { value: V; size: number }>();
  private bytes = 0;
  constructor(
    readonly maxBytes: number,
    readonly maxEntries = 128,
    private dispose?: (v: V) => void,
  ) {}
  get(key: K) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: K, value: V, size: number) {
    this.delete(key);
    if (size > this.maxBytes) return;
    this.entries.set(key, { value, size });
    this.bytes += size;
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries)
      this.delete(this.entries.keys().next().value!);
  }
  delete(key: K) {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.bytes -= entry.size;
      this.dispose?.(entry.value);
    }
  }
  clear() {
    for (const key of this.entries.keys()) this.delete(key);
  }
  get size() {
    return this.entries.size;
  }
  get usedBytes() {
    return this.bytes;
  }
}
const initialMetrics = {
  cardRenders: 0,
  pdfLoads: 0,
  pdfRenders: 0,
  pdfMemoryHits: 0,
  pdfDiskHits: 0,
  textReads: 0,
  markdownParses: 0,
  diagramRenders: 0,
};
// One scheduler/diagnostic scope per window, including Vite's versioned modules.
const metricsScope = globalThis as unknown as Record<
  symbol,
  typeof initialMetrics
>;
export const previewMetrics = (metricsScope[
  Symbol.for("canvas-of-yua.preview-metrics")
] ||= initialMetrics);
export const aborted = () =>
  new DOMException("Preview cancelled", "AbortError");
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw aborted();
}
export class PreviewQueue {
  private active = 0;
  private jobs: {
    start: () => void;
    signal?: AbortSignal;
    cancel: () => void;
  }[] = [];
  constructor(readonly concurrency: number) {}
  run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(aborted());
        return;
      }
      const job = {
        signal,
        cancel: () => {
          const index = this.jobs.indexOf(job);
          if (index >= 0) this.jobs.splice(index, 1);
          signal?.removeEventListener("abort", job.cancel);
          reject(aborted());
        },
        start: () => {
          signal?.removeEventListener("abort", job.cancel);
          this.active++;
          Promise.resolve()
            .then(() => {
              checkAbort(signal);
              return work();
            })
            .then(resolve, reject)
            .finally(() => {
              this.active--;
              this.pump();
            });
        },
      };
      signal?.addEventListener("abort", job.cancel, { once: true });
      this.jobs.push(job);
      this.pump();
    });
  }
  private pump() {
    while (this.active < this.concurrency && this.jobs.length) {
      const job = this.jobs.shift()!;
      if (job.signal?.aborted) {
        job.cancel();
        continue;
      }
      job.start();
    }
  }
  get running() {
    return this.active;
  }
  get waiting() {
    return this.jobs.length;
  }
}
const queueScope = globalThis as unknown as Record<symbol, PreviewQueue>;
export const pdfQueue = (queueScope[Symbol.for("canvas-of-yua.pdf-queue")] ||=
  new PreviewQueue(2));
export const diagramQueue = (queueScope[
  Symbol.for("canvas-of-yua.diagram-queue")
] ||= new PreviewQueue(1));
export const textQueue = (queueScope[Symbol.for("canvas-of-yua.text-queue")] ||=
  new PreviewQueue(2));
const textCache = new PreviewCache<Blob, Map<number, string>>(
  16 * 1024 * 1024,
  64,
);
const pendingText = new WeakMap<Blob, Map<number, SharedPreview<string>>>();
export function readPreviewText(
  blob: Blob,
  limit: number,
  signal = new AbortController().signal,
) {
  checkAbort(signal);
  const cached = textCache.get(blob)?.get(limit);
  if (cached !== undefined) return Promise.resolve(cached);
  let pending = pendingText.get(blob);
  if (!pending) {
    pending = new Map();
    pendingText.set(blob, pending);
  }
  return sharedPreview(
    pending,
    limit,
    (internal) =>
      textQueue.run(async () => {
        previewMetrics.textReads++;
        const bytes = new Uint8Array(await blob.slice(0, limit).arrayBuffer());
        checkAbort(internal);
        const encoding =
          bytes[0] === 255 && bytes[1] === 254
            ? "utf-16le"
            : bytes[0] === 254 && bytes[1] === 255
              ? "utf-16be"
              : "utf-8";
        const text = new TextDecoder(encoding).decode(bytes, {
          stream: blob.size > limit,
        });
        const versions = textCache.get(blob) || new Map<number, string>();
        versions.set(limit, text);
        textCache.set(
          blob,
          versions,
          Math.max(
            blob.size,
            [...versions.values()].reduce((sum, v) => sum + v.length * 2, 0),
          ),
        );
        return text;
      }, internal),
    signal,
  );
}

export type SharedPreview<T> = {
  controller: AbortController;
  users: number;
  done: boolean;
  promise: Promise<T>;
};
export function sharedPreview<K, T>(
  requests: Map<K, SharedPreview<T>>,
  key: K,
  start: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  checkAbort(signal);
  let job = requests.get(key);
  if (job?.controller.signal.aborted) job = undefined;
  if (!job) {
    const controller = new AbortController();
    const current: SharedPreview<T> = {
      controller,
      users: 0,
      done: false,
      promise: undefined!,
    };
    current.promise = Promise.resolve()
      .then(() => start(controller.signal))
      .finally(() => {
        current.done = true;
        if (requests.get(key) === current) requests.delete(key);
      });
    requests.set(key, current);
    job = current;
  }
  const current = job;
  current.users++;
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", cancel);
      current.users--;
      if (!current.users && !current.done) current.controller.abort();
    };
    const cancel = () => {
      finish();
      reject(aborted());
    };
    signal.addEventListener("abort", cancel, { once: true });
    current.promise.then(
      (value) => {
        if (!finished) {
          finish();
          resolve(value);
        }
      },
      (error) => {
        if (!finished) {
          finish();
          reject(error);
        }
      },
    );
  });
}

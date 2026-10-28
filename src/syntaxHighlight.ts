import {
  PreviewCache,
  PreviewQueue,
  sharedPreview,
  type SharedPreview,
  checkAbort,
} from "./previewCache";
import { normalizeLanguage } from "./textFormats";
const cache = new PreviewCache<string, string>(16 * 1024 * 1024, 128),
  queue = new PreviewQueue(1),
  pending = new Map<string, SharedPreview<string>>();
let worker: Worker | undefined,
  idle: ReturnType<typeof setTimeout> | undefined,
  sequence = 0;
export const CODE_PREVIEW_LIMIT = 64 * 1024;
export function highlightCode(
  source: string,
  language: string,
  signal: AbortSignal,
) {
  const text = source.slice(0, CODE_PREVIEW_LIMIT),
    normalized = normalizeLanguage(language),
    key = normalized + "\0" + text;
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  return sharedPreview(
    pending,
    key,
    (internal) =>
      queue.run(
        () =>
          new Promise<string>((resolve, reject) => {
            checkAbort(internal);
            clearTimeout(idle);
            const current = (worker ||= new Worker(
                new URL("./syntax.worker.ts", import.meta.url),
                { type: "module" },
              )),
              id = ++sequence;
            const finish = () => {
              current.removeEventListener("message", message);
              current.removeEventListener("error", error);
              clearTimeout(timeout);
              idle = setTimeout(() => {
                current.terminate();
                if (worker === current) worker = undefined;
              }, 30000);
            };
            const error = () => {
              finish();
              current.terminate();
              if (worker === current) worker = undefined;
              reject(Error("Syntax preview unavailable"));
            };
            const message = (event: MessageEvent) => {
              if (event.data.id !== id) return;
              if (event.data.error || typeof event.data.html !== "string") {
                error();
                return;
              }
              finish();
              const html = event.data.html as string;
              cache.set(key, html, (key.length + html.length) * 2);
              resolve(html);
            };
            // A pathological grammar cannot block canvas input or the queue forever.
            const timeout = setTimeout(error, 6000);
            current.addEventListener("message", message);
            current.addEventListener("error", error);
            current.postMessage({ id, source: text, language: normalized });
          }),
        internal,
      ),
    signal,
  );
}

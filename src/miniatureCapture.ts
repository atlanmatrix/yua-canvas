import { useEffect, useRef, useState } from "react";
import type { Card } from "./storage";
import { miniatureUrl, miniatureViewUrl } from "./miniatureScene";

export type MiniatureSnapshot = { view: string; cover?: Blob };
type Job = { start: (release: () => void) => void; cancelled: boolean };
const jobs: Job[] = [];
let active: Job | undefined;
function scheduleCapture(start: Job["start"]) {
  const job: Job = { start, cancelled: false };
  jobs.push(job);
  const pump = () => {
    if (active) return;
    const next = jobs.shift();
    if (!next) return;
    if (next.cancelled) {
      pump();
      return;
    }
    active = next;
    queueMicrotask(() => {
      if (!next.cancelled)
        next.start(() => {
          if (active === next) {
            active = undefined;
            pump();
          }
        });
    });
  };
  pump();
  return () => {
    job.cancelled = true;
    if (active === job) active = undefined;
    pump();
  };
}

type Frame = { id: string; url: string; mode: "capture" | "live" | "closing" };
type Controller = {
  sync: (card: Card, visible: boolean) => void;
  toggle: () => void;
  loaded: () => void;
};
const coverBlob = (blob?: Blob) =>
  blob && ["image/png", "image/webp"].includes(blob.type) ? blob : undefined;
async function decodeCover(value: unknown): Promise<Blob> {
  if (typeof value !== "string" || value.length > 24 * 1024 * 1024)
    throw Error("封面数据无效");
  const match =
    /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw Error("封面格式无效");
  const blob = new Blob(
    [Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))],
    { type: match[1] },
  );
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (
      img.naturalWidth < 32 ||
      img.naturalWidth > 2048 ||
      img.naturalHeight < 32 ||
      img.naturalHeight > 2048
    )
      throw Error("封面尺寸无效");
  } finally {
    URL.revokeObjectURL(url);
  }
  return blob;
}

export function useMiniatureCapture(
  card: Card,
  onSnapshot?: (snapshot: MiniatureSnapshot) => void,
) {
  const source = miniatureUrl(card.text);
  const initial = (): MiniatureSnapshot => ({
    view: miniatureViewUrl(card.text, card.miniatureView) || source || "",
    cover: coverBlob(card.blob),
  });
  const [snapshot, setSnapshot] = useState<MiniatureSnapshot>(initial);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [failed, setFailed] = useState(false),
    [visible, setVisible] = useState(false);
  const container = useRef<HTMLDivElement>(null),
    iframe = useRef<HTMLIFrameElement>(null);
  const controller = useRef<Controller | null>(null);
  const latest = useRef({ card, visible, onSnapshot });
  latest.current = { card, visible, onSnapshot };
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!source) {
      setFrame(null);
      return;
    }
    setFrame(null);
    const origin = new URL(source).origin;
    let disposed = false,
      currentFrame: Frame | null = null,
      current = initial();
    let expected = {
      blob: latest.current.card.blob,
      view: latest.current.card.miniatureView,
    };
    let attempted = false,
      isVisible = latest.current.visible,
      ready = false,
      revision = 0;
    let queued: (() => void) | undefined, release: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined,
      debounce: ReturnType<typeof setTimeout> | undefined;
    let pending: { id: string; revision: number } | undefined;
    const show = (value: Frame | null) => {
      currentFrame = value;
      if (!disposed) setFrame(value);
    };
    const stop = () => {
      clearTimeout(timeout);
      clearTimeout(debounce);
      pending = undefined;
      queued?.();
      queued = undefined;
      release?.();
      release = undefined;
      show(null);
    };
    const publish = (value: MiniatureSnapshot) => {
      current = value;
      setSnapshot(value);
      if (latest.current.onSnapshot) {
        expected = { blob: value.cover, view: value.view };
        latest.current.onSnapshot(value);
      }
    };
    const fail = () => {
      pending = undefined;
      clearTimeout(timeout);
      if (currentFrame?.mode !== "live") {
        stop();
        if (!disposed) setFailed(true);
      }
    };
    const armTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(fail, 12000);
    };
    const request = () => {
      if (!currentFrame || !iframe.current?.contentWindow) return;
      const requestId = `yua-cover-${crypto.randomUUID()}`;
      pending = { id: requestId, revision };
      armTimeout();
      const node = container.current;
      const ratio =
        node && node.clientHeight > 38
          ? node.clientWidth / (node.clientHeight - 38)
          : 4 / 3;
      iframe.current.contentWindow.postMessage(
        {
          type: "little-worlds:capture",
          requestId,
          options: {
            width: 1280,
            height: Math.max(
              32,
              Math.min(2048, Math.round(1280 / Math.max(0.1, ratio))),
            ),
            format: "webp",
            quality: 0.9,
          },
        },
        origin,
      );
    };
    const start = (mode: "capture" | "live") => {
      ready = false;
      const url = new URL(current.view || source);
      url.searchParams.set("parentOrigin", location.origin);
      if (mode === "capture") url.searchParams.set("screenshot", "1");
      else {
        url.searchParams.delete("screenshot");
        url.searchParams.delete("preview");
      }
      show({ id: crypto.randomUUID(), url: url.href, mode });
      setFailed(false);
      armTimeout();
    };
    const ensureCover = () => {
      if (!isVisible || current.cover || currentFrame || queued || attempted)
        return;
      queued = scheduleCapture((done) => {
        release = done;
        if (!disposed && isVisible) {
          attempted = true;
          start("capture");
        } else done();
      });
    };
    const sync = (value: Card, shown: boolean) => {
      isVisible = shown;
      if (
        value.blob !== expected.blob ||
        value.miniatureView !== expected.view
      ) {
        stop();
        expected = { blob: value.blob, view: value.miniatureView };
        attempted = false;
        current = {
          view: miniatureViewUrl(source, value.miniatureView) || source,
          cover: coverBlob(value.blob),
        };
        setSnapshot(current);
        setFailed(false);
      }
      if (!shown && (queued || currentFrame?.mode === "capture")) {
        stop();
        attempted = false;
      }
      ensureCover();
    };
    const toggle = () => {
      if (currentFrame?.mode === "live") {
        show({ ...currentFrame, mode: "closing" });
        clearTimeout(debounce);
        request();
      } else {
        stop();
        start("live");
      }
    };
    const message = async (event: MessageEvent) => {
      if (
        disposed ||
        miniatureUrl(latest.current.card.text) !== source ||
        !currentFrame ||
        event.source !== iframe.current?.contentWindow ||
        event.origin !== origin
      )
        return;
      const data = event.data;
      if (data?.type === "little-worlds:ready") {
        ready = true;
        request();
        return;
      }
      if (data?.type === "little-worlds:statechange") {
        const view = miniatureViewUrl(source, data.url);
        if (view && view !== current.view) {
          revision++;
          publish({ view });
        }
        clearTimeout(debounce);
        debounce = setTimeout(request, 160);
        return;
      }
      if (
        data?.type !== "little-worlds:response" ||
        !pending ||
        data.requestId !== pending.id
      )
        return;
      const requested = pending,
        sessionId = currentFrame.id;
      if (!data.ok) {
        pending = undefined;
        if (ready || currentFrame.mode === "closing") fail();
        return;
      }
      try {
        const view = miniatureViewUrl(source, data.result?.url);
        if (!view) throw Error("场景视图无效");
        const cover = await decodeCover(data.result?.dataUrl);
        if (
          disposed ||
          miniatureUrl(latest.current.card.text) !== source ||
          currentFrame?.id !== sessionId ||
          pending?.id !== requested.id
        )
          return;
        if (requested.revision !== revision && view !== current.view) {
          request();
          return;
        }
        clearTimeout(timeout);
        clearTimeout(debounce);
        pending = undefined;
        publish({ view, cover });
        if (currentFrame.mode !== "live") stop();
      } catch {
        if (
          !disposed &&
          currentFrame?.id === sessionId &&
          pending?.id === requested.id
        )
          fail();
      }
    };
    controller.current = {
      sync,
      toggle,
      loaded: () => {
        if (!pending) request();
      },
    };
    setSnapshot(current);
    setFailed(false);
    window.addEventListener("message", message);
    sync(latest.current.card, latest.current.visible);
    return () => {
      disposed = true;
      window.removeEventListener("message", message);
      stop();
      controller.current = null;
    };
  }, [source]);
  useEffect(
    () => controller.current?.sync(card, visible),
    [card, visible, source],
  );
  return {
    container,
    iframe,
    snapshot,
    frame,
    failed,
    interactive: frame?.mode === "live",
    toggle: () => controller.current?.toggle(),
    loaded: () => controller.current?.loaded(),
  };
}

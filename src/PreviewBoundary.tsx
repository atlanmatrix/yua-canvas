import { FileText } from "lucide-react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
const listeners = new Set<() => void>();
let moving = false,
  timer: ReturnType<typeof setTimeout> | undefined;
export function markPreviewMoving() {
  if (!moving) {
    moving = true;
    listeners.forEach((fn) => fn());
  }
  clearTimeout(timer);
  timer = setTimeout(() => {
    moving = false;
    listeners.forEach((fn) => fn());
  }, 160);
}
function listenActivity() {
  const wheel = (e: WheelEvent) => {
    if (
      (e.target as Element)?.closest?.(".canvas,.share-surface,.canvas3d-stage")
    )
      markPreviewMoving();
  };
  const move = (e: PointerEvent) => {
    if (
      e.buttons &&
      (e.target as Element)?.closest?.(".canvas,.share-surface,.canvas3d-stage")
    )
      markPreviewMoving();
  };
  window.addEventListener("wheel", wheel, { capture: true, passive: true });
  window.addEventListener("pointermove", move, {
    capture: true,
    passive: true,
  });
  return () => {
    window.removeEventListener("wheel", wheel, true);
    window.removeEventListener("pointermove", move, true);
  };
}
let removeActivity: (() => void) | undefined;
function subscribe(fn: () => void) {
  if (!listeners.size) removeActivity = listenActivity();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      removeActivity?.();
      removeActivity = undefined;
      clearTimeout(timer);
      moving = false;
    }
  };
}
export const usePreviewMoving = () =>
  useSyncExternalStore(
    subscribe,
    () => moving,
    () => false,
  );
type Watcher = {
  observer: IntersectionObserver;
  callbacks: Map<Element, (visible: boolean) => void>;
};
const watchers = new Map<Element | null, Watcher>();
const chunkHeights = new Map<string, number>();
function watch(
  element: Element,
  root: Element | null,
  callback: (visible: boolean) => void,
) {
  if (!("IntersectionObserver" in window)) {
    callback(true);
    return () => {};
  }
  let group = watchers.get(root);
  if (!group) {
    const callbacks = new Map<Element, (visible: boolean) => void>();
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) =>
          callbacks.get(entry.target)?.(entry.isIntersecting),
        ),
      { root, rootMargin: "320px" },
    );
    group = { observer, callbacks };
    watchers.set(root, group);
  }
  group.callbacks.set(element, callback);
  group.observer.observe(element);
  return () => {
    group!.callbacks.delete(element);
    group!.observer.unobserve(element);
    if (!group!.callbacks.size) {
      group!.observer.disconnect();
      watchers.delete(root);
    }
  };
}
export function previewScrollRoot(element: Element) {
  return (
    element.parentElement?.closest(
      ".markdown-file-preview,.detail-content,.text-file-preview,.group-list-detail,.canvas,.share-surface",
    ) || null
  );
}
export const PreviewBoundary = memo(function PreviewBoundary({
  children,
  force = false,
  chunk = false,
  estimate = 240,
  cacheKey,
  anchors,
  allowTiny = false,
}: {
  children: ReactNode;
  force?: boolean;
  chunk?: boolean;
  estimate?: number;
  cacheKey?: string;
  anchors?: string;
  allowTiny?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ visible: false, active: false });
  const [height, setHeight] = useState(() =>
    cacheKey ? chunkHeights.get(cacheKey) || estimate : estimate,
  );
  const busy = usePreviewMoving();
  const onScreen = useRef(false);
  useLayoutEffect(() => {
    const element = host.current!;
    let release: ReturnType<typeof setTimeout> | undefined;
    const pinned = () =>
      element.contains(document.activeElement) ||
      !!(
        document.getSelection()?.anchorNode &&
        element.contains(document.getSelection()!.anchorNode)
      );
    const detailed = () => {
      const box = element.getBoundingClientRect();
      return (
        chunk ||
        allowTiny ||
        box.width * box.height >= 6000 ||
        element.matches(":hover") ||
        pinned()
      );
    };
    const update = (visible: boolean) => {
      onScreen.current = visible;
      clearTimeout(release);
      if (visible)
        setState((previous) =>
          previous.visible
            ? previous
            : { visible: true, active: !moving && detailed() },
        );
      else
        release = setTimeout(() => {
          if (!pinned()) setState({ visible: false, active: false });
        }, 250);
    };
    const root = previewScrollRoot(element);
    // A one-pixel image may have no inner box after its card border. Observe
    // the lightweight frame so its source still loads without widening it.
    const target =
      allowTiny && (!element.offsetWidth || !element.offsetHeight)
        ? element.closest(".card,.share-card,.group-list-card") || element
        : element;
    const box = target.getBoundingClientRect(),
      bounds = root?.getBoundingClientRect() || {
        left: 0,
        top: 0,
        right: innerWidth,
        bottom: innerHeight,
      };
    update(
      box.right >= bounds.left - 320 &&
        box.left <= bounds.right + 320 &&
        box.bottom >= bounds.top - 320 &&
        box.top <= bounds.bottom + 320 &&
        box.width > 0 &&
        box.height > 0,
    );
    const stop = watch(target, root, update);
    const blur = () => {
      if (!onScreen.current) update(false);
    };
    const reveal = () => setState({ visible: true, active: true });
    const leave = () => {
      if (onScreen.current && !moving && !detailed())
        setState({ visible: true, active: false });
    };
    const enter = () => {
      if (!moving) reveal();
    };
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("preview-reveal", reveal);
    element.addEventListener("focusout", blur);
    return () => {
      stop();
      clearTimeout(release);
      element.removeEventListener("focusout", blur);
      element.removeEventListener("preview-reveal", reveal);
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
    };
  }, [chunk, allowTiny]);
  useEffect(() => {
    if (busy || !state.visible) return;
    const element = host.current!,
      box = element.getBoundingClientRect();
    const detailed =
      chunk ||
      allowTiny ||
      box.width * box.height >= 6000 ||
      element.matches(":hover") ||
      element.contains(document.activeElement) ||
      !!(
        document.getSelection()?.anchorNode &&
        element.contains(document.getSelection()!.anchorNode)
      );
    if (state.active !== detailed)
      setState({ visible: true, active: detailed });
  }, [busy, state.visible, state.active, chunk, allowTiny]);
  const active = force || state.active;
  useLayoutEffect(() => {
    if (!chunk || !active) return;
    const element = host.current!;
    const measure = () => {
      const next = element.offsetHeight;
      if (next > 0) {
        if (cacheKey) {
          chunkHeights.delete(cacheKey);
          chunkHeights.set(cacheKey, next);
          if (chunkHeights.size > 2048)
            chunkHeights.delete(chunkHeights.keys().next().value!);
        }
        setHeight((previous) =>
          Math.abs(previous - next) > 1 ? next : previous,
        );
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [chunk, active]);
  return (
    <div
      ref={host}
      className={chunk ? "markdown-chunk" : "preview-boundary"}
      data-preview-state={active ? "active" : "suspended"}
      data-preview-anchors={anchors}
      style={chunk && !active ? { height } : undefined}
    >
      {active ? (
        children
      ) : (
        <div className="preview-placeholder" aria-hidden="true">
          {!chunk && <FileText size={20} />}
        </div>
      )}
    </div>
  );
});

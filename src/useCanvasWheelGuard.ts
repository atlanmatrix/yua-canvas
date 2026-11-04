import { useEffect, useRef, type RefObject } from "react";

/** Keep trackpad overscroll inside the app without replacing native content scroll. */
export function useCanvasWheelGuard(
  surface: RefObject<HTMLElement | null>,
  {
    enabled = true,
    forceCanvas,
  }: { enabled?: boolean; forceCanvas?: () => boolean } = {},
) {
  const latest = useRef(forceCanvas);
  latest.current = forceCanvas;
  useEffect(() => {
    const element = surface.current;
    if (!enabled || !element) return;
    const wheel = (event: WheelEvent) => {
      const block = () => {
        if (event.cancelable) event.preventDefault();
      };
      // React wheel listeners are passive. Cancel the browser gesture natively,
      // then let the existing canvas handlers process pan/zoom once.
      if (event.ctrlKey || event.metaKey || latest.current?.()) {
        block();
        return;
      }
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta = horizontal ? event.deltaX : event.deltaY;
      let scrollable = false,
        consumes = false;
      const target = event.target instanceof Element ? event.target : null;
      for (
        let node = target;
        node && node !== element;
        node = node.parentElement
      ) {
        if (!(node instanceof HTMLElement)) continue;
        const style = getComputedStyle(node);
        const scrollX =
          /^(auto|scroll)$/.test(style.overflowX) &&
          node.scrollWidth > node.clientWidth + 1;
        const scrollY =
          /^(auto|scroll)$/.test(style.overflowY) &&
          node.scrollHeight > node.clientHeight + 1;
        if (!scrollX && !scrollY) continue;
        scrollable = true;
        if (!(horizontal ? scrollX : scrollY)) continue;
        const position = horizontal ? node.scrollLeft : node.scrollTop;
        const limit = horizontal
          ? node.scrollWidth - node.clientWidth
          : node.scrollHeight - node.clientHeight;
        // RTL scrollers expose negative horizontal positions in modern browsers.
        const start = horizontal && style.direction === "rtl" ? -limit : 0;
        const end = horizontal && style.direction === "rtl" ? 0 : limit;
        if (
          (delta < 0 && position > start + 0.5) ||
          (delta > 0 && position < end - 0.5)
        )
          consumes = true;
      }
      if (scrollable) {
        // Preserve native scroll and chaining between inner scroll containers,
        // while keeping it separate from the canvas camera's React handler.
        event.stopPropagation();
        if (!consumes) block();
      } else block();
    };
    element.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => element.removeEventListener("wheel", wheel, true);
  }, [surface, enabled]);
}

import { iconMotionRecipe, type MotionPhase } from "./iconMotionRecipes";
import {
  iconMotionPaused,
  onIconMotionPause,
  pauseIconMotion,
} from "./iconMotionActivity";
const active = new Map<
  SVGSVGElement,
  { phase: MotionPhase; animations: Set<Animation> }
>();
const busy = new Set<SVGSVGElement>();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const iconSelector = "svg[data-ui-icon]:not([data-icon-static])";
const interactive =
  "button,a[href],[role=button],label:has(input[type=color]),.preference-slider";
const decorative =
  ".component-type-icon,.component-mask,.tool-heading,.agent-header,.attachment-title,.card-top,.pin-bar,.toast,[role=alert]";
const cameraSurface = ".canvas,.share-surface,.canvas3d-stage";
const recent = new WeakMap<
  SVGSVGElement,
  { phase: MotionPhase; time: number }
>();
function usable(svg: SVGSVGElement, allowBusy = false, explicit = false) {
  if (
    !svg.isConnected ||
    svg.hasAttribute("data-icon-static") ||
    svg.closest("[inert]") ||
    document.hidden ||
    reduced() ||
    (iconMotionPaused() && !explicit)
  )
    return false;
  if (
    !allowBusy &&
    (busy.has(svg) || svg.closest(":disabled,[aria-disabled=true]"))
  )
    return false;
  const box = svg.getBoundingClientRect();
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.bottom > 0 &&
    box.right > 0 &&
    box.top < innerHeight &&
    box.left < innerWidth
  );
}
export function stopIconMotion(svg: SVGSVGElement) {
  const run = active.get(svg);
  active.delete(svg);
  run?.animations.forEach((animation) => animation.cancel());
  delete svg.dataset.iconPhase;
}
export function playIconMotion(svg: SVGSVGElement, phase: MotionPhase) {
  const explicit =
    (phase === "press" || phase === "click") && !!svg.closest(interactive);
  if (!usable(svg, phase === "busy", explicit)) return;
  const last = recent.get(svg),
    now = performance.now();
  if (phase === "click" && last?.phase === phase && now - last.time < 70)
    return;
  stopIconMotion(svg);
  const run = { phase, animations: new Set<Animation>() };
  const parts = iconMotionRecipe(svg, phase);
  if (!parts.length) return;
  recent.set(svg, { phase, time: now });
  active.set(svg, run);
  svg.dataset.iconPhase = phase;
  for (const part of parts)
    for (const node of part.nodes) {
      node.setAttribute("data-motion-part", part.name);
      const frames = part.frames.map((frame) => ({
        ...frame,
        transformBox: "view-box",
        transformOrigin: part.origin || "12px 12px",
      }));
      const animation = node.animate(frames, {
        duration:
          phase === "busy"
            ? svg.dataset.uiIcon === "Bot"
              ? 1600
              : 1000
            : phase === "press"
              ? 110
              : phase === "hover"
                ? 200
                : 280,
        delay: part.delay || 0,
        easing:
          phase === "busy" && svg.dataset.uiIcon !== "Bot"
            ? "linear"
            : "cubic-bezier(.2,.7,.25,1)",
        iterations: phase === "busy" ? Infinity : 1,
      });
      run.animations.add(animation);
      const finish = () => {
        run.animations.delete(animation);
        if (!run.animations.size && active.get(svg) === run) {
          active.delete(svg);
          delete svg.dataset.iconPhase;
        }
      };
      void animation.finished.then(finish, finish);
    }
}
export function setIconBusy(svg: SVGSVGElement, value: boolean) {
  if (value) {
    busy.add(svg);
    playIconMotion(svg, "busy");
  } else {
    busy.delete(svg);
    stopIconMotion(svg);
  }
}
export function releaseIconMotion(svg: SVGSVGElement) {
  busy.delete(svg);
  stopIconMotion(svg);
}
export function enterIconMotion(svg: SVGSVGElement) {
  if (
    !svg.closest(interactive) &&
    svg.closest(
      ".toast,[role=alert],[role=status],.component-mask,.diagram-error,.pdf-preview-error",
    )
  )
    playIconMotion(svg, "entry");
}
function owner(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest(interactive) ||
        target.closest(decorative) ||
        target.closest(iconSelector)
    : null;
}
function icons(control: Element, event?: { clientX: number }) {
  let result = [
    ...(control.matches(iconSelector) ? [control as SVGSVGElement] : []),
    ...control.querySelectorAll<SVGSVGElement>(iconSelector),
  ].filter((svg) => owner(svg) === control);
  if (control.matches(".preference-slider")) {
    const input = control.querySelector<HTMLInputElement>("input");
    const box = control.getBoundingClientRect();
    const index = event
      ? Math.max(
          0,
          Math.min(
            result.length - 1,
            Math.floor(
              ((event.clientX - box.left - 4) / (box.width - 8)) *
                result.length,
            ),
          ),
        )
      : Number(input?.value || 0);
    result = result[index] ? [result[index]] : [];
  }
  return result;
}
/** One delegated controller covers portals, menus, shares and dynamically added nodes. */
export function installIconMotion() {
  let press:
    | {
        pointer: number;
        x: number;
        y: number;
        cancelled: boolean;
        down: boolean;
        time: number;
        control: Element | null;
      }
    | undefined;
  let hover: Element | null = null;
  let sliderIcon: SVGSVGElement | undefined;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    [...active.keys()].forEach(stopIconMotion);
  };
  const resume = () => {
    clearTimeout(resumeTimer);
    if (iconMotionPaused()) {
      resumeTimer = setTimeout(resume, 190);
      return;
    }
    busy.forEach((svg) => {
      if (!active.has(svg)) playIconMotion(svg, "busy");
    });
  };
  const removePause = onIconMotionPause(() => {
    // Camera changes caused by zoom/reset buttons must keep their click feedback.
    for (const [svg, run] of active) {
      if (
        (run.phase !== "click" && run.phase !== "press") ||
        !svg.closest(interactive)
      )
        stopIconMotion(svg);
    }
    resume();
  });
  const over = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const next = owner(event.target);
    if (!next || next === owner(event.relatedTarget) || event.buttons) return;
    hover = next;
    const selected = icons(next, event);
    sliderIcon = next.matches(".preference-slider") ? selected[0] : undefined;
    selected.forEach((svg) => playIconMotion(svg, "hover"));
  };
  const out = (event: PointerEvent) => {
    const current = owner(event.target);
    if (current && current !== owner(event.relatedTarget)) {
      icons(current).forEach((svg) => {
        if (active.get(svg)?.phase === "hover") stopIconMotion(svg);
      });
      if (hover === current) {
        hover = null;
        sliderIcon = undefined;
      }
    }
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (press?.down && press.pointer !== event.pointerId) {
      press.cancelled = true;
      cancel();
      return;
    }
    press = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      cancelled: false,
      down: true,
      time: performance.now(),
      control: owner(event.target),
    };
    if (press.control)
      icons(press.control, event).forEach((svg) =>
        playIconMotion(svg, "press"),
      );
  };
  const up = (event: PointerEvent) => {
    if (press?.pointer === event.pointerId) press.down = false;
  };
  const move = (event: PointerEvent) => {
    if (
      press &&
      event.pointerId === press.pointer &&
      event.buttons &&
      Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) >
        (event.pointerType === "touch" ? 8 : 4)
    ) {
      press.cancelled = true;
      cancel();
      if ((event.target as Element)?.closest?.(cameraSurface))
        pauseIconMotion();
    }
    if (event.buttons || !hover?.matches(".preference-slider")) return;
    const next = icons(hover, event)[0];
    if (next && next !== sliderIcon) {
      if (sliderIcon) stopIconMotion(sliderIcon);
      sliderIcon = next;
      playIconMotion(next, "hover");
    }
  };
  const click = (event: MouseEvent) => {
    const control = owner(event.target);
    const blocked = !!(
      event.detail &&
      press?.cancelled &&
      performance.now() - press.time < 1500
    );
    press = undefined;
    if (!control || blocked) return;
    // Non-action headers respond to exploration; their node owns selection.
    if (
      control.matches(interactive) ||
      control.matches(".component-type-icon,.component-mask") ||
      (control.matches(iconSelector) &&
        !!control.closest(
          ".card,.share-card,.group-list-card,.canvas3d-component,.miniature",
        )) ||
      (control.matches(
        ".tool-heading,.agent-header,.attachment-title,.card-top",
      ) &&
        !!control.closest(".card,.group-list-card"))
    )
      icons(control, event.detail ? event : undefined).forEach((svg) =>
        playIconMotion(svg, "click"),
      );
  };
  const focus = (event: FocusEvent) => {
    const control = owner(event.target);
    if (
      control &&
      event.target instanceof Element &&
      event.target.matches(":focus-visible")
    )
      icons(control).forEach((svg) => playIconMotion(svg, "hover"));
  };
  const input = (event: Event) => {
    if (
      !(event.target instanceof HTMLInputElement) ||
      !event.target.matches(".preference-range")
    )
      return;
    const control = event.target.closest(".preference-slider");
    if (control) icons(control).forEach((svg) => playIconMotion(svg, "click"));
  };
  const wheel = (event: WheelEvent) => {
    if ((event.target as Element)?.closest?.(cameraSurface))
      pauseIconMotion(220);
  };
  const abort = () => {
    if (press) press.cancelled = true;
    cancel();
  };
  const visibility = () => {
    if (document.hidden) abort();
    else resume();
  };
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const preference = () => {
    cancel();
    if (!media.matches) resume();
  };
  const listen = <K extends keyof DocumentEventMap>(
    type: K,
    fn: (e: DocumentEventMap[K]) => void,
  ) => document.addEventListener(type, fn, { capture: true, passive: true });
  listen("pointerover", over);
  listen("pointerout", out);
  listen("pointerdown", down);
  listen("pointermove", move);
  listen("pointerup", up);
  listen("click", click);
  listen("focusin", focus);
  listen("input", input);
  listen("wheel", wheel);
  listen("pointercancel", abort);
  listen("contextmenu", abort);
  listen("visibilitychange", visibility);
  window.addEventListener("blur", abort);
  window.addEventListener("focus", resume);
  media.addEventListener("change", preference);
  resume();
  return () => {
    removePause();
    clearTimeout(resumeTimer);
    cancel();
    document.removeEventListener("pointerover", over, true);
    document.removeEventListener("pointerout", out, true);
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("focusin", focus, true);
    document.removeEventListener("input", input, true);
    document.removeEventListener("wheel", wheel, true);
    document.removeEventListener("pointercancel", abort, true);
    document.removeEventListener("contextmenu", abort, true);
    document.removeEventListener("visibilitychange", visibility, true);
    window.removeEventListener("blur", abort);
    window.removeEventListener("focus", resume);
    media.removeEventListener("change", preference);
  };
}

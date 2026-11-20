import { useEffect, useRef } from "react";
import { saveBoard, type Board, type View, type Navigation } from "./storage";

// Game moves checkpoint immediately. Other canvas edits wait for input to settle.
export function useAutosave(
  board: Board,
  view: View,
  ready: boolean,
  setStatus: (status: string) => void,
  navigation?: Navigation,
) {
  const initialized = useRef(false);
  const immediate = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    let active = true;
    let pending = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout>;
    const save = (current: number) => {
      saveBoard(board, view, navigation).then(
        () => {
          if (active && current === revision) {
            pending = false;
            setStatus("已保存至本地");
          }
        },
        () => {
          if (active && current === revision) {
            pending = false;
            setStatus("保存失败");
          }
        },
      );
    };
    if (immediate.current) {
      immediate.current = false;
      setStatus("正在保存…");
      save(revision);
      return () => { active = false; };
    }
    const schedule = () => {
      if (!pending) return;
      clearTimeout(timer);
      const current = ++revision;
      setStatus("正在保存…");
      timer = setTimeout(() => save(current), 600);
    };
    const move = (e: PointerEvent) => {
      if (e.buttons) schedule();
    };
    const events = [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "keydown",
      "input",
      "wheel",
    ];
    events.forEach((event) =>
      window.addEventListener(event, schedule, {
        capture: true,
        passive: true,
      }),
    );
    window.addEventListener("pointermove", move, {
      capture: true,
      passive: true,
    });
    schedule();
    return () => {
      active = false;
      clearTimeout(timer);
      events.forEach((event) =>
        window.removeEventListener(event, schedule, true),
      );
      window.removeEventListener("pointermove", move, true);
    };
  }, [board, view, ready, setStatus, navigation]);
  return () => { immediate.current = true; };
}

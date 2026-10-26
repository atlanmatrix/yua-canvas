import { useLayoutEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import type { Task } from "./storage";

export function TodoEditor({
  tasks,
  initialTask,
  onChange,
  onFinish,
}: {
  tasks: Task[];
  initialTask?: string;
  onChange: (tasks: Task[]) => void;
  onFinish: (cancelled?: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const focusTask = useRef(initialTask || tasks[0]?.id);
  const focusPending = useRef(true);
  useLayoutEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    const row = [
      ...root.current!.querySelectorAll<HTMLElement>("[data-task-id]"),
    ].find((row) => row.dataset.taskId === focusTask.current);
    const element =
      row?.querySelector<HTMLInputElement>('input[type="text"]') ||
      root.current!.querySelector<HTMLButtonElement>(".todo-add");
    element?.focus({ preventScroll: true });
    if (element instanceof HTMLInputElement)
      element.setSelectionRange(element.value.length, element.value.length);
    if (row) {
      const list = root.current!.querySelector<HTMLElement>(".todo-list")!;
      const bounds = row.getBoundingClientRect(),
        viewport = list.getBoundingClientRect();
      const scale = viewport.width / list.offsetWidth || 1;
      if (bounds.bottom > viewport.bottom)
        list.scrollTop += (bounds.bottom - viewport.bottom) / scale;
      else if (bounds.top < viewport.top)
        list.scrollTop += (bounds.top - viewport.top) / scale;
    }
  }, [tasks]);
  const add = (index = tasks.length) => {
    const task = { id: crypto.randomUUID(), text: "", done: false };
    focusTask.current = task.id;
    focusPending.current = true;
    const next = [...tasks];
    next.splice(index, 0, task);
    onChange(next);
  };
  return (
    <div
      ref={root}
      className="todo-editor canvas-editor"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!(e.target as HTMLElement).closest("input,button"))
          e.preventDefault();
      }}
      onPointerUp={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          onFinish();
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) {
          e.stopPropagation();
          return;
        }
        if (
          e.key === "Escape" ||
          (e.key === "Enter" && (e.ctrlKey || e.metaKey))
        ) {
          e.preventDefault();
          e.stopPropagation();
          onFinish(e.key === "Escape");
        }
      }}
    >
      <div
        className="todo-list"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
        }}
      >
        {tasks.map((task, index) => (
          <div
            key={task.id}
            data-task-id={task.id}
            className={`todo-row ${task.done ? "completed" : ""}`}
          >
            <input
              type="checkbox"
              aria-label={`完成任务 ${index + 1}`}
              checked={task.done}
              onChange={() =>
                onChange(
                  tasks.map((t) =>
                    t.id === task.id ? { ...t, done: !t.done } : t,
                  ),
                )
              }
            />
            <input
              type="text"
              aria-label={`任务内容 ${index + 1}`}
              value={task.text}
              onChange={(e) =>
                onChange(
                  tasks.map((t) =>
                    t.id === task.id ? { ...t, text: e.target.value } : t,
                  ),
                )
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.ctrlKey &&
                  !e.metaKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  add(index + 1);
                }
              }}
            />
            <button
              type="button"
              aria-label={`删除任务 ${index + 1}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                if (
                  document.activeElement
                    ?.closest("[data-task-id]")
                    ?.getAttribute("data-task-id") === task.id
                ) {
                  focusTask.current =
                    tasks[index + 1]?.id || tasks[index - 1]?.id;
                  focusPending.current = true;
                }
                onChange(tasks.filter((t) => t.id !== task.id));
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="todo-add"
        aria-label="添加任务"
        title="添加任务"
        onClick={() => add()}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

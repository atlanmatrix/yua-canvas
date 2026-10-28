export type TodoFocus = { task?: string; offset?: number };
export function todoFocusAt(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  target: Element,
): TodoFocus {
  // Canvas pointer capture can retarget dblclick to the card itself.
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const row =
    hit?.closest<HTMLElement>("[data-task-id]") ||
    target.closest<HTMLElement>("[data-task-id]");
  if (!row) return {};
  const text =
    row.querySelector<HTMLElement>("[data-task-text]") ||
    row.querySelector<HTMLElement>("span");
  if (!text) return { task: row.dataset.taskId };
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
  const range = caret
    ? undefined
    : doc.caretRangeFromPoint?.(event.clientX, event.clientY);
  const node = caret?.offsetNode || range?.startContainer,
    offset = caret?.offset ?? range?.startOffset;
  let position = (text.textContent || "").length;
  if (node && text.contains(node) && offset !== undefined) {
    const prefix = document.createRange();
    prefix.selectNodeContents(text);
    prefix.setEnd(node, offset);
    position = prefix.toString().length;
  } else if (event.clientX <= text.getBoundingClientRect().left) position = 0;
  return { task: row.dataset.taskId, offset: position };
}

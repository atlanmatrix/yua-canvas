import type { Card } from "./storage";
import type { Endpoint, Side } from "./connections";
import { t as tr } from "./i18n";

// Canvas buttons and the keyboard picker expose the same available endpoints.
export function cardPorts(card: Card) {
  const name =
    card.masked || card.locked || card.displayMode === "small"
      ? tr("组件")
      : card.title || card.text.slice(0, 20) || tr("任务");
  const sides: Side[] =
    card.kind === "todo" ? ["n", "s"] : ["n", "e", "s", "w"];
  const ports: { endpoint: Endpoint; label: string; row?: number }[] =
    sides.map((side) => ({
      endpoint: { card: card.id, side },
      label: tr("连接 {0} {1}", name, side),
    }));
  if (
    card.kind === "todo" &&
    !card.masked &&
    !card.locked &&
    card.displayMode !== "small"
  )
    card.tasks?.forEach((task, row) => {
      for (const side of ["w", "e"] as const)
        ports.push({
          endpoint: { card: card.id, side, task: task.id },
          label: tr("连接任务 {0} {1}", task.text, side),
          row,
        });
    });
  return ports;
}

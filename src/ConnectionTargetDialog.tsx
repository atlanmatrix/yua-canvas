import { useLayoutEffect, useRef } from "react";
import { cardPorts } from "./connectionPorts";
import {
  sameEndpoint,
  type Endpoint,
  type Connection,
  type Reconnect,
} from "./connections";
import type { Card } from "./storage";
import { t as tr } from "./i18n";

export function ConnectionTargetDialog({
  cards,
  from,
  connections,
  reconnect,
  onConnect,
  onClose,
}: {
  cards: Card[];
  from: Endpoint;
  connections?: Connection[];
  reconnect?: Reconnect;
  onConnect: (to: Endpoint) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fixedEnd = reconnect?.end === "from" ? "to" : "from";
  const movingEnd = fixedEnd === "to" ? "from" : "to";
  const occupied =
    connections
      ?.filter((link) => sameEndpoint(link[fixedEnd], from))
      .map((link) => link[movingEnd]) ?? [];
  const targets = cards
    .filter((card) => card.id !== from.card)
    .map((card) => ({
      card,
      ports: cardPorts(card).filter(
        ({ endpoint }) =>
          !occupied.some((other) => sameEndpoint(endpoint, other)),
      ),
    }))
    .filter(({ ports }) => ports.length);
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const node = dialog.current!;
    node.showModal();
    return () => {
      node.close();
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        !opener.closest("[inert]")
      )
        opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal connection-target-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connection-target-title"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("endpoint");
          if (typeof value === "string")
            onConnect(JSON.parse(value) as Endpoint);
        }}
      >
        <div className="modal-heading">
          <h2 id="connection-target-title">{tr("选择连线目标")}</h2>
        </div>
        {targets.length ? (
          <select name="endpoint" aria-label={tr("目标端点")} autoFocus>
            {targets.map(({ card, ports }, index) => (
              <optgroup
                key={card.id}
                label={tr(
                  "组件 {0} · {1}",
                  index + 1,
                  card.masked || card.locked || card.displayMode === "small"
                    ? tr("组件")
                    : card.title || card.text.slice(0, 30) || tr("组件"),
                )}
              >
                {ports.map(({ endpoint, label }) => (
                  <option
                    key={JSON.stringify(endpoint)}
                    value={JSON.stringify(endpoint)}
                  >
                    {label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <p>{tr("当前画布没有可用的目标端点。")}</p>
        )}
        <footer className="modal-bottom">
          <button type="button" onClick={onClose}>
            {tr("取消")}
          </button>
          <button className="primary" disabled={!targets.length}>
            {tr("连接")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

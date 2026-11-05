import { useState } from "react";
import { createPortal } from "react-dom";
import { ContextSubmenu } from "./CanvasContextMenu";
import { Cloud, Plus, X } from "./icons";
import { CloudPanel } from "./CloudPanel";
import { serverOrigin } from "./cloud";
import { t as tr } from "./i18n";
import type { Board } from "./storage";
type Server = { id: string; name: string; origin: string; selected: boolean };
const KEY = "yua-cloud-servers";
const DEFAULT_SERVER: Server = {
  id: "default",
  name: "Yua Cloud",
  origin: "https://yua-worker.atlanmatrix.workers.dev",
  selected: false,
};
function read(): Server[] {
  let servers: Server[] = [
    { id: "local", name: "当前站点", origin: "", selected: false },
  ];
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(stored))
      servers = stored.filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          typeof s.selected === "boolean" &&
          (s.origin === "" || serverOrigin(s.origin) === s.origin),
      );
  } catch {}
  return servers.some((s) => s.origin === DEFAULT_SERVER.origin)
    ? servers
    : [{ ...DEFAULT_SERVER }, ...servers];
}
export function CloudServers(props: {
  board: Board;
  ready: boolean;
  restore: (b: Board) => void;
  onOpen: () => void;
}) {
  const [servers, setServers] = useState(read);
  const [editing, setEditing] = useState<string | null>(
    location.hash === "#cloud" ? "local" : null,
  );
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [address, setAddress] = useState(""),
    [error, setError] = useState("");
  function save(next: Server[]) {
    localStorage.setItem(KEY, JSON.stringify(next));
    setServers(next);
  }
  return (
    <>
      <ContextSubmenu
        label={tr("云同步与分享")}
        menuLabel={tr("同步服务器")}
        icon={<Cloud size={18} />}
        buttonClassName="settings-action"
        buttonRole="button"
      >
        {servers.map((s) => {
          const label = s.id === "local" ? tr(s.name) : s.name;
          return (
            <div key={s.id} className="cloud-server-row">
              <button
                role="menuitem"
                aria-label={label}
                onClick={() => {
                  setEditing(s.id);
                  props.onOpen();
                }}
              >
                <span>{label}</span>
              </button>
              <button
                role="switch"
                className="cloud-switch"
                aria-label={`${tr("自动同步")}：${label}`}
                aria-checked={s.selected}
                onClick={() =>
                  save(
                    servers.map((v) =>
                      v.id === s.id ? { ...v, selected: !v.selected } : v,
                    ),
                  )
                }
              >
                <span aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <div role="separator" className="cloud-menu-divider" />
        <button
          role="menuitem"
          onClick={() => {
            setAdding(true);
            props.onOpen();
          }}
        >
          <Plus size={16} />
          {tr("新增服务器")}
        </button>
      </ContextSubmenu>
      {servers.map((s) => (
        <CloudPanel
          key={s.id}
          {...props}
          server={s}
          selected={s.selected}
          onSelected={(selected) =>
            setServers((current) => {
              const next = current.map((v) =>
                v.id === s.id ? { ...v, selected } : v,
              );
              localStorage.setItem(KEY, JSON.stringify(next));
              return next;
            })
          }
          visible={editing === s.id}
          onClose={() => setEditing(null)}
        />
      ))}
      {adding &&
        createPortal(
          <div className="modal-backdrop">
            <form
              className="modal compact cloud-panel"
              role="dialog"
              aria-modal="true"
              aria-label={tr("新增服务器")}
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const origin = serverOrigin(address);
                  if (!name.trim()) throw Error("请输入服务器名称");
                  if (
                    servers.some(
                      (s) => (s.origin || location.origin) === origin,
                    )
                  )
                    throw Error("服务器已存在");
                  const server = {
                    id: crypto.randomUUID(),
                    name: name.trim(),
                    origin,
                    selected: false,
                  };
                  save([...servers, server]);
                  setAdding(false);
                  setName("");
                  setAddress("");
                  setError("");
                  setEditing(server.id);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <div className="modal-heading">
                <h2>{tr("新增服务器")}</h2>
                <button
                  type="button"
                  className="cloud-icon-button"
                  aria-label={tr("关闭")}
                  onClick={() => setAdding(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <label>
                {tr("服务器地址")}
                <input
                  required
                  type="url"
                  autoComplete="url"
                  placeholder="https://yua-worker.example.workers.dev"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <label>
                {tr("服务器名称")}
                <input
                  required
                  maxLength={80}
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {error && <p role="alert">{tr(error)}</p>}
              <button type="submit" className="cloud-primary">
                {tr("确认")}
              </button>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

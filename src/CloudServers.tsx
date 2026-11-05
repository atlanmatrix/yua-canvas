import { useState } from "react";
import { createPortal } from "react-dom";
import { ContextSubmenu } from "./CanvasContextMenu";
import { Cloud, X } from "./icons";
import { CloudPanel } from "./CloudPanel";
import { serverOrigin } from "./cloud";
import { t as tr } from "./i18n";
import type { Board } from "./storage";
type Server = { id: string; name: string; origin: string; selected: boolean };
const KEY = "yua-cloud-servers";
function read(): Server[] {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(stored))
      return stored.filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          typeof s.selected === "boolean" &&
          (s.origin === "" || serverOrigin(s.origin) === s.origin),
      );
  } catch {}
  return [
    {
      id: "local",
      name: "当前站点",
      origin: "",
      selected:
        !!localStorage.getItem("yua-cloud-baseline") &&
        localStorage.getItem("yua-cloud-paused") !== "yes",
    },
  ];
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
        <button
          role="menuitem"
          onClick={() => {
            setAdding(true);
            props.onOpen();
          }}
        >
          {tr("新增服务器")}
        </button>
        <div role="separator" />
        {servers.map((s) => (
          <div key={s.id} className="cloud-server-row">
            <button
              role="menuitemcheckbox"
              aria-checked={s.selected}
              aria-label={s.id === "local" ? tr(s.name) : s.name}
              onClick={() =>
                save(
                  servers.map((v) =>
                    v.id === s.id ? { ...v, selected: !v.selected } : v,
                  ),
                )
              }
            >
              <span aria-hidden="true">{s.selected ? "☑" : "☐"}</span>
              <span>{s.name === "当前站点" ? tr(s.name) : s.name}</span>
            </button>
            <button
              aria-label={`${tr("管理服务器")}：${s.id === "local" ? tr(s.name) : s.name}`}
              onClick={() => {
                setEditing(s.id);
                props.onOpen();
              }}
            >
              {tr("管理")}
            </button>
          </div>
        ))}
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
                  aria-label={tr("关闭")}
                  onClick={() => setAdding(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <label>
                {tr("服务器名称")}
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                {tr("服务器地址")}
                <input
                  required
                  type="url"
                  placeholder="https://yua-worker.example.workers.dev"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <p>
                {tr("新增后默认不选中；可同时选择多个服务器，也可全部取消。")}
              </p>
              {error && <p role="alert">{tr(error)}</p>}
              <button type="submit">{tr("添加服务器")}</button>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

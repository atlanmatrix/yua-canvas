import { t as tr } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "./icons";
import { cloudClient, CloudError, packCloud } from "./cloud";
import {
  type Board,
  exportBoard,
  saveBoard,
  saveRecovery,
  readRecovery,
} from "./storage";

let syncQueue: Promise<void> = Promise.resolve();
type Baseline = { owner: string; revision: number; fingerprint: string };
function baseline(META: string): Baseline | null {
  try {
    return JSON.parse(localStorage.getItem(META) || "null");
  } catch {
    return null;
  }
}
export function CloudPanel({
  board,
  ready,
  restore,
  server,
  selected,
  onSelected,
  visible,
  onClose,
}: {
  board: Board;
  ready: boolean;
  restore: (b: Board) => void;
  server: { id: string; name: string; origin: string };
  selected: boolean;
  onSelected: (value: boolean) => void;
  visible: boolean;
  onClose: () => void;
}) {
  const controller = useRef(new AbortController());
  const selection = useRef(selected);
  selection.current = selected;
  const { api, uploadCloud, unpackCloud, authKey } = useMemo(
    () => cloudClient(server.origin, () => controller.current.signal),
    [server.origin],
  );
  useEffect(() => {
    controller.current.abort();
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, [selected]);
  const META =
    server.id === "local"
      ? "yua-cloud-baseline"
      : "yua-cloud-baseline:" + server.id;
  const open = visible;
  const [user, setUser] = useState<{ owner_id: string; name: string } | null>(
      null,
    ),
    [available, setAvailable] = useState(false),
    [checking, setChecking] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [refreshVersion, setRefreshVersion] = useState(0),
    [status, setStatus] = useState("未连接云端"),
    [conflict, setConflict] = useState(false),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [days, setDays] = useState("7"),
    [shares, setShares] = useState<any[]>([]);
  const current = useRef(board),
    apply = useRef(restore),
    state = useRef<{ base: Baseline | null; busy: boolean; conflict: boolean }>(
      { base: null, busy: false, conflict: false },
    );
  current.current = board;
  apply.current = restore;
  function remember(b: Baseline) {
    localStorage.setItem(META, JSON.stringify(b));
    state.current.base = b;
  }
  function error(e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    setStatus(
      e instanceof DOMException && e.name === "TimeoutError"
        ? "云端请求超时，请稍后重试"
        : e instanceof Error
          ? e.message
          : "同步失败",
    );
    if (e instanceof CloudError && e.status === 409) {
      state.current.conflict = true;
      setConflict(true);
    }
  }
  async function lock(fn: () => Promise<void>) {
    if (state.current.busy) return;
    const previous = syncQueue;
    let release!: () => void;
    syncQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    state.current.busy = true;
    setBusy(true);
    try {
      await previous;
      await fn();
    } catch (e) {
      error(e);
    } finally {
      release();
      state.current.busy = false;
      setBusy(false);
    }
  }
  async function accept(remote: any, owner: string, manual = false) {
    const signal = controller.current.signal;
    const allowed = () => !signal.aborted && (manual || selection.current);
    if (!allowed()) return false;
    const before = current.current,
      next = await unpackCloud(remote.snapshot);
    const packed = await packCloud(next);
    if (!allowed() || current.current !== before)
      throw Error("读取期间发生编辑，请重试");
    await saveRecovery(before);
    if (!allowed() || current.current !== before)
      throw Error("读取期间发生编辑，请重试");
    await saveBoard(next);
    if (!allowed() || current.current !== before) {
      await saveBoard(current.current);
      throw Error("读取期间发生编辑，请重试");
    }
    remember({
      owner,
      revision: remote.revision,
      fingerprint: packed.fingerprint,
    });
    apply.current(next);
    setStatus(manual ? "已从云端拉取，本地原内容已备份" : "已与云端同步");
    return true;
  }
  async function push(owner: string, revision: number, manual = false) {
    const signal = controller.current.signal;
    const allowed = () => !signal.aborted && (manual || selection.current);
    if (!allowed()) return false;
    const source = current.current;
    setStatus("正在同步…");
    const result = await uploadCloud(source, revision);
    if (!allowed()) return false;
    remember({
      owner,
      revision: result.revision,
      fingerprint: result.fingerprint,
    });
    setStatus(manual ? "已上传至云端" : "已与云端同步");
    return true;
  }
  async function reconcile(owner: string, initial = false) {
    if (!selection.current || state.current.conflict) return;
    const source = current.current,
      packed = await packCloud(source),
      remote = await api("/canvas");
    if (!selection.current || current.current !== source) return;
    const base = state.current.base || baseline(META);
    const valid = base?.owner === owner ? base : null;
    if (!remote.snapshot) {
      await push(owner, 0);
      return;
    }
    if (!valid) {
      if (source.cards.length || source.groups.length) {
        state.current.conflict = true;
        setConflict(true);
        setStatus("本地和云端均有内容，请选择保留方式");
        return;
      }
      await accept(remote, owner);
      return;
    }
    state.current.base = valid;
    if (remote.revision !== valid.revision) {
      if (packed.fingerprint !== valid.fingerprint) {
        state.current.conflict = true;
        setConflict(true);
        setStatus("发现其他设备的修改，本地内容已保留");
        return;
      }
      await accept(remote, owner);
    } else if (packed.fingerprint !== valid.fingerprint)
      await push(owner, valid.revision);
    else if (initial) setStatus("已与云端同步");
  }
  function clearConflict() {
    state.current.conflict = false;
    setConflict(false);
  }
  async function transfer(direction: "pull" | "upload") {
    if (!user) return;
    await lock(async () => {
      const before = current.current;
      const remote = await api("/canvas");
      if (direction === "pull") {
        if (!remote.snapshot) {
          setStatus("云端暂无画布，本地内容未改变");
          return;
        }
        if (current.current !== before) throw Error("读取期间发生编辑，请重试");
        if (await accept(remote, user.owner_id, true)) clearConflict();
      } else {
        if (
          remote.snapshot &&
          !confirm(
            tr("将以当前本地内容创建云端新版本，其他设备需要重新同步。继续？"),
          )
        )
          return;
        if (await push(user.owner_id, remote.revision, true)) clearConflict();
      }
    });
  }
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!selected && !open) return;
    if (!online) {
      setAvailable(false);
      setChecking(false);
      setStatus("网络不可用，请联网后刷新连接状态");
      return;
    }
    let active = true;
    setChecking(true);
    api("/session")
      .then((d) => {
        if (!active) return;
        setAvailable(true);
        setUser(d.user);
        if (!selected)
          setStatus(d.user ? "已登录，请手动勾选开启自动同步" : "未连接云端");
      })
      .catch((e) => {
        if (!active || (e instanceof DOMException && e.name === "AbortError"))
          return;
        setAvailable(false);
        error(e);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [selected, open, refreshVersion, online]);
  useEffect(() => {
    if (!selected || !user || !ready) return;
    const run = () => void lock(() => reconcile(user.owner_id, true));
    run();
    const timer = setInterval(run, 15000);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
    };
  }, [selected, user, ready]);
  useEffect(() => {
    if (!selected || !user || !ready) return;
    const timer = setTimeout(
      () => void lock(() => reconcile(user.owner_id)),
      1500,
    );
    return () => clearTimeout(timer);
  }, [board, selected, user, ready]);
  async function loadShares() {
    const d = await api("/shares");
    setShares(d.shares);
  }
  useEffect(() => {
    if (open && user) void loadShares().catch(error);
  }, [open, user]);
  const download = async (b: Board, name: string) => {
    const url = URL.createObjectURL(
      new Blob([await exportBoard(b)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      {open &&
        createPortal(
          <div className="modal-backdrop">
            <section
              className="modal compact cloud-panel"
              role="dialog"
              aria-modal="true"
              aria-label={tr("云同步与分享")}
            >
              <div className="modal-heading">
                <h2>
                  {server.name} · {tr("云同步与分享")}
                </h2>
                <button aria-label={tr("关闭云同步")} onClick={onClose}>
                  <X size={18} />
                </button>
              </div>
              <p role="status">{tr(status)}</p>
              {!user ? (
                <>
                  <p>
                    {tr(
                      "本地数据继续保存在此浏览器。登录后不会自动同步，手动勾选后才同步整个工作区及附件。",
                    )}
                  </p>
                  <div className="cloud-actions">
                    <button
                      className="cloud-login"
                      disabled={!available || checking || !online}
                      onClick={() => {
                        if (!server.origin) {
                          location.href = "/api/auth/login";
                          return;
                        }
                        const popup = window.open(
                          server.origin + "/api/auth/login",
                          "yua-login-" + server.id,
                          "popup,width=600,height=720",
                        );
                        if (!popup) {
                          setStatus("请允许登录弹窗");
                          return;
                        }
                        const receive = (event: MessageEvent) => {
                          if (
                            event.origin !== server.origin ||
                            event.source !== popup ||
                            event.data?.type !== "yua-login" ||
                            !/^[a-f0-9]{64}$/.test(event.data.token)
                          )
                            return;
                          localStorage.setItem(authKey, event.data.token);
                          window.removeEventListener("message", receive);
                          void api("/session")
                            .then((d) => {
                              setUser(d.user);
                              setAvailable(true);
                              setStatus(
                                selection.current
                                  ? "自动同步已开启"
                                  : "已登录，请手动勾选开启自动同步",
                              );
                            })
                            .catch(error);
                        };
                        window.addEventListener("message", receive);
                        const timer = setInterval(() => {
                          if (popup.closed) {
                            clearInterval(timer);
                            window.removeEventListener("message", receive);
                          }
                        }, 1000);
                      }}
                    >
                      {tr("使用 GitHub 登录")}
                    </button>
                    <button
                      disabled={checking}
                      onClick={() => setRefreshVersion((v) => v + 1)}
                    >
                      {checking ? tr("正在检查连接…") : tr("刷新连接状态")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    {tr("账号：")}
                    {user.name} ·{" "}
                    {selected ? tr("自动同步已开启") : tr("自动同步未开启")}
                  </p>
                  <div className="cloud-actions">
                    <label className="cloud-sync-option">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={busy || !ready}
                        onChange={(e) => {
                          onSelected(e.target.checked);
                          if (!e.target.checked) setStatus("自动同步已暂停");
                        }}
                      />
                      {tr("自动同步")}
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void lock(async () => {
                          await api("/auth/logout", {
                            method: "POST",
                            body: "{}",
                          });
                          onSelected(false);
                          setUser(null);
                          localStorage.removeItem(authKey);
                          state.current.base = null;
                          localStorage.removeItem(META);
                          setStatus("已退出，画布保留在本地");
                        })
                      }
                    >
                      {tr("退出登录")}
                    </button>
                  </div>
                  <div className="cloud-actions">
                    <button
                      disabled={busy || !ready || !online || !available}
                      onClick={() => void transfer("pull")}
                    >
                      {tr("手动拉取")}
                    </button>
                    <button
                      disabled={busy || !ready || !online || !available}
                      onClick={() => void transfer("upload")}
                    >
                      {tr("手动上传")}
                    </button>
                  </div>
                  <p>
                    {tr(
                      "手动操作不启用自动同步。拉取将采用云端内容，并在本机备份原内容；上传将以本地内容创建云端新版本。",
                    )}
                  </p>
                  {conflict && (
                    <div className="cloud-conflict">
                      <p>
                        {tr(
                          "同步已暂停，不会覆盖任何一端。采用云端前会在本机保留一份恢复副本。",
                        )}
                      </p>
                      <div className="cloud-actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            void download(current.current, "本地画布备份.json")
                          }
                        >
                          {tr("下载本地副本")}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void lock(async () => {
                              const remote = await api("/canvas");
                              if (await accept(remote, user.owner_id, true))
                                clearConflict();
                            })
                          }
                        >
                          {tr("备份本地并采用云端")}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              !confirm(
                                tr(
                                  "将以当前本地内容创建云端新版本，其他设备需要重新同步。继续？",
                                ),
                              )
                            )
                              return;
                            void lock(async () => {
                              const remote = await api("/canvas");
                              if (
                                await push(user.owner_id, remote.revision, true)
                              )
                                clearConflict();
                            });
                          }}
                        >
                          {tr("以本地内容发布新版本")}
                        </button>
                      </div>
                    </div>
                  )}
                  <hr />
                  <p>
                    {tr(
                      "分享整个工作区的只读快照。持有链接的人可以查看并下载附件。",
                    )}
                  </p>
                  <label>
                    {tr("链接有效期")}{" "}
                    <select
                      aria-label={tr("分享有效期")}
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                    >
                      <option value="1">{tr("1 天")}</option>
                      <option value="7">{tr("7 天")}</option>
                      <option value="30">{tr("30 天")}</option>
                      <option value="">{tr("永久")}</option>
                    </select>
                  </label>
                  <button
                    disabled={busy || conflict || !ready || !selected}
                    onClick={() =>
                      void lock(async () => {
                        await reconcile(user.owner_id);
                        if (!selection.current || state.current.conflict)
                          return;
                        const packed = await packCloud(current.current);
                        if (
                          packed.fingerprint !== state.current.base?.fingerprint
                        )
                          throw Error("画布仍在编辑，请稍后重新生成分享");
                        const d = await api("/shares", {
                          method: "POST",
                          body: JSON.stringify({
                            expiresInDays: days ? Number(days) : null,
                            expectedRevision: state.current.base?.revision,
                          }),
                        });
                        setLink(
                          location.origin +
                            location.pathname +
                            "#/s/" +
                            d.token +
                            (server.origin
                              ? "?server=" + encodeURIComponent(server.origin)
                              : ""),
                        );
                        await loadShares();
                      })
                    }
                  >
                    {tr("生成分享链接")}
                  </button>
                  {link && (
                    <label>
                      {tr("分享地址")}
                      <input
                        aria-label={tr("分享地址")}
                        readOnly
                        value={link}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(link)
                            .then(() => setStatus("分享链接已复制"))
                            .catch(() => setStatus("请选中地址后手动复制"))
                        }
                      >
                        {tr("复制链接")}
                      </button>
                    </label>
                  )}
                  <div className="cloud-share-list">
                    {shares.map((s) => (
                      <div key={s.id}>
                        <span>
                          {new Date(s.created_at).toLocaleString()} ·{" "}
                          {s.revoked_at
                            ? tr("已撤销")
                            : s.expires_at && s.expires_at < Date.now()
                              ? tr("已过期")
                              : tr("可访问")}
                        </span>
                        <button
                          disabled={busy || !!s.revoked_at}
                          onClick={() =>
                            void lock(async () => {
                              await api("/shares/" + s.id, {
                                method: "DELETE",
                              });
                              await loadShares();
                              setStatus("分享已撤销");
                            })
                          }
                        >
                          {tr("撤销")}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button
                onClick={() =>
                  void readRecovery()
                    .then((b) =>
                      b
                        ? download(b, "同步前恢复副本.json")
                        : setStatus("暂无恢复副本"),
                    )
                    .catch(error)
                }
              >
                {tr("下载上次同步前的本地副本")}
              </button>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

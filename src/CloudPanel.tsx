import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Cloud, X } from "lucide-react";
import { api, CloudError, packCloud, unpackCloud, uploadCloud } from "./cloud";
import {
  type Board,
  exportBoard,
  saveBoard,
  saveRecovery,
  readRecovery,
} from "./storage";
const META = "yua-cloud-baseline";
type Baseline = { owner: string; revision: number; fingerprint: string };
function baseline(): Baseline | null {
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
}: {
  board: Board;
  ready: boolean;
  restore: (b: Board) => void;
}) {
  const [open, setOpen] = useState(location.hash === "#cloud"),
    [user, setUser] = useState<{ owner_id: string; name: string } | null>(null),
    [available, setAvailable] = useState(true),
    [enabled, setEnabled] = useState(false),
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
    setStatus(e instanceof Error ? e.message : "同步失败");
    if (e instanceof CloudError && e.status === 409) {
      state.current.conflict = true;
      setConflict(true);
    }
  }
  async function lock(fn: () => Promise<void>) {
    if (state.current.busy) return;
    state.current.busy = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      error(e);
    } finally {
      state.current.busy = false;
      setBusy(false);
    }
  }
  async function accept(remote: any, owner: string) {
    const before = current.current,
      next = await unpackCloud(remote.snapshot);
    const packed = await packCloud(next);
    if (current.current !== before) throw Error("读取期间发生编辑，请重试");
    await saveRecovery(before);
    if (current.current !== before) throw Error("读取期间发生编辑，请重试");
    await saveBoard(next);
    if (current.current !== before) {
      await saveBoard(current.current);
      throw Error("读取期间发生编辑，请重试");
    }
    remember({
      owner,
      revision: remote.revision,
      fingerprint: packed.fingerprint,
    });
    apply.current(next);
    setStatus("已与云端同步");
  }
  async function push(owner: string, revision: number) {
    const source = current.current;
    setStatus("正在同步…");
    const result = await uploadCloud(source, revision);
    remember({
      owner,
      revision: result.revision,
      fingerprint: result.fingerprint,
    });
    setStatus("已与云端同步");
  }
  async function reconcile(owner: string, initial = false) {
    if (state.current.conflict) return;
    const source = current.current,
      packed = await packCloud(source),
      remote = await api("/canvas");
    if (current.current !== source) return;
    const base = state.current.base || baseline();
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
  useEffect(() => {
    api("/session")
      .then((d) => {
        setUser(d.user);
        if (
          d.user &&
          baseline()?.owner === d.user.owner_id &&
          localStorage.getItem("yua-cloud-paused") !== "yes"
        )
          setEnabled(true);
      })
      .catch((e) => {
        setAvailable(false);
        error(e);
      });
  }, []);
  useEffect(() => {
    if (!enabled || !user || !ready) return;
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
  }, [enabled, user, ready]);
  useEffect(() => {
    if (!enabled || !user || !ready) return;
    const timer = setTimeout(
      () => void lock(() => reconcile(user.owner_id)),
      1500,
    );
    return () => clearTimeout(timer);
  }, [board, enabled, user, ready]);
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
      <button
        className="floating-button"
        aria-label={tr("云同步与分享")}
        title={tr("云同步与分享")}
        onClick={() => setOpen(true)}
      >
        <Cloud size={18} />
      </button>
      {open && (
        <div className="modal-backdrop">
          <section
            className="modal compact cloud-panel"
            role="dialog"
            aria-modal="true"
            aria-label={tr("云同步与分享")}
          >
            <div className="modal-heading">
              <h2>{tr("云同步与分享")}</h2>
              <button
                aria-label={tr("关闭云同步")}
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p role="status">{tr(status)}</p>
            {!user ? (
              <>
                <p>
                  {tr(
                    "本地数据继续保存在此浏览器。登录并连接后，同步整个工作区及附件。",
                  )}
                </p>
                {available && (
                  <a className="cloud-login" href="/api/auth/login">
                    {tr("使用 GitHub 登录")}
                  </a>
                )}
              </>
            ) : (
              <>
                <p>
                  {tr("账号：")}
                  {user.name} ·{" "}
                  {enabled ? tr("自动同步已开启") : tr("自动同步未开启")}
                </p>
                <div className="cloud-actions">
                  <button
                    disabled={busy || !ready}
                    onClick={() => {
                      localStorage.removeItem("yua-cloud-paused");
                      setEnabled(true);
                      void lock(() => reconcile(user.owner_id, true));
                    }}
                  >
                    {tr("连接并同步")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      localStorage.setItem("yua-cloud-paused", "yes");
                      setEnabled(false);
                      setStatus("自动同步已暂停");
                    }}
                  >
                    {tr("暂停同步")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void lock(async () => {
                        await api("/auth/logout", {
                          method: "POST",
                          body: "{}",
                        });
                        setEnabled(false);
                        setUser(null);
                        state.current.base = null;
                        localStorage.removeItem(META);
                        setStatus("已退出，画布保留在本地");
                      })
                    }
                  >
                    {tr("退出登录")}
                  </button>
                </div>
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
                            await accept(remote, user.owner_id);
                            state.current.conflict = false;
                            setConflict(false);
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
                            await push(user.owner_id, remote.revision);
                            state.current.conflict = false;
                            setConflict(false);
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
                  disabled={busy || conflict || !ready}
                  onClick={() =>
                    void lock(async () => {
                      await reconcile(user.owner_id);
                      if (state.current.conflict) return;
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
                        location.origin + location.pathname + "#/s/" + d.token,
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
                            await api("/shares/" + s.id, { method: "DELETE" });
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
        </div>
      )}
    </>
  );
}

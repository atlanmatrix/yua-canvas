import { useEffect, useRef, useState } from "react";
import { LockKeyhole, X } from "./icons";
import { t as tr } from "./i18n";
export function LockedContent({ onUnlock }: { onUnlock?: () => void }) {
  return (
    <div className="component-locked" aria-label={tr("已锁定组件")}>
      <LockKeyhole size={28} />
      <span>{tr("已锁定组件")}</span>
      {onUnlock && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onUnlock();
          }}
        >
          {tr("密码解锁")}
        </button>
      )}
    </div>
  );
}
export function ComponentLockDialog({
  mode,
  first = false,
  inherited = false,
  automatic = false,
  onSubmit,
  onClose,
}: {
  mode: "lock" | "unlock" | "relock" | "copy" | "remove";
  first?: boolean;
  inherited?: boolean;
  automatic?: boolean;
  onSubmit: (password: string) => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  // Keep this decision fixed: successful manual verification must not start
  // a second operation when it grants authorization during the same submit.
  const auto = useRef(automatic).current;
  const started = useRef(false);
  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    setBusy(true);
    void onSubmit("")
      .catch((error) => {
        setError(
          error instanceof Error ? error.message : "加密操作失败，请重试",
        );
      })
      .finally(() => setBusy(false));
  }, [auto, onSubmit]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
      }
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [onClose, busy]);
  const label = first
    ? tr("设置主密码")
    : mode === "remove"
      ? tr("取消加密")
      : mode === "unlock"
        ? tr("解锁组件")
        : mode === "copy"
          ? tr("复制加密组件")
          : tr("锁定组件");
  if (auto && !error) return null;
  return (
    <div className="modal-backdrop">
      <form
        className="modal compact component-lock-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          if (first && password !== confirmation) {
            setError("两次输入的密码不一致");
            return;
          }
          setBusy(true);
          try {
            await onSubmit(password);
          } catch (e) {
            setError(e instanceof Error ? e.message : "加密操作失败，请重试");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-heading">
          <span>
            <LockKeyhole size={18} />
            {label}
          </span>
          <button
            type="button"
            aria-label={tr("关闭")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p>
          {tr(
            mode === "remove"
              ? "请输入主密码。取消加密后，组件将恢复普通状态，后续保存、导出和同步会包含明文内容。"
              : first
                ? "设置工作区主密码。所有组件共用此密码，每个组件使用独立的加密密钥。"
                : mode === "lock" || mode === "relock"
                  ? "验证主密码后，本次会话可直接加密。"
                  : "请输入工作区主密码。解锁仅在当前会话有效，保存与同步仍保持加密。",
          )}
        </p>
        {mode === "remove" && inherited && (
          <p>
            {tr(
              "此组件仍受上级加密画布保护；若需完全取消保护，请取消上级画布的加密。",
            )}
          </p>
        )}
        <label>
          {tr("主密码")}
          <input
            autoFocus
            aria-label={tr("主密码")}
            type="password"
            autoComplete={first ? "new-password" : "current-password"}
            minLength={first ? 8 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        {first && (
          <label>
            {tr("确认主密码")}
            <input
              aria-label={tr("确认主密码")}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {first && (
          <small>
            {tr("主密码至少 8 个字符，不会被保存；遗忘后无法恢复加密内容。")}
          </small>
        )}
        {error && <p role="alert">{tr(error)}</p>}
        <div className="modal-bottom">
          <button type="button" disabled={busy} onClick={onClose}>
            {tr("取消")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? tr("正在加解密…") : label}
          </button>
        </div>
      </form>
    </div>
  );
}

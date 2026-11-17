import { useEffect, useState } from "react";
import { LockKeyhole, X } from "./icons";
import { t as tr } from "./i18n";
export type PasswordAction = "setup" | "verify" | "change" | "clear";
export function MasterPasswordDialog({
  mode,
  onSubmit,
  onClose,
}: {
  mode: Exclude<PasswordAction, "clear">;
  onSubmit: (password: string, newPassword: string) => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label =
    mode === "setup"
      ? "设置主密码"
      : mode === "change"
        ? "修改主密码"
        : "验证主密码";
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [busy, onClose]);
  return (
    <div className="modal-backdrop">
      <form
        className="modal compact component-lock-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr(label)}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setError("");
          if (mode !== "verify" && next !== confirmation) {
            setError("两次输入的密码不一致");
            return;
          }
          setBusy(true);
          try {
            await onSubmit(password, next);
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "加密操作失败，请重试",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-heading">
          <span>
            <LockKeyhole size={18} />
            {tr(label)}
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
            mode === "change"
              ? "修改后当前工作区将使用新密码，并重新锁定加密组件。旧备份和旧分享仍需原密码。"
              : mode === "verify"
                ? "验证后，本次会话可直接加密；刷新页面后需要重新验证。"
                : "主密码至少 8 个字符，不会被保存；遗忘后无法恢复加密内容。",
          )}
        </p>
        {mode !== "setup" && (
          <label>
            {tr(mode === "change" ? "原密码" : "主密码")}
            <input
              autoFocus
              type="password"
              autoComplete="current-password"
              required
              disabled={busy}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
        {mode !== "verify" && (
          <>
            <label>
              {tr("新密码")}
              <input
                autoFocus={mode === "setup"}
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={busy}
                value={next}
                onChange={(event) => setNext(event.target.value)}
              />
            </label>
            <label>
              {tr("确认新密码")}
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={busy}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </>
        )}
        {error && <p role="alert">{tr(error)}</p>}
        <div className="modal-bottom">
          <button type="button" disabled={busy} onClick={onClose}>
            {tr("取消")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? tr("正在加解密…") : tr(label)}
          </button>
        </div>
      </form>
    </div>
  );
}

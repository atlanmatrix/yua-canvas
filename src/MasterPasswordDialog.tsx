import { useLayoutEffect, useRef, useState } from "react";
import { LockKeyhole, X } from "./icons";
import { t as tr } from "./i18n";
export type PasswordAction = "setup" | "verify" | "change" | "clear";

export function MasterPasswordSettingsDialog({
  configured,
  verified,
  onAction,
  onClear,
  onClose,
}: {
  configured: boolean;
  verified: boolean;
  onAction: (action: Exclude<PasswordAction, "clear">) => void;
  onClear: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const returnTarget =
      opener instanceof HTMLElement && opener.closest(".settings-popover")
        ? document.querySelector<HTMLElement>(".settings-trigger")
        : opener;
    const node = dialog.current!;
    node.showModal();
    return () => {
      node.close();
      if (
        returnTarget instanceof HTMLElement &&
        returnTarget.isConnected &&
        !returnTarget.closest("[inert]")
      )
        returnTarget.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal compact component-lock-dialog master-password-dialog"
      role="dialog"
      aria-label={tr("主密码管理")}
      aria-modal="true"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          if (!busy) onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{tr("主密码")}</h2>
        <button disabled={busy} aria-label={tr("关闭")} onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="master-password-status" role="status">
        <LockKeyhole size={18} />
        {tr(
          !configured
            ? "未设置"
            : verified
              ? "已设置 · 已验证"
              : "已设置 · 未验证",
        )}
      </div>
      <div className="master-password-actions">
        {!configured ? (
          <button autoFocus onClick={() => onAction("setup")}>
            {tr("设置主密码")}
          </button>
        ) : (
          <>
            <button
              autoFocus
              disabled={busy}
              onClick={async () => {
                if (!verified) {
                  onAction("verify");
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  await onClear();
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "加密操作失败，请重试",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr(verified ? "清除会话授权" : "验证主密码")}
            </button>
            <button disabled={busy} onClick={() => onAction("change")}>
              {tr("修改主密码")}
            </button>
          </>
        )}
      </div>
      {error && <p role="alert">{tr(error)}</p>}
      <div className="modal-bottom">
        <button disabled={busy} onClick={onClose}>
          {tr("关闭")}
        </button>
      </div>
    </dialog>
  );
}

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
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const returnTarget =
      opener instanceof HTMLElement && opener.closest(".settings-popover")
        ? document.querySelector<HTMLElement>(".settings-trigger")
        : opener;
    const node = dialog.current!;
    node.showModal();
    return () => {
      node.close();
      if (
        returnTarget instanceof HTMLElement &&
        returnTarget.isConnected &&
        !returnTarget.closest("[inert]")
      )
        returnTarget.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal compact component-lock-dialog master-password-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={tr(label)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") {
          event.preventDefault();
          if (!busy) onClose();
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          dialog.current?.querySelector("form")?.requestSubmit();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
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
          <h2>{tr(label)}</h2>
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
    </dialog>
  );
}

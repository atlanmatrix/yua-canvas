import { navigateMenu } from "./menuKeyboard";
import { useEffect, useId, useRef, useState } from "react";
import { Settings, Upload, X, LockKeyhole } from "./icons";
import { CloudServers } from "./CloudServers";
import { PreferencesControls } from "./PreferencesControls";
import { PwaControls } from "./PwaControls";
import { t as tr } from "./i18n";
import type { Board } from "./storage";
import { ExportMenu, type ExportFormat } from "./ExportMenu";
import { MenuButton } from "./MenuShortcut";

export function SettingsMenu({
  board,
  ready,
  restore,
  saveStatus,
  beforeUpdate,
  onImport,
  onExport,
  exporting,
  onPassword,
}: {
  board: Board;
  ready: boolean;
  restore: (board: Board) => void;
  saveStatus: string;
  beforeUpdate: () => Promise<void>;
  onImport: () => void;
  onExport: (format: ExportFormat) => void;
  exporting?: boolean;
  onPassword: () => void;
}) {
  const id = useId(),
    panel = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [cloudAlert, setCloudAlert] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const close = (restoreFocus = false) => {
    panel.current?.hidePopover?.();
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const attention =
    saveStatus === "保存失败"
      ? "error"
      : cloudAlert || !online
        ? "warn"
        : undefined;
  const attentionText =
    saveStatus === "保存失败"
      ? tr("保存失败")
      : cloudAlert
        ? tr("云同步需要关注")
        : !online
          ? tr("当前处于离线状态")
          : tr(saveStatus);
  return (
    <div className="settings-menu save-indicator" data-state={saveStatus}>
      <button
        ref={trigger}
        className="floating-button settings-trigger"
        data-attention={attention}
        aria-label={tr("设置")}
        data-tooltip={`${tr("设置")} · ${attentionText}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
      >
        <Settings size={18} />
        {attention && <span className="settings-badge" aria-hidden="true" />}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="settings-popover"
        role={open ? "dialog" : undefined}
        aria-label={tr("设置")}
        onToggle={(event) => {
          const expanded = event.currentTarget.matches(":popover-open");
          setOpen(expanded);
          if (
            expanded &&
            document.activeElement?.matches(".settings-trigger:focus-visible")
          )
            event.currentTarget
              .querySelector<HTMLButtonElement>("button:enabled")
              ?.focus({ preventScroll: true });
        }}
        onKeyDownCapture={(event) => {
          if (!(event.metaKey || event.ctrlKey)) return;
          const key = event.key.toLowerCase();
          if (ready && (key === "o" || (key === "e" && event.shiftKey))) {
            event.preventDefault();
            event.stopPropagation();
            close();
            if (key === "o") onImport();
            else onExport("canvas");
          }
        }}
        onKeyDown={(event) => {
          navigateMenu(event);
          event.stopPropagation();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="settings-heading">
          <h2>{tr("设置")}</h2>
          <button aria-label={tr("关闭设置")} onClick={() => close(true)}>
            <X size={18} />
          </button>
        </div>
        <PreferencesControls showLabels />
        <button
          className="settings-action"
          disabled={!ready}
          onClick={() => {
            close();
            onPassword();
          }}
        >
          <LockKeyhole size={18} />
          <span>{tr("主密码")}</span>
        </button>
        <CloudServers
          board={board}
          ready={ready}
          restore={restore}
          onOpen={() => close()}
          onAttentionChange={setCloudAlert}
        />
        <MenuButton
          className="settings-action"
          shortcut="import"
          disabled={!ready}
          onClick={() => {
            close();
            onImport();
          }}
        >
          <Upload size={18} />
          <span>{tr("导入")}</span>
        </MenuButton>
        <ExportMenu
          key={open ? "open" : "closed"}
          settings
          disabled={!ready || exporting}
          onExport={(format) => {
            close();
            onExport(format);
          }}
        />
        <PwaControls beforeUpdate={beforeUpdate} />
        <div
          className={
            "settings-save-status" + (saveStatus === "保存失败" ? " error" : "")
          }
          role="status"
        >
          <span aria-hidden="true" />
          {tr(saveStatus)}
        </div>
      </div>
    </div>
  );
}

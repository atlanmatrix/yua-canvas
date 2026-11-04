import { useId, useRef, useState } from "react";
import { Download, Settings, Upload, X } from "lucide-react";
import { CloudPanel } from "./CloudPanel";
import { PreferencesControls } from "./PreferencesControls";
import { PwaControls } from "./PwaControls";
import { t as tr } from "./i18n";
import type { Board } from "./storage";

export function SettingsMenu({
  board,
  ready,
  restore,
  saveStatus,
  beforeUpdate,
  onImport,
  onExport,
}: {
  board: Board;
  ready: boolean;
  restore: (board: Board) => void;
  saveStatus: string;
  beforeUpdate: () => Promise<void>;
  onImport: () => void;
  onExport: () => void;
}) {
  const id = useId(),
    panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => panel.current?.hidePopover();
  return (
    <div className="settings-menu save-indicator" data-state={saveStatus}>
      <button
        className="floating-button settings-trigger"
        aria-label={tr("设置")}
        title={`${tr("设置")} · ${tr(saveStatus)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
      >
        <Settings size={18} />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="settings-popover"
        role={open ? "dialog" : undefined}
        aria-label={tr("设置")}
        onToggle={(event) =>
          setOpen(event.currentTarget.matches(":popover-open"))
        }
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="settings-heading">
          <h2>{tr("设置")}</h2>
          <button aria-label={tr("关闭设置")} onClick={close}>
            <X size={18} />
          </button>
        </div>
        <PreferencesControls showLabels />
        <CloudPanel
          board={board}
          ready={ready}
          restore={restore}
          onOpen={close}
        />
        <button
          className="settings-action"
          disabled={!ready}
          onClick={() => {
            close();
            onImport();
          }}
        >
          <Upload size={18} />
          <span>{tr("导入")}</span>
        </button>
        <button
          className="settings-action"
          disabled={!ready}
          onClick={() => {
            close();
            onExport();
          }}
        >
          <Download size={18} />
          <span>{tr("导出画布")}</span>
        </button>
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

import { useId, useRef, useState } from "react";
import { Settings, Upload, X } from "./icons";
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
}: {
  board: Board;
  ready: boolean;
  restore: (board: Board) => void;
  saveStatus: string;
  beforeUpdate: () => Promise<void>;
  onImport: () => void;
  onExport: (format: ExportFormat) => void;
  exporting?: boolean;
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
        <CloudServers
          board={board}
          ready={ready}
          restore={restore}
          onOpen={close}
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

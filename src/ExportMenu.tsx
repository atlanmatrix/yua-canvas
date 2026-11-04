import { Download, PanelsTopLeft, Package, Image } from "lucide-react";
import { ContextSubmenu } from "./CanvasContextMenu";
import { MenuButton } from "./MenuShortcut";
import { t as tr } from "./i18n";
export type ExportFormat = "canvas" | "archive" | "png";
export function ExportMenu({
  onExport,
  disabled,
  settings = false,
}: {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
  settings?: boolean;
}) {
  return (
    <ContextSubmenu
      label={tr("导出")}
      menuLabel={tr("导出格式")}
      icon={<Download size={settings ? 18 : 14} />}
      buttonClassName={settings ? "settings-action" : undefined}
      buttonRole={settings ? "button" : "menuitem"}
      disabled={disabled}
    >
      <MenuButton
        role="menuitem"
        disabled={disabled}
        shortcut={settings ? "export" : undefined}
        onClick={() => onExport("canvas")}
      >
        <PanelsTopLeft size={14} />
        <span>{tr("画布")}</span>
      </MenuButton>
      <MenuButton
        role="menuitem"
        disabled={disabled}
        onClick={() => onExport("archive")}
      >
        <Package size={14} />
        <span>{tr("组件压缩包")}</span>
      </MenuButton>
      <MenuButton
        role="menuitem"
        disabled={disabled}
        onClick={() => onExport("png")}
      >
        <Image size={14} />
        <span>{tr("PNG 图像")}</span>
      </MenuButton>
    </ContextSubmenu>
  );
}

import {
  Download,
  PanelsTopLeft,
  Package,
  Image,
  Code2,
  FileText,
} from "./icons";
import { ContextSubmenu } from "./CanvasContextMenu";
import { MenuButton } from "./MenuShortcut";
import { t as tr } from "./i18n";
export type ExportFormat =
  "canvas" | "archive" | "png" | "pdf" | "html" | "file";
export function ExportMenu({
  onExport,
  disabled,
  settings = false,
  singleComponent = false,
}: {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
  settings?: boolean;
  singleComponent?: boolean;
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
        onClick={() => onExport(singleComponent ? "file" : "archive")}
      >
        {singleComponent ? <FileText size={14} /> : <Package size={14} />}
        <span>{tr(singleComponent ? "文件" : "组件压缩包")}</span>
      </MenuButton>
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
        onClick={() => onExport("png")}
      >
        <Image size={14} />
        <span>{tr("PNG 图像")}</span>
      </MenuButton>
      {!settings && (
        <>
          <MenuButton
            role="menuitem"
            disabled={disabled}
            onClick={() => onExport("pdf")}
          >
            <FileText size={14} />
            <span>{tr("PDF 文档")}</span>
          </MenuButton>
          <MenuButton
            role="menuitem"
            disabled={disabled}
            onClick={() => onExport("html")}
          >
            <Code2 size={14} />
            <span>{tr("HTML 网页")}</span>
          </MenuButton>
        </>
      )}
    </ContextSubmenu>
  );
}

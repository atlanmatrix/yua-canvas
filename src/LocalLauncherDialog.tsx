import { t as tr } from "./i18n";
import { useState } from "react";
import { Download, X } from "lucide-react";
import {
  downloadLauncherInstaller,
  markLauncherInstalled,
} from "./localAppLauncher";

export function LocalLauncherDialog({
  pending,
  onReady,
  onClose,
}: {
  pending: boolean;
  onReady: () => void;
  onClose: () => void;
}) {
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="modal-backdrop">
      <div
        className="modal compact local-launcher-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr("设置 iTerm2 本地打开器")}
      >
        <div className="modal-heading">
          <h2>{tr("连接本机 iTerm2")}</h2>
          <button aria-label={tr("关闭打开器设置")} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p>
          {tr(
            "在当前浏览器首次使用时，需在 Mac 上安装一次打开器。请先确保已安装 iTerm2。",
          )}
        </p>
        <ol>
          <li>{tr("下载并解压本地打开器。")}</li>
          <li>{tr("双击其中的「安装 Canvas 打开器.command」。")}</li>
          <li>
            {tr("安装完成后回到此处；系统询问时允许打开应用、控制 iTerm2。")}
          </li>
        </ol>
        <p>
          {tr("打开器只接收当前浏览器配对的请求；画布分享不会包含配对信息。")}
        </p>
        {error && <p role="alert">{tr(error)}</p>}
        <div className="modal-bottom">
          <button
            className="button"
            onClick={() => {
              try {
                downloadLauncherInstaller();
                setDownloaded(true);
                setError("");
              } catch {
                setError(
                  "无法保存本地打开器设置，请允许当前站点使用本地存储后重试",
                );
              }
            }}
          >
            <Download size={15} />
            {tr("下载打开器")}
          </button>
          <button
            className="primary"
            disabled={!downloaded}
            onClick={() => {
              try {
                markLauncherInstalled();
                onReady();
              } catch {
                setError("无法保存本地打开器设置，请重试");
              }
            }}
          >
            {pending ? tr("安装完成，执行命令") : tr("安装完成")}
          </button>
        </div>
      </div>
    </div>
  );
}

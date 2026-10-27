import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import { registerPwa } from "./pwa";
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function PwaControls({
  beforeUpdate,
}: {
  beforeUpdate: () => Promise<void>;
}) {
  const [install, setInstall] = useState<InstallPrompt>(),
    [waiting, setWaiting] = useState<ServiceWorker>(),
    [online, setOnline] = useState(navigator.onLine),
    [updating, setUpdating] = useState(false),
    [error, setError] = useState("");
  const save = useRef(beforeUpdate),
    reload = useRef(false);
  save.current = beforeUpdate;
  useEffect(() => {
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const installed = () => setInstall(undefined),
      connection = () => setOnline(navigator.onLine);
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);
  useEffect(() => {
    let active = true,
      registration: ServiceWorkerRegistration | undefined;
    const workers = new Set<ServiceWorker>();
    const check = () => {
      if (active) setWaiting(registration?.waiting || undefined);
    };
    const installing = () => {
      const worker = registration?.installing;
      if (worker && !workers.has(worker)) {
        workers.add(worker);
        worker.addEventListener("statechange", check);
      }
    };
    const changed = () => {
      if (reload.current) location.reload();
    };
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.addEventListener("controllerchange", changed);
    void registerPwa().then((value) => {
      if (!active) return;
      registration = value;
      check();
      installing();
      registration?.addEventListener("updatefound", installing);
    });
    return () => {
      active = false;
      registration?.removeEventListener("updatefound", installing);
      workers.forEach((worker) =>
        worker.removeEventListener("statechange", check),
      );
      if ("serviceWorker" in navigator)
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          changed,
        );
    };
  }, []);
  return (
    <>
      {!online && (
        <span
          className="pwa-offline"
          role="status"
          title="离线模式：继续保存到本地，联网后可恢复云同步"
        >
          <WifiOff size={16} />
          离线
        </span>
      )}
      {install && (
        <button
          className="floating-button"
          aria-label="安装 Canvas of Yua"
          title="安装 Canvas of Yua"
          onClick={() => {
            void install
              .prompt()
              .then(() => install.userChoice)
              .then(() => setInstall(undefined))
              .catch(() => setError("请使用浏览器菜单安装应用"));
          }}
        >
          <Download size={18} />
        </button>
      )}
      {waiting && (
        <button
          className="floating-button"
          aria-label="更新应用"
          title="发现新版本，保存画布后更新并重新加载"
          disabled={updating}
          onClick={() => {
            setUpdating(true);
            setError("");
            void save
              .current()
              .then(() => {
                reload.current = true;
                waiting.postMessage({ type: "SKIP_WAITING" });
              })
              .catch((e) => {
                setUpdating(false);
                setError(
                  e instanceof Error ? e.message : "保存失败，请稍后更新",
                );
              });
          }}
        >
          <RefreshCw size={18} />
        </button>
      )}
      {error && (
        <span className="pwa-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

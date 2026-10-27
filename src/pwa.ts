let registration: Promise<ServiceWorkerRegistration | undefined> | undefined;
export function registerPwa() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator))
    return Promise.resolve(undefined);
  return (registration ||= navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: "none",
    })
    .catch(() => undefined));
}

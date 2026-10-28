export type PdfBitmap = {
  blob: Blob;
  page: number;
  pages: number;
  width: number;
  height: number;
};
type Entry = PdfBitmap & { key: string; used: number; bytes: number };
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("yua-preview-cache", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("pdf", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error("Preview cache unavailable"));
  }).catch((error) => {
    database = undefined;
    throw error;
  }));
}
export async function readPdfBitmap(
  key: string,
): Promise<PdfBitmap | undefined> {
  try {
    const database = await db();
    return await new Promise((resolve, reject) => {
      const tx = database.transaction("pdf", "readonly"),
        request = tx.objectStore("pdf").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}
export async function savePdfBitmap(key: string, value: PdfBitmap) {
  try {
    const database = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("pdf", "readwrite"),
        store = tx.objectStore("pdf");
      const entry: Entry = {
        ...value,
        key,
        used: Date.now(),
        bytes: value.blob.size,
      };
      store.put(entry);
      const all = store.getAll();
      all.onsuccess = () => {
        const entries = (all.result as Entry[]).sort((a, b) => b.used - a.used);
        let bytes = 0;
        entries.forEach((e, i) => {
          bytes += e.bytes;
          if (i >= 128 || bytes > 64 * 1024 * 1024) store.delete(e.key);
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* Derived cache failures never affect the workspace. */
  }
}

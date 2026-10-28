type Cached<T> = { saved: number; data: T };
const memory = new Map<string, Cached<unknown>>();
export function readToolCache<T>(key: string): Cached<T> | undefined {
  try {
    const value =
      memory.get(key) ||
      JSON.parse(localStorage.getItem("yua-tool:" + key) || "null");
    if (value && Number.isFinite(value.saved) && value.data)
      return value as Cached<T>;
  } catch {
    /* Private storage can be disabled. */
  }
}
export function saveToolCache<T>(key: string, data: T) {
  const value = { saved: Date.now(), data };
  memory.set(key, value);
  if (memory.size > 40) memory.delete(memory.keys().next().value!);
  try {
    localStorage.setItem("yua-tool:" + key, JSON.stringify(value));
  } catch {
    /* Cache is optional. */
  }
  return value;
}
export async function toolJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw Error("暂时无法获取数据");
  return response.json();
}

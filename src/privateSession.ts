let active = false;
export const isPrivateSession = () => active;
export function enterPrivateSession() {
  active = true;
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("yua-tool:")) localStorage.removeItem(key);
  } catch {
    /* Storage can be unavailable; no new cache writes are allowed. */
  }
}

import { useSyncExternalStore } from "react";
import { english } from "./locales/en";
export type Language = "zh" | "en";
export type Theme = "light" | "dark" | "system";
type Preferences = { language: Language; theme: Theme };
const key = "yua-preferences";
function read(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return {
      language: value?.language === "en" ? "en" : "zh",
      theme: ["dark", "light", "system"].includes(value?.theme)
        ? value.theme
        : "system",
    };
  } catch {
    return { language: "zh", theme: "system" };
  }
}
let preferences = read();
const listeners = new Set<() => void>();
const media = matchMedia("(prefers-color-scheme: dark)");
function apply() {
  document.documentElement.lang =
    preferences.language === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.theme =
    preferences.theme === "system"
      ? media.matches
        ? "dark"
        : "light"
      : preferences.theme;
  document.documentElement.style.colorScheme =
    document.documentElement.dataset.theme!;
}
apply();
media.addEventListener("change", apply);
window.addEventListener("storage", (event) => {
  if (event.key === key) {
    preferences = read();
    apply();
    listeners.forEach((fn) => fn());
  }
});
export function setPreferences(next: Partial<Preferences>) {
  preferences = { ...preferences, ...next };
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    /* Editing remains available. */
  }
  apply();
  listeners.forEach((fn) => fn());
}
export function usePreferences() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => preferences,
  );
}
const patterns = Object.entries(english)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([key, value]) => {
    const slots: number[] = [];
    const source = key
      .split(/(\{\d+\})/g)
      .map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          slots.push(Number(part.slice(1, -1)));
          return "(.*?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    return { pattern: new RegExp("^" + source + "$"), value, slots };
  });
export function t(key: string, ...values: (string | number)[]) {
  let translated = preferences.language === "en" ? english[key] || key : key;
  if (
    preferences.language === "en" &&
    !english[key] &&
    /[\u3400-\u9fff]/.test(key)
  ) {
    for (const entry of patterns) {
      const match = key.match(entry.pattern);
      if (match) {
        translated = entry.value;
        values = [];
        entry.slots.forEach((slot, i) => {
          values[slot] = match[i + 1];
        });
        break;
      }
    }
  }
  return translated.replace(/\{(\d+)\}/g, (_, n) =>
    String(values[Number(n)] ?? `{${n}}`),
  );
}
export const locale = () => (preferences.language === "en" ? "en-US" : "zh-CN");

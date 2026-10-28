import { Languages, Sun, Moon, Monitor } from "lucide-react";
import {
  setPreferences,
  usePreferences,
  t as tr,
  type Language,
  type Theme,
} from "./i18n";
export function PreferencesControls() {
  const { language, theme } = usePreferences();
  const ThemeIcon =
    theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return (
    <div
      className="preferences-controls"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label title={tr("语言")}>
        <Languages size={16} />
        <select
          aria-label={tr("语言")}
          value={language}
          onChange={(e) =>
            setPreferences({ language: e.target.value as Language })
          }
        >
          <option value="zh">{tr("中文")}</option>
          <option value="en">English</option>
        </select>
      </label>
      <label title={tr("外观")}>
        <ThemeIcon size={16} />
        <select
          aria-label={tr("外观")}
          value={theme}
          onChange={(e) => setPreferences({ theme: e.target.value as Theme })}
        >
          <option value="system">{tr("跟随系统")}</option>
          <option value="light">{tr("浅色")}</option>
          <option value="dark">{tr("深色")}</option>
        </select>
      </label>
    </div>
  );
}

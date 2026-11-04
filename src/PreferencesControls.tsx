import { Sun, Moon, Monitor } from "./icons";
import type { CSSProperties, ReactNode } from "react";
import { setPreferences, usePreferences, t as tr } from "./i18n";
function PreferenceSlider<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; content: ReactNode }[];
  onChange: (value: T) => void;
}) {
  const index = options.findIndex((option) => option.value === value);
  return (
    <div
      className="preference-slider"
      style={
        { "--segments": options.length, "--position": index } as CSSProperties
      }
    >
      <span className="preference-slider-thumb" aria-hidden="true" />
      <span className="preference-slider-labels" aria-hidden="true">
        {options.map((option) => (
          <span
            key={option.value}
            className={option.value === value ? "active" : ""}
            title={option.label}
          >
            {option.content}
          </span>
        ))}
      </span>
      <input
        className="preference-range"
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={index}
        aria-label={label}
        aria-valuetext={options[index].label}
        title={`${label} · ${options[index].label}`}
        onChange={(event) =>
          onChange(options[Number(event.target.value)].value)
        }
        onKeyDown={(event) => event.stopPropagation()}
      />
    </div>
  );
}
export function PreferencesControls({
  showLabels = false,
}: {
  showLabels?: boolean;
}) {
  const { language, theme } = usePreferences();
  return (
    <div
      className={
        "preferences-controls" + (showLabels ? " labeled-preferences" : "")
      }
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="preference-row">
        {showLabels && <span>{tr("语言")}</span>}
        <PreferenceSlider
          label={tr("语言")}
          value={language}
          onChange={(language) => setPreferences({ language })}
          options={[
            { value: "zh", label: tr("中文"), content: "中" },
            { value: "en", label: "English", content: "EN" },
          ]}
        />
      </div>
      <div className="preference-row">
        {showLabels && <span>{tr("外观")}</span>}
        <PreferenceSlider
          label={tr("外观")}
          value={theme}
          onChange={(theme) => setPreferences({ theme })}
          options={[
            {
              value: "light",
              label: tr("浅色"),
              content: <Sun size={16} motionState={theme === "light"} />,
            },
            {
              value: "dark",
              label: tr("深色"),
              content: <Moon size={16} motionState={theme === "dark"} />,
            },
            {
              value: "system",
              label: tr("跟随系统"),
              content: <Monitor size={16} motionState={theme === "system"} />,
            },
          ]}
        />
      </div>
    </div>
  );
}

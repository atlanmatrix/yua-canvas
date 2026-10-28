import { useRef, useState } from "react";
export function GroupNameEditor({
  name,
  onSave,
  onCancel,
  label = "分组名称",
}: {
  name: string;
  label?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name),
    finished = useRef(false);
  const save = () => {
    if (finished.current) return;
    finished.current = true;
    if (value.trim()) onSave(value.trim());
    else onCancel();
  };
  return (
    <input
      className="group-name-editor"
      aria-label={label}
      autoFocus
      maxLength={200}
      value={value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={save}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          finished.current = true;
          onCancel();
        }
      }}
    />
  );
}

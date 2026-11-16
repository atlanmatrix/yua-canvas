import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "./icons";

/** App-rendered select: the same choices and keyboard behavior on desktop and touch. */
export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  useEffect(() => {
    if (open)
      root.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  function choose(index: number) {
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      ref={root}
      className="app-select"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <span id={id + "-label"} className="app-select-label">
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-labelledby={id + "-label"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={open ? id + "-" + active : undefined}
        onClick={() => {
          search.current.text = "";
          setActive(selected);
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
            setActive(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? options.length - 1
                  : !open
                    ? selected
                    : (active +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        options.length) %
                      options.length,
            );
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (open) choose(active);
            else {
              setActive(selected);
              setOpen(true);
            }
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === "Tab") setOpen(false);
          else if (
            e.key.length === 1 &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault();
            const now = Date.now();
            const previous =
              now - search.current.time < 700 ? search.current.text : "";
            const query = previous + e.key.toLowerCase();
            search.current = { text: query, time: now };
            // Repeating a character cycles through matches, as in a native select.
            const repeated = [...query].every(
              (character) => character === query[0],
            );
            const prefix = repeated ? query[0] : query;
            const start = repeated ? (open ? active : selected) + 1 : 0;
            const index = Array.from(
              { length: options.length },
              (_, i) => (start + i) % options.length,
            ).find(
              (i) =>
                options[i].label.toLowerCase().startsWith(prefix) ||
                options[i].value.toLowerCase().startsWith(prefix),
            );
            setOpen(true);
            if (index !== undefined) setActive(index);
          }
        }}
      >
        <span>{options[selected].label}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div
          id={id}
          role="listbox"
          aria-labelledby={id + "-label"}
          className="app-select-options"
        >
          {options.map((o, i) => (
            <button
              id={id + "-" + i}
              type="button"
              role="option"
              key={o.value}
              tabIndex={-1}
              aria-selected={value === o.value}
              data-active={i === active}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

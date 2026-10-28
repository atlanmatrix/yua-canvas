import { textCss, type TextStyle } from "./presentation";
export function linkTarget(text: string): string | undefined {
  const value = text.trim();
  if (!value || /[\s<>]/u.test(value)) return;
  try {
    const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
    if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname)
      return url.href;
  } catch {
    /* Non-URL notes retain their ordinary text presentation. */
  }
}

export function NoteText({
  text,
  mode = "wrap",
  textStyle,
}: {
  text: string;
  mode?: "wrap" | "scroll";
  textStyle?: TextStyle;
}) {
  const href = linkTarget(text);
  return (
    <div
      className={`note-body text-${mode}`}
      onWheel={(e) => {
        const element = e.currentTarget;
        if (
          !e.ctrlKey &&
          !e.metaKey &&
          (element.scrollHeight > element.clientHeight ||
            element.scrollWidth > element.clientWidth)
        )
          e.stopPropagation();
      }}
      onPointerDown={(e) => {
        const element = e.currentTarget,
          bounds = element.getBoundingClientRect(),
          scale = bounds.width / element.offsetWidth;
        if (
          (e.clientX - bounds.left) / scale >= element.clientWidth ||
          (e.clientY - bounds.top) / scale >= element.clientHeight
        )
          e.stopPropagation();
      }}
    >
      <p style={textCss(textStyle)}>
        {href ? (
          <a
            className="note-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={(e) => {
              // Canvas gestures handle pointer activation. Keep Enter available to
              // keyboard users through the anchor's native navigation behavior.
              if (e.detail) e.preventDefault();
            }}
            onAuxClick={(e) => e.preventDefault()}
          >
            {text}
          </a>
        ) : (
          text
        )}
      </p>
    </div>
  );
}

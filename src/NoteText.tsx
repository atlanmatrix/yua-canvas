import {
  textCss,
  textSegments,
  type TextRun,
  type TextStyle,
} from "./presentation";
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

export function StyledNoteText({
  text,
  textStyle,
  textRuns,
}: {
  text: string;
  textStyle?: TextStyle;
  textRuns?: TextRun[];
}) {
  return textRuns?.length
    ? textSegments(text, textRuns, textStyle).map((s, i) => (
        <span key={i} style={textCss(s.style)}>
          {s.text}
        </span>
      ))
    : text;
}
export function NoteText({
  text,
  mode = "wrap",
  textStyle,
  textRuns,
}: {
  text: string;
  mode?: "wrap" | "scroll";
  textStyle?: TextStyle;
  textRuns?: TextRun[];
}) {
  const content = (
    <StyledNoteText text={text} textRuns={textRuns} textStyle={textStyle} />
  );
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
      <p style={textCss(textRuns?.length ? undefined : textStyle)}>
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
            {content}
          </a>
        ) : (
          content
        )}
      </p>
    </div>
  );
}

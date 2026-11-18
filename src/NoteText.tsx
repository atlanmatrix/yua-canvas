import {
  textCss,
  textSegments,
  type TextRun,
  type TextStyle,
} from "./presentation";
import { linkTarget } from "./noteLinks";
import { Link2 } from "./icons";
import { t as tr } from "./i18n";

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
  linkDisabled,
  showLinkIcon,
}: {
  text: string;
  mode?: "wrap" | "scroll";
  textStyle?: TextStyle;
  textRuns?: TextRun[];
  linkDisabled?: boolean;
  showLinkIcon?: boolean;
}) {
  const content = (
    <StyledNoteText text={text} textRuns={textRuns} textStyle={textStyle} />
  );
  const href = linkTarget(text, linkDisabled);
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
        {href && showLinkIcon && (
          <button
            type="button"
            className="note-link-icon"
            aria-label={tr("链接选项")}
            aria-haspopup="menu"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Link2 size={13} />
          </button>
        )}
        {href ? (
          <a
            className="note-link"
            href={href}
            target={href.startsWith("mailto:") ? undefined : "_blank"}
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

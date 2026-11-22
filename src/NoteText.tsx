import {
  textCss,
  textSegments,
  type TextRun,
  type TextStyle,
} from "./presentation";
import { addressStyle, linkTarget, NOTE_LINK_TEXT_STYLE } from "./noteLinks";
import { Link2, Mail } from "./icons";
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
  onLinkMenu,
}: {
  text: string;
  mode?: "wrap" | "scroll";
  textStyle?: TextStyle;
  textRuns?: TextRun[];
  linkDisabled?: boolean;
  onLinkMenu?: (button: HTMLButtonElement) => void;
}) {
  const href = linkTarget(text, linkDisabled);
  const email = href?.startsWith("mailto:");
  const Icon = email ? Mail : Link2;
  const style = href ? { ...NOTE_LINK_TEXT_STYLE, ...textStyle } : textStyle;
  const content = (
    <StyledNoteText text={text} textRuns={textRuns} textStyle={style} />
  );
  return (
    <div
      style={href ? addressStyle : undefined}
      className={`note-body text-${mode}${href ? " note-address" : ""}`}
      onWheel={(e) => {
        const element =
          href && mode === "scroll"
            ? e.currentTarget.querySelector(".note-link") || e.currentTarget
            : e.currentTarget;
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
      {href &&
        (onLinkMenu ? (
          <button
            type="button"
            className="note-link-icon"
            aria-label={tr("链接选项")}
            aria-haspopup="menu"
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey)
                onLinkMenu(e.currentTarget);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Icon size={16} />
          </button>
        ) : (
          <span className="note-link-icon" aria-hidden="true">
            <Icon size={16} />
          </span>
        ))}
      <p
        style={textCss(
          textRuns?.length ? (href ? NOTE_LINK_TEXT_STYLE : undefined) : style,
        )}
      >
        {href ? (
          <a
            className="note-link"
            href={href}
            title={text.trim()}
            target={email ? undefined : "_blank"}
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

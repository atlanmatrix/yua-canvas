function linkTarget(text: string): string | undefined {
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

export function NoteText({ text }: { text: string }) {
  const href = linkTarget(text);
  return (
    <div className="note-body">
      <p>
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

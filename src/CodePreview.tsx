import { memo, useEffect, useState } from "react";
import { CODE_PREVIEW_LIMIT, highlightCode } from "./syntaxHighlight";
import { normalizeLanguage } from "./textFormats";
import { PreviewBoundary } from "./PreviewBoundary";
import { t as tr, usePreferences } from "./i18n";
const Content = memo(function CodeContent({
  source,
  language = "plaintext",
  className = "file-text",
  label,
}: {
  source: string;
  language?: string;
  className?: string;
  label?: string;
}) {
  usePreferences();
  const [result, setResult] = useState<{
    source: string;
    language: string;
    html: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    if (language === "plaintext" || !source) return;
    void highlightCode(source, language, controller.signal)
      .then((html) => {
        if (!controller.signal.aborted) setResult({ source, language, html });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [source, language]);
  const html =
    result?.source === source && result.language === language
      ? result.html
      : undefined;
  return (
    <>
      <pre
        className={className}
        aria-label={label}
        data-code-language={normalizeLanguage(language)}
        data-code-state={html !== undefined ? "ready" : "plain"}
      >
        <code
          className={`hljs language-${language}`}
          {...(html !== undefined
            ? { dangerouslySetInnerHTML: { __html: html } }
            : { children: source.slice(0, CODE_PREVIEW_LIMIT) })}
        />
      </pre>
      {source.length > CODE_PREVIEW_LIMIT && (
        <small className="code-truncated">
          {tr("仅预览前 64 KB，完整内容可编辑或下载")}
        </small>
      )}
    </>
  );
});
export function CodePreview({
  lazy = true,
  ...props
}: {
  source: string;
  language?: string;
  className?: string;
  label?: string;
  lazy?: boolean;
}) {
  return lazy ? (
    <PreviewBoundary allowTiny>
      <Content {...props} />
    </PreviewBoundary>
  ) : (
    <Content {...props} />
  );
}

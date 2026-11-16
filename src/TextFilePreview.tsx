import { Markdown, Diagram } from "./Markdown";
import { CodePreview } from "./CodePreview";
import { languageForFile } from "./textFormats";
import { t as tr } from "./i18n";

// Saved attachments and unsaved file drafts use the same format renderer.
export function TextFilePreview({
  source,
  name,
  mime,
  thumbnail = false,
  loading = false,
}: {
  source: string;
  name: string;
  mime?: string;
  thumbnail?: boolean;
  loading?: boolean;
}) {
  const language = languageForFile(name);
  if (language === "markdown" || (!language && mime === "text/markdown"))
    return (
      <div
        className={thumbnail ? "markdown-file-preview" : undefined}
        data-file-preview-state={loading ? "loading" : "ready"}
        onWheel={(e) => {
          if (e.currentTarget.scrollHeight > e.currentTarget.clientHeight)
            e.stopPropagation();
        }}
      >
        <Markdown>{source}</Markdown>
      </div>
    );
  if (language === "mermaid")
    return (
      <div
        className="mermaid-preview"
        data-file-preview-state={loading ? "loading" : "ready"}
      >
        <Diagram source={source} language="mermaid" standalone />
      </div>
    );
  return (
    <CodePreview
      source={source}
      language={language}
      className={thumbnail ? "file-content-thumbnail" : "file-text"}
      label={thumbnail ? tr("{0} 内容预览", name) : undefined}
      loading={loading}
    />
  );
}

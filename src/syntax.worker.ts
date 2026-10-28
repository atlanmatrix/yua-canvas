import hljs from "highlight.js";
hljs.registerLanguage("csv", () => ({
  name: "CSV",
  contains: [
    { scope: "string", begin: /"/, end: /"/, contains: [{ begin: /""/ }] },
    { scope: "number", match: /\b-?\d+(?:\.\d+)?\b/ },
    { scope: "meta", match: /[,\t]/ },
  ],
}));
const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (value: unknown) => void;
};
scope.onmessage = ({
  data,
}: MessageEvent<{ id: number; source: string; language: string }>) => {
  try {
    const language = hljs.getLanguage(data.language)
      ? data.language
      : "plaintext";
    const result = hljs.highlight(data.source, {
      language,
      ignoreIllegals: true,
    });
    scope.postMessage({ id: data.id, html: result.value, language });
  } catch {
    scope.postMessage({ id: data.id, error: true });
  }
};

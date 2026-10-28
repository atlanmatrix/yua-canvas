import { Children, isValidElement, useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import DOMPurify from "dompurify";
import { CircleAlert } from "lucide-react";

let mermaidModule: Promise<typeof import("mermaid")> | undefined;
function loadMermaid() {
  return (mermaidModule ||= import("mermaid").then((module) => {
    module.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "neutral",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      fontFamily: "sans-serif",
    });
    return module;
  }));
}
export function Diagram({
  source,
  language,
  standalone = false,
  onSize,
}: {
  source: string;
  language: string;
  standalone?: boolean;
  onSize?: (width: number, height: number) => void;
}) {
  const [result, setResult] = useState({ svg: "", state: "loading" });
  useEffect(() => {
    if (!result.svg || !onSize) return;
    const svg = new DOMParser().parseFromString(
      result.svg,
      "image/svg+xml",
    ).documentElement;
    const box = svg
      .getAttribute("viewBox")
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    if (box && box[2] > 0 && box[3] > 0) onSize(box[2], box[3]);
  }, [result.svg, onSize]);
  useEffect(() => {
    let active = true;
    const staging = document.createElement("div");
    staging.className = "diagram-staging";
    staging.setAttribute("aria-hidden", "true");
    document.body.append(staging);
    setResult({ svg: "", state: "loading" });
    (async () => {
      let svg: string;
      if (
        language !== "mermaid" &&
        /\w+\s*=>\s*(start|end|operation|condition|inputoutput|subroutine|parallel)/.test(
          source,
        )
      ) {
        const flowchart = (await import("flowchart.js")).default;
        const diagram = flowchart.parse(source);
        try {
          diagram.drawSVG(staging, {
            "line-color": "#64748b",
            "element-color": "#64748b",
            "font-color": "#334155",
            fill: "#ffffff",
            "font-size": 14,
            "line-width": 2,
          });
          const element = staging.querySelector("svg");
          if (!element) throw Error("Invalid diagram");
          element.setAttribute(
            "viewBox",
            `0 0 ${element.getAttribute("width")} ${element.getAttribute("height")}`,
          );
          svg = element.outerHTML;
        } finally {
          diagram.clean();
        }
      } else {
        const mermaid = (await loadMermaid()).default;
        const code =
          language !== "mermaid" && !/^\s*(?:flowchart|graph)\s/m.test(source)
            ? `flowchart TD\n${source}`
            : source;
        svg = (
          await mermaid.render(`diagram-${crypto.randomUUID()}`, code, staging)
        ).svg;
      }
      if (active)
        setResult({
          svg: DOMPurify.sanitize(svg, {
            USE_PROFILES: { html: true, svg: true, svgFilters: true },
            ADD_TAGS: ["foreignObject"],
          }),
          state: "ready",
        });
    })()
      .catch(() => {
        if (active) setResult({ svg: "", state: "error" });
      })
      .finally(() => staging.remove());
    return () => {
      active = false;
      staging.remove();
    };
  }, [source, language]);
  return (
    <div
      className="markdown-diagram"
      data-diagram-state={result.state}
      aria-label={`${language} 图表`}
    >
      {result.svg ? (
        <div dangerouslySetInnerHTML={{ __html: result.svg }} />
      ) : standalone ? (
        result.state === "error" ? (
          <CircleAlert
            className="diagram-error"
            aria-label="Mermaid 语法有误，双击编辑"
          />
        ) : null
      ) : (
        <pre>
          <code>{source}</code>
        </pre>
      )}
    </div>
  );
}
// Stable component identities keep diagrams mounted during canvas selection,
// dragging and autosave renders, so they do not replace a double-click target.
const markdownComponents: Components = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  pre: ({ children }) => {
    const code = Children.toArray(children)[0];
    if (isValidElement<{ className?: string; children?: string }>(code)) {
      const language = code.props.className
        ?.replace(/^language-/, "")
        .toLowerCase();
      if (
        language &&
        ["mermaid", "flowchart", "flowchart.js", "flow"].includes(language)
      )
        return (
          <Diagram
            source={String(code.props.children || "").trimEnd()}
            language={language}
          />
        );
    }
    return <pre>{children}</pre>;
  },
};
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={markdownComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

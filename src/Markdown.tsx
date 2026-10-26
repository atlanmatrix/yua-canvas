import { Children, isValidElement, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DOMPurify from "dompurify";

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
function Diagram({ source, language }: { source: string; language: string }) {
  const [result, setResult] = useState({ svg: "", state: "loading" });
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
      ) : (
        <pre>
          <code>{source}</code>
        </pre>
      )}
    </div>
  );
}
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => {
            const code = Children.toArray(children)[0];
            if (
              isValidElement<{ className?: string; children?: string }>(code)
            ) {
              const language = code.props.className
                ?.replace(/^language-/, "")
                .toLowerCase();
              if (
                language &&
                ["mermaid", "flowchart", "flowchart.js", "flow"].includes(
                  language,
                )
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

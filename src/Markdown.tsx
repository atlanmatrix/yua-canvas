import { t as tr } from "./i18n";
import { instantiateSvg } from "./svgPreview";
import { usePreferences } from "./i18n";
import { CodePreview } from "./CodePreview";
import {
  Children,
  isValidElement,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import DOMPurify from "dompurify";
import { CircleAlert } from "lucide-react";
import { PreviewBoundary } from "./PreviewBoundary";
import {
  PreviewCache,
  diagramQueue,
  previewMetrics,
  checkAbort,
} from "./previewCache";
import { cachedMarkdownParser, virtualMarkdownChunks } from "./markdownPreview";
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
type DiagramResult = { svg: string; width?: number; height?: number };
const diagrams = new PreviewCache<string, DiagramResult>(16 * 1024 * 1024, 128);
function renderDiagram(source: string, language: string, signal: AbortSignal) {
  const key = JSON.stringify([language, source]);
  const cached = diagrams.get(key);
  if (cached) return Promise.resolve(cached);
  return diagramQueue.run(async () => {
    const cached = diagrams.get(key);
    if (cached) return cached;
    checkAbort(signal);
    const staging = document.createElement("div");
    staging.className = "diagram-staging";
    staging.setAttribute("aria-hidden", "true");
    document.body.append(staging);
    try {
      let svg: string;
      previewMetrics.diagramRenders++;
      if (
        language !== "mermaid" &&
        /\w+\s*=>\s*(start|end|operation|condition|inputoutput|subroutine|parallel)/.test(
          source,
        )
      ) {
        const flowchart = (await import("flowchart.js")).default;
        checkAbort(signal);
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
        checkAbort(signal);
        const code =
          language !== "mermaid" && !/^\s*(?:flowchart|graph)\s/m.test(source)
            ? `flowchart TD\n${source}`
            : source;
        svg = (
          await mermaid.render(`diagram-${crypto.randomUUID()}`, code, staging)
        ).svg;
      }
      checkAbort(signal);
      const clean = DOMPurify.sanitize(svg, {
        USE_PROFILES: { html: true, svg: true, svgFilters: true },
        ADD_TAGS: ["foreignObject"],
      });
      const viewBox = new DOMParser()
        .parseFromString(clean, "image/svg+xml")
        .documentElement.getAttribute("viewBox")
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
      const result = { svg: clean, width: viewBox?.[2], height: viewBox?.[3] };
      diagrams.set(key, result, (source.length + clean.length) * 2);
      return result;
    } finally {
      staging.remove();
    }
  }, signal);
}
const DiagramContent = memo(function DiagramContent({
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
  usePreferences();
  const instance = useRef(`preview-${crypto.randomUUID()}`);
  const [result, setResult] = useState<DiagramResult & { state: string }>({
    svg: "",
    state: "loading",
  });
  const svg = useMemo(
    () => instantiateSvg(result.svg, instance.current),
    [result.svg],
  );
  useEffect(() => {
    if (result.width && result.height) onSize?.(result.width, result.height);
  }, [result, onSize]);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ svg: "", state: "loading" });
    void renderDiagram(source, language, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult({ ...value, state: "ready" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ svg: "", state: "error" });
      });
    return () => controller.abort();
  }, [source, language]);
  return (
    <div
      className="markdown-diagram"
      data-diagram-state={result.state}
      aria-label={tr("{0} 图表", language)}
    >
      {result.svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : standalone ? (
        result.state === "error" ? (
          <CircleAlert
            className="diagram-error"
            aria-label={tr("Mermaid 语法有误，双击编辑")}
          />
        ) : null
      ) : (
        <pre>
          <code>{source}</code>
        </pre>
      )}
    </div>
  );
});
export function Diagram(props: {
  source: string;
  language: string;
  standalone?: boolean;
  onSize?: (width: number, height: number) => void;
}) {
  const size = useRef(props.onSize);
  size.current = props.onSize;
  const handler = useRef((w: number, h: number) =>
    size.current?.(w, h),
  ).current;
  return (
    <PreviewBoundary>
      <DiagramContent
        source={props.source}
        language={props.language}
        standalone={props.standalone}
        onSize={props.onSize ? handler : undefined}
      />
    </PreviewBoundary>
  );
}
function MarkdownChunk(props: {
  children?: ReactNode;
  "data-preview-id"?: string;
  "data-preview-height"?: number;
  "data-preview-anchors"?: string;
}) {
  const id = props["data-preview-id"] || "";
  return (
    <PreviewBoundary
      key={id}
      chunk
      force={id.endsWith(":0")}
      estimate={Number(props["data-preview-height"]) || 240}
      cacheKey={id}
      anchors={props["data-preview-anchors"]}
    >
      {props.children}
    </PreviewBoundary>
  );
}
const markdownComponents: Components = {
  a: ({ children, ...props }) => (
    <a
      {...props}
      target={props.href?.startsWith("#") ? undefined : "_blank"}
      rel="noopener noreferrer"
      onClick={(event) => {
        if (!props.href?.startsWith("#")) return;
        let id: string;
        try {
          id = decodeURIComponent(props.href.slice(1));
        } catch {
          return;
        }
        if (!id) return;
        const markdown = event.currentTarget.closest(".markdown");
        const target = markdown?.querySelector<HTMLElement>(
          `#${CSS.escape(id)}`,
        );
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ block: "nearest" });
          return;
        }
        const chunk = [
          ...(markdown?.querySelectorAll<HTMLElement>(
            "[data-preview-anchors]",
          ) || []),
        ].find((el) => {
          try {
            return JSON.parse(el.dataset.previewAnchors || "[]").includes(id);
          } catch {
            return false;
          }
        });
        if (chunk) {
          event.preventDefault();
          chunk.dispatchEvent(new Event("preview-reveal"));
          requestAnimationFrame(() =>
            markdown
              ?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
              ?.scrollIntoView({ block: "nearest" }),
          );
        }
      }}
    >
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
      if (language)
        return (
          <CodePreview
            source={String(code.props.children || "")}
            language={language}
            className="markdown-code"
            lazy={false}
          />
        );
    }
    return <pre>{children}</pre>;
  },
  ...({ "markdown-chunk": MarkdownChunk } as Components),
};
const remarkPlugins = [remarkGfm, cachedMarkdownParser],
  rehypePlugins = [virtualMarkdownChunks];
export const Markdown = memo(function Markdown({
  children,
}: {
  children: string;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        skipHtml
        components={markdownComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

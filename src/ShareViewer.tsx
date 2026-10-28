import { useEffect, useRef, useState } from "react";
import { api, unpackCloud } from "./cloud";
import {
  type Board,
  type Card,
  exportBoard,
  saveRecovery,
  saveBoard,
  readBoard,
} from "./storage";
import { cardRect } from "./geometry";
import { curve, endpointPoint, curveMidpoint } from "./connections";
import { ConnectionArrow } from "./ConnectionArrow";
import { Markdown, Diagram } from "./Markdown";
import { PdfPreview } from "./PdfPreview";
import { isPdfFile, isMarkdownFile, fileText } from "./clipboard";
import { Miniature } from "./Miniature";
function Asset({ card }: { card: Card }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!card.blob) return;
    const u = URL.createObjectURL(card.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [card.blob]);
  return card.kind === "image" ? (
    <a href={url} download={card.title}>
      <img src={url} alt={card.title} />
    </a>
  ) : (
    <a href={url} download={card.title}>
      下载 {card.title}
    </a>
  );
}
export function ShareViewer({ token }: { token: string }) {
  const [root, setRoot] = useState<Board>(),
    [stack, setStack] = useState<Board[]>([]),
    [error, setError] = useState(""),
    [view, setView] = useState({ x: 60, y: 90, z: 1 });
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  const board = stack.at(-1) || root;
  useEffect(() => {
    let active = true;
    api("/shares/resolve", { method: "POST", body: JSON.stringify({ token }) })
      .then((d) => unpackCloud(d.snapshot, token))
      .then((b) => {
        if (active) setRoot(b);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (!board) return;
    const rects = board.cards.map(cardRect);
    if (!rects.length) return;
    const x = Math.min(...rects.map((r) => r.x)),
      y = Math.min(...rects.map((r) => r.y)),
      w = Math.max(...rects.map((r) => r.x + r.width)) - x,
      h = Math.max(...rects.map((r) => r.y + r.height)) - y;
    const z = Math.min(
      1,
      (innerWidth - 120) / Math.max(w, 1),
      (innerHeight - 160) / Math.max(h, 1),
    );
    setView({ x: 60 - x * z, y: 100 - y * z, z: Math.max(0.05, z) });
  }, [board]);
  return (
    <main className="share-viewer">
      <header>
        <strong>画布分享 · 只读</strong>
        <a href={location.pathname}>返回我的画布</a>
        {stack.length > 0 && (
          <button onClick={() => setStack((s) => s.slice(0, -1))}>
            返回父画布
          </button>
        )}
        {root && (
          <>
            <button
              onClick={() =>
                void exportBoard(root).then((raw) => {
                  const u = URL.createObjectURL(
                    new Blob([raw], { type: "application/json" }),
                  );
                  const a = document.createElement("a");
                  a.href = u;
                  a.download = "分享画布.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(u), 1000);
                })
              }
            >
              下载快照
            </button>
            <button
              onClick={() => {
                if (
                  !confirm(
                    "将备份当前本地工作区，并用此分享创建本地副本。继续？",
                  )
                )
                  return;
                void (async () => {
                  const old = await readBoard();
                  if (old) await saveRecovery(old);
                  await saveBoard(root);
                  localStorage.removeItem("yua-cloud-baseline");
                  location.href = location.pathname;
                })().catch((e) => setError(e.message));
              }}
            >
              复制到我的画布
            </button>
          </>
        )}
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : !board ? (
        <p role="status">正在加载分享画布…</p>
      ) : (
        <div
          className="share-surface"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button,a")) return;
            drag.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x,
              dy = e.clientY - drag.current.y;
            drag.current = { x: e.clientX, y: e.clientY };
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
          }}
          onPointerUp={() => {
            drag.current = undefined;
          }}
          onPointerCancel={() => {
            drag.current = undefined;
          }}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey)
              setView((v) => ({
                ...v,
                z: Math.min(
                  3,
                  Math.max(0.05, v.z * Math.exp(-e.deltaY * 0.002)),
                ),
              }));
            else
              setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
          }}
        >
          <div
            className="share-world"
            style={{
              transform: `translate(${view.x}px,${view.y}px) scale(${view.z})`,
            }}
          >
            {board.groups.map(
              (g) =>
                g.bounds && (
                  <div
                    key={g.id}
                    className="share-group"
                    style={{
                      left: g.bounds.x,
                      top: g.bounds.y,
                      width: g.bounds.width,
                      height: g.bounds.height,
                      background: g.color,
                    }}
                  >
                    <span>{g.name}</span>
                  </div>
                ),
            )}
            <svg className="share-connections">
              <ConnectionArrow
                id="canvas-connection-arrow"
                size={8}
                color="#d1d5db"
              />
              {board.connections?.map((c) => {
                const from = endpointPoint(c.from, board.cards, {}),
                  to = endpointPoint(c.to, board.cards, {}),
                  mid = curveMidpoint(from, to, c.from.side, c.to.side);
                return (
                  <g key={c.id}>
                    <path
                      d={curve(from, to, c.from.side, c.to.side)}
                      stroke="#d1d5db"
                      strokeWidth="2"
                      fill="none"
                      markerEnd="url(#canvas-connection-arrow)"
                    />
                    {c.label && (
                      <text x={mid.x} y={mid.y} textAnchor="middle">
                        {c.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {board.cards.map((c) => {
              const r = cardRect(c);
              return (
                <article
                  className={
                    "share-card" +
                    (c.kind === "miniature" ? " share-miniature" : "")
                  }
                  key={c.id}
                  style={{
                    left: r.x,
                    top: r.y,
                    width: r.width,
                    minHeight: r.height,
                    height:
                      isPdfFile(c) || c.kind === "mermaid"
                        ? r.height
                        : undefined,
                    background:
                      c.kind === "miniature" ? "transparent" : c.color,
                  }}
                >
                  {c.kind === "miniature" ? (
                    <Miniature card={c} />
                  ) : c.kind === "canvas" ? (
                    <button onClick={() => setStack((s) => [...s, c.canvas!])}>
                      进入 {c.title}
                    </button>
                  ) : c.kind === "text" ? (
                    <div style={{ whiteSpace: "pre-wrap" }}>{c.text}</div>
                  ) : c.kind === "mermaid" ? (
                    <div className="mermaid-preview">
                      <Diagram source={c.text} language="mermaid" standalone />
                    </div>
                  ) : isPdfFile(c) ? (
                    <PdfPreview card={c} />
                  ) : isMarkdownFile(c) ? (
                    <FilePreview card={c} />
                  ) : c.kind === "todo" ? (
                    <ul>
                      {c.tasks?.map((t) => (
                        <li key={t.id}>
                          {t.done ? "☑" : "☐"} {t.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      <Asset card={c} />
                      {c.kind === "file" && /markdown/.test(c.mime || "") && (
                        <FilePreview card={c} />
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
          <div className="share-zoom">
            <button
              aria-label="缩小"
              onClick={() =>
                setView((v) => ({ ...v, z: Math.max(0.05, v.z / 1.2) }))
              }
            >
              −
            </button>
            <span>{Math.round(view.z * 100)}%</span>
            <button
              aria-label="放大"
              onClick={() =>
                setView((v) => ({ ...v, z: Math.min(3, v.z * 1.2) }))
              }
            >
              ＋
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
function FilePreview({ card }: { card: Card }) {
  const [text, setText] = useState("");
  useEffect(() => {
    let active = true;
    void (card.blob ? fileText(card.blob) : Promise.resolve(""))
      .then((t) => {
        if (active) setText(t);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [card.blob]);
  return <Markdown>{text}</Markdown>;
}

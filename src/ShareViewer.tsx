import { FlowchartPreview } from "./Flowchart";
import { MindMap } from "./MindMap";
import { noteCardHref } from "./noteLinks";
import { useCanvasTouch } from "./useCanvasTouch";
import { ComponentLockDialog, LockedContent } from "./ComponentLock";
import { unlockIsolated } from "./encryption";
import { useCanvasWheelGuard } from "./useCanvasWheelGuard";
import { AgentCard } from "./AgentCard";
import { Attachment } from "./Attachment";
import { ToolCard } from "./ToolCard";
import { isToolKind } from "./tools";
import { PreferencesControls } from "./PreferencesControls";
import { t as tr, usePreferences } from "./i18n";
import { surfaceColor, customColor } from "./presentation";
import {
  diagramFrameStyle,
  PreviewFrame,
  TodoHeading,
  TypeIcon,
  Mask,
  Remark,
  GroupList,
  presentationHidden,
  groupFrame,
  groupCards,
} from "./CardPresentation";
import { StrokeView } from "./PaintLayer";
import { NoteText } from "./NoteText";
import { strokeBounds } from "./presentation";
import { useEffect, useRef, useState } from "react";
import { cloudClient, serverOrigin } from "./cloud";
import {
  type Board,
  type Card,
  MIN_CANVAS_ZOOM,
  MAX_CANVAS_ZOOM,
  exportBoard,
  saveRecovery,
  saveBoard,
  readBoard,
} from "./storage";
import { cardRect } from "./geometry";
import { curve, endpointPoint, curveMidpoint } from "./connections";
import { ConnectionArrow } from "./ConnectionArrow";
import { Diagram } from "./Markdown";
import { isXlsxFile, officeKind } from "./files";
import { PdfPreview } from "./PdfPreview";
import { isPdfFile, isTextFile } from "./clipboard";
import { Miniature } from "./Miniature";
import { ApplicationCard } from "./ApplicationCard";
import { isApplicationKind } from "./appAssociations";
function Asset({ card }: { card: Card }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!card.blob) return;
    const u = URL.createObjectURL(card.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [card.blob]);
  const encryptedDownload =
    card.lock || card.inheritedLock
      ? (e: React.MouseEvent) => {
          e.preventDefault();
          void exportBoard({ version: 1, cards: [card], groups: [] })
            .then((raw) => {
              const u = URL.createObjectURL(
                new Blob([raw], { type: "application/json" }),
              );
              const a = document.createElement("a");
              a.href = u;
              a.download = "encrypted-component.canvas.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(u), 1000);
            })
            .catch(() => {});
        }
      : undefined;
  return card.kind === "image" ? (
    <a href={url} download={card.title} onClick={encryptedDownload}>
      <img src={url} alt={card.title} />
    </a>
  ) : (
    <a href={url} download={card.title} onClick={encryptedDownload}>
      {tr("下载 ")}
      {card.title}
    </a>
  );
}
export function ShareViewer({ token }: { token: string }) {
  usePreferences();
  const [root, setRoot] = useState<Board>(),
    [stack, setStack] = useState<Board[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState({ x: 60, y: 90, z: 1 });
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<
    { id: number; x: number; y: number } | undefined
  >(undefined);
  const board = stack.at(-1) || root;
  const [unlocking, setUnlocking] = useState<Card>();
  const unlockingRef = useRef(unlocking);
  unlockingRef.current = unlocking;
  useCanvasWheelGuard(surface, { enabled: !!board });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let origin = "";
    try {
      const value = new URLSearchParams(location.hash.split("?")[1]).get(
        "server",
      );
      if (value) origin = serverOrigin(value);
    } catch {
      setError("服务器地址无效");
      return;
    }
    const { api, unpackCloud } = cloudClient(origin, () => controller.signal);
    api("/shares/resolve", {
      method: "POST",
      body: JSON.stringify({ token: token.split("?")[0] }),
    })
      .then((d) => unpackCloud(d.snapshot, token.split("?")[0]))
      .then((b) => {
        if (active) setRoot(b);
      })
      .catch((e) => {
        if (
          active &&
          !(e instanceof DOMException && e.name === "AbortError")
        )
          setError(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [token]);
  const fitBoard = () => {
    if (!board || !surface.current) return;
    const rects = [
      ...board.cards.map(cardRect),
      ...strokeBounds(board.strokes),
    ];
    if (!rects.length) return;
    const x = Math.min(...rects.map((r) => r.x)),
      y = Math.min(...rects.map((r) => r.y)),
      w = Math.max(...rects.map((r) => r.x + r.width)) - x,
      h = Math.max(...rects.map((r) => r.y + r.height)) - y;
    const { clientWidth, clientHeight } = surface.current;
    const inset = Math.min(32, clientWidth / 10, clientHeight / 10);
    const z = Math.max(
      MIN_CANVAS_ZOOM,
      Math.min(
        1,
        (clientWidth - 2 * inset) / Math.max(w, 1),
        (clientHeight - 2 * inset) / Math.max(h, 1),
      ),
    );
    setView({ x: inset - x * z, y: inset - y * z, z });
  };
  useEffect(fitBoard, [board]);
  const zoomAt = (nextZ: number, clientX?: number, clientY?: number) => {
    const clamped = Math.max(
      MIN_CANVAS_ZOOM,
      Math.min(MAX_CANVAS_ZOOM, nextZ),
    );
    setView((v) => {
      const box = surface.current?.getBoundingClientRect();
      const px =
        clientX !== undefined && box
          ? clientX - box.left
          : (box?.width || 0) / 2;
      const py =
        clientY !== undefined && box
          ? clientY - box.top
          : (box?.height || 0) / 2;
      const ratio = clamped / v.z;
      return {
        x: px - (px - v.x) * ratio,
        y: py - (py - v.y) * ratio,
        z: clamped,
      };
    });
  };
  const stepZoom = (delta: number) =>
    zoomAt(Math.round((view.z + delta) * 10) / 10);
  useEffect(() => {
    const clearDrag = () => {
      drag.current = undefined;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.keyCode === 229 ||
        e.altKey ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.isContentEditable || target?.closest("input,textarea,select"))
        return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        stepZoom(0.2);
      } else if (e.key === "-") {
        e.preventDefault();
        stepZoom(-0.2);
      } else if (e.key === "0") {
        e.preventDefault();
        fitBoard();
      } else if (e.key === "1") {
        e.preventDefault();
        zoomAt(1);
      }
    };
    window.addEventListener("blur", clearDrag);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("blur", clearDrag);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [board, view.z]);
  const touch = useCanvasTouch({
    scope: "share:" + (board?.id || stack.length),
    surface,
    view,
    tapsEnabled: false,
    minZoom: MIN_CANVAS_ZOOM,
    maxZoom: MAX_CANVAS_ZOOM,
    onViewChange: setView,
    onCancel: () => {
      drag.current = undefined;
    },
    onActivity: () => {},
    onMenu: () => {},
  });
  return (
    <main className="share-viewer">
      <header>
        <PreferencesControls />
        <strong>{tr("画布分享 · 只读")}</strong>
        <a href={location.pathname}>{tr("返回我的画布")}</a>
        {stack.length > 0 && (
          <button onClick={() => setStack((s) => s.slice(0, -1))}>
            {tr("返回父画布")}
          </button>
        )}
        {root && (
          <>
            <button
              disabled={busy}
              onClick={() => {
                if (busy) return;
                setBusy(true);
                void exportBoard(root)
                  .then((raw) => {
                    const u = URL.createObjectURL(
                      new Blob([raw], { type: "application/json" }),
                    );
                    const a = document.createElement("a");
                    a.href = u;
                    a.download = tr("分享画布.json");
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(u), 1000);
                  })
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : "导出失败，请重试"),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {tr("下载快照")}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (
                  busy ||
                  !confirm(
                    tr("将备份当前本地工作区，并用此分享创建本地副本。继续？"),
                  )
                )
                  return;
                setBusy(true);
                void (async () => {
                  const old = await readBoard();
                  if (old) await saveRecovery(old);
                  await saveBoard(root);
                  localStorage.removeItem("yua-cloud-baseline");
                  location.href = location.pathname;
                })().catch((e) => {
                  setError(e instanceof Error ? e.message : "导入失败");
                  setBusy(false);
                });
              }}
            >
              {tr("复制到我的画布")}
            </button>
          </>
        )}
      </header>
      {unlocking && board && (
        <ComponentLockDialog
          mode="unlock"
          onClose={() => setUnlocking(undefined)}
          onSubmit={async (password) => {
            const plain = await unlockIsolated(unlocking, password, root!);
            if (unlockingRef.current !== unlocking) return;
            const next = {
              ...board,
              cards: board.cards.map((c) =>
                c.id === unlocking.id ? plain : c,
              ),
            };
            if (stack.length) setStack((s) => [...s.slice(0, -1), next]);
            else setRoot(next);
            setUnlocking(undefined);
          }}
        />
      )}
      {error ? (
        <p role="alert">{tr(error)}</p>
      ) : !board ? (
        <p role="status">{tr("正在加载分享画布…")}</p>
      ) : (
        <div
          className="share-surface"
          ref={surface}
          onPointerDownCapture={touch.down}
          onPointerMoveCapture={touch.move}
          onPointerUpCapture={touch.up}
          onPointerCancelCapture={touch.up}
          onLostPointerCapture={(e) => {
            touch.lostCapture(e);
            if (drag.current?.id === e.pointerId) drag.current = undefined;
          }}
          onClickCapture={touch.click}
          onPointerDown={(e) => {
            if (e.button !== 0 || (e.target as HTMLElement).closest("button,a"))
              return;
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}
          }}
          onPointerMove={(e) => {
            if (drag.current?.id !== e.pointerId) return;
            const dx = e.clientX - drag.current.x,
              dy = e.clientY - drag.current.y;
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
          }}
          onPointerUp={(e) => {
            if (drag.current?.id === e.pointerId) drag.current = undefined;
          }}
          onPointerCancel={(e) => {
            if (drag.current?.id === e.pointerId) drag.current = undefined;
          }}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey)
              zoomAt(view.z * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
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
            {board.groups
              .filter((g) => !presentationHidden(board, g.parent))
              .map(
                (g) =>
                  g.bounds && (
                    <div
                      key={g.id}
                      className="share-group"
                      style={{
                        left: groupFrame(g).x,
                        top: groupFrame(g).y,
                        width: groupFrame(g).width,
                        height: groupFrame(g).height,
                        background: g.color,
                      }}
                    >
                      <span>{g.masked ? tr("已遮罩") : g.name}</span>
                      {g.masked ? (
                        <Mask />
                      ) : g.displayMode === "list" ? (
                        <GroupList group={g} cards={groupCards(board, g.id)} />
                      ) : null}
                      {!g.masked && <Remark text={g.remark} />}
                    </div>
                  ),
              )}
            <svg className="share-connections">
              <ConnectionArrow
                id="canvas-connection-arrow"
                size={8}
                color="var(--connection-color)"
              />
              {board.connections
                ?.filter((c) =>
                  [c.from.card, c.to.card].every((id) => {
                    const card = board.cards.find((c) => c.id === id);
                    return card && !presentationHidden(board, card.group);
                  }),
                )
                .map((c) => {
                  const from = endpointPoint(c.from, board.cards, {}),
                    to = endpointPoint(c.to, board.cards, {}),
                    mid = curveMidpoint(from, to, c.from.side, c.to.side);
                  return (
                    <g key={c.id}>
                      <path
                        d={curve(from, to, c.from.side, c.to.side)}
                        stroke="var(--connection-color)"
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
            {board.cards
              .filter((c) => !presentationHidden(board, c.group))
              .map((c) => {
                const r = cardRect(c);
                const address = noteCardHref(c);
                return (
                  <article
                    className={
                      "share-card" +
                      (address ? " is-link-note" : "") +
                      (c.kind === "miniature" ? " share-miniature" : "")
                    }
                    key={c.id}
                    data-custom-color={customColor(c.color)}
                    style={{
                      left: r.x,
                      top: r.y,
                      width: r.width,
                      minHeight: r.height,
                      height: r.height,
                      background:
                        c.kind === "miniature"
                          ? "transparent"
                          : surfaceColor(
                              c.color,
                              address ? "var(--surface-muted)" : undefined,
                            ),
                      ...diagramFrameStyle(c),
                    }}
                  >
                    {c.locked ? (
                      <LockedContent onUnlock={() => setUnlocking(c)} />
                    ) : c.masked ? (
                      <Mask />
                    ) : c.displayMode === "small" ? (
                      <TypeIcon card={c} showName />
                    ) : (
                      <PreviewFrame card={c}>
                        {c.kind === "agent" ? (
                          <AgentCard card={c} />
                        ) : isToolKind(c.kind) ? (
                          <ToolCard card={c} />
                        ) : isApplicationKind(c.kind) ? (
                          <ApplicationCard card={c} />
                        ) : c.kind === "miniature" ? (
                          <Miniature card={c} />
                        ) : c.kind === "canvas" ? (
                          <button
                            onClick={() => setStack((s) => [...s, c.canvas!])}
                          >
                            {tr("进入 ")}
                            {c.title}
                          </button>
                        ) : c.kind === "text" ? (
                          <NoteText
                            text={c.text}
                            mode={c.textMode}
                            textStyle={c.textStyle}
                            textRuns={c.textRuns}
                            linkDisabled={c.linkDisabled}
                          />
                        ) : c.kind === "mindmap" ? (
                          <MindMap text={c.text} />
                        ) : c.kind === "flowchart" ? (
                          <FlowchartPreview text={c.text} />
                        ) : c.kind === "mermaid" ? (
                          <div className="mermaid-preview">
                            <Diagram
                              source={c.text}
                              language="mermaid"
                              standalone
                            />
                          </div>
                        ) : c.kind === "file" && (isXlsxFile(c) || officeKind(c)) ? (
                          <Attachment card={c} />
                        ) : isPdfFile(c) ? (
                          <PdfPreview card={c} />
                        ) : isTextFile(c) ? (
                          <FilePreview card={c} />
                        ) : c.kind === "todo" ? (
                          <>
                            <TodoHeading title={c.title} />
                            <ul>
                              {c.tasks?.map((t) => (
                                <li key={t.id}>
                                  {t.done ? "☑" : "☐"} {t.text}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          <>
                            <Asset card={c} />
                            {c.kind === "file" &&
                              /markdown/.test(c.mime || "") && (
                                <FilePreview card={c} />
                              )}
                          </>
                        )}
                      </PreviewFrame>
                    )}
                    {!c.masked && <Remark text={c.remark} />}
                  </article>
                );
              })}
            <svg className="share-paint">
              {!board.strokesHidden && <StrokeView strokes={board.strokes} />}
            </svg>
          </div>
          <div className="share-zoom">
            <button
              aria-label={tr("缩小")}
              disabled={view.z <= MIN_CANVAS_ZOOM + 1e-4}
              onClick={() => stepZoom(-0.2)}
            >
              −
            </button>
            <button
              className="zoom-percentage"
              aria-label={tr("原始比例")}
              onClick={() => zoomAt(1)}
            >
              {Math.round(view.z * 100)}%
            </button>
            <button
              aria-label={tr("放大")}
              disabled={view.z >= MAX_CANVAS_ZOOM - 1e-4}
              onClick={() => stepZoom(0.2)}
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
  return <Attachment card={card} />;
}

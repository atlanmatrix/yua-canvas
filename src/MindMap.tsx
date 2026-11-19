import {
  useLayoutEffect,
  useContext,
  type CSSProperties,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Highlighter, Square, Plus } from "./icons";
import { MenuButton } from "./MenuShortcut";
import { MenuSection } from "./CanvasContextMenu";
import { TextFormatToolbar } from "./TextFormatToolbar";
import { mindNodeStyle } from "./mindMapStyle";
import { MindMapLinks } from "./MindMapLinks";
import { FullContentExportContext } from "./ExportPreviewContext";
import { t as tr, useDarkTheme } from "./i18n";
import {
  indexMindMap,
  parseMindMap,
  toggleMindNode,
  updateMindNode,
  type MindMapData,
  type MindNode,
} from "./mindMapData";

type Props = {
  text: string;
  active?: string;
  onSelect?: (id: string) => void;
  onInsert?: (id: string, sibling: boolean) => void;
  onChange?: (update: (map: MindMapData) => MindMapData) => void;
  onMeasure?: (width: number, height: number) => void;
};
export function MindMap({
  text,
  active,
  onSelect,
  onInsert,
  onChange,
  onMeasure,
}: Props) {
  const map = useMemo(() => parseMindMap(text), [text]);
  const { cells, parents, states, rows, columns } = useMemo(
    () => indexMindMap(map.root),
    [map.root],
  );
  const current = active ? cells.get(active) : undefined;
  const selected = current?.node;
  const darkTheme = useDarkTheme();
  const print = useContext(FullContentExportContext);
  const dark = darkTheme && !print;
  const currentStyle =
    current &&
    mindNodeStyle(current.node, current.depth, current.branch, map.view, dark);
  const [editing, setEditing] = useState<string>();
  const drag = useRef<
    | {
        id: string;
        pointer: number;
        clientX: number;
        clientY: number;
        scale: number;
        x: number;
        y: number;
        minX: number;
        minY: number;
      }
    | undefined
  >(undefined);
  const [moving, setMoving] = useState<{ id: string; x: number; y: number }>();
  const input = useRef<HTMLInputElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const measure = useRef(onMeasure);
  measure.current = onMeasure;
  useLayoutEffect(() => {
    const el = layout.current;
    if (!el || !measure.current) return;
    const size = () => measure.current?.(el.offsetWidth, el.offsetHeight);
    size();
    const observer = new ResizeObserver(size);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const focus = (id?: string) => {
    if (id)
      layout.current
        ?.querySelector<HTMLElement>(`[data-mind-node="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!active) {
      drag.current = undefined;
      setMoving(undefined);
    }
    if (editing && editing === active) {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    } else {
      setEditing(undefined);
      focus(active);
    }
  }, [active, editing, map.view]);
  const patch = (id: string, fn: (node: MindNode) => MindNode) =>
    onChange?.((m) => ({ ...m, root: updateMindNode(m.root, id, fn) }));
  const saveLabel = (node: MindNode, value: string) => {
    if (value !== node.text) patch(node.id, (n) => ({ ...n, text: value }));
  };
  function keyDown(e: KeyboardEvent, node: MindNode) {
    if (
      e.target instanceof Element &&
      e.target.closest("button,input,select,textarea")
    )
      return;
    const editKey = e.key === " " || /^[\p{L}\p{Nd}]$/u.test(e.key);
    if (
      node.id !== active ||
      e.nativeEvent.isComposing ||
      e.nativeEvent.keyCode === 229 ||
      e.altKey ||
      (e.shiftKey && !editKey)
    )
      return;
    const mod = e.ctrlKey || e.metaKey;
    const parent = parents.get(node.id);
    if ((!mod && e.key === "Tab") || (mod && e.key === "Enter")) {
      if (!mod || parent) onInsert?.(node.id, mod);
    } else if (mod) return;
    else if (editKey || e.key === "Enter" || e.key === "F2")
      setEditing(node.id);
    else if (parent && (e.key === "Delete" || e.key === "Backspace")) {
      patch(parent.id, (n) => ({
        ...n,
        children: n.children.filter((child) => child.id !== node.id),
      }));
      onSelect?.(parent.id);
    } else if (e.key.startsWith("Arrow")) {
      const i =
        parent?.children.findIndex((child) => child.id === node.id) ?? -1;
      const next =
        e.key === "ArrowLeft"
          ? parent
          : e.key === "ArrowRight"
            ? node.children[0]
            : parent?.children[i + (e.key === "ArrowUp" ? -1 : 1)];
      if (next) onSelect?.(next.id);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }
  function dragPosition(e: PointerEvent) {
    const start = drag.current;
    if (!start || start.pointer !== e.pointerId) return;
    const dx = e.clientX - start.clientX,
      dy = e.clientY - start.clientY;
    if (!moving && Math.hypot(dx, dy) < 4) return;
    return {
      id: start.id,
      x: Math.max(start.minX, Math.round(start.x + dx / start.scale)),
      y: Math.max(start.minY, Math.round(start.y + dy / start.scale)),
    };
  }
  function cancelDrag() {
    drag.current = undefined;
    setMoving(undefined);
  }
  function label(node: MindNode, depth: number, branch: number) {
    const isRoot = depth === 0;
    const {
      fill,
      border,
      accent,
      label: typography,
    } = mindNodeStyle(node, depth, branch, map.view, dark);
    const state = states.get(node.id);
    const offset =
      map.view === "map"
        ? moving?.id === node.id
          ? moving
          : node.offset
        : undefined;
    return (
      <div
        className="mind-node"
        data-mind-node={node.id}
        data-selected={active === node.id || undefined}
        data-depth={Math.min(depth, map.view === "table" ? 3 : 4)}
        data-custom-border={node.border ? true : undefined}
        data-leaf={!node.children.length || undefined}
        style={
          {
            left: offset?.x,
            top: offset?.y,
            backgroundColor: fill,
            borderColor: border,
            color: typography.color,
            "--mind-accent": accent,
          } as CSSProperties
        }
        tabIndex={onSelect ? (isRoot && !active ? 0 : -1) : undefined}
        onFocus={
          onSelect
            ? (e) => {
                if (e.target === e.currentTarget && node.id !== active)
                  onSelect(node.id);
              }
            : undefined
        }
        onPointerDown={
          onSelect
            ? (e) => {
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey)
                  return;
                e.currentTarget.focus({ preventScroll: true });
                e.stopPropagation();
                if (map.view === "map") {
                  const el = e.currentTarget,
                    frame = layout.current!;
                  const scale =
                    frame.getBoundingClientRect().width / frame.offsetWidth ||
                    1;
                  const rect = el.getBoundingClientRect(),
                    box = frame.getBoundingClientRect();
                  const x = node.offset?.x ?? 0,
                    y = node.offset?.y ?? 0;
                  drag.current = {
                    id: node.id,
                    pointer: e.pointerId,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    scale,
                    x,
                    y,
                    minX: Math.ceil(x - (rect.left - box.left) / scale),
                    minY: Math.ceil(y - (rect.top - box.top) / scale),
                  };
                  el.setPointerCapture(e.pointerId);
                }
              }
            : undefined
        }
        onPointerMove={(e) => {
          const next = dragPosition(e);
          if (next) setMoving(next);
        }}
        onPointerUp={(e) => {
          if (!drag.current || drag.current.pointer !== e.pointerId) return;
          const next = dragPosition(e);
          cancelDrag();
          if (next)
            patch(next.id, (n) => ({ ...n, offset: { x: next.x, y: next.y } }));
        }}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onDoubleClick={
          onSelect
            ? (e) => {
                e.stopPropagation();
                onSelect(node.id);
                setEditing(node.id);
              }
            : undefined
        }
        onKeyDown={onSelect ? (e) => keyDown(e, node) : undefined}
      >
        {map.checkboxes &&
          (onChange ? (
            <input
              type="checkbox"
              checked={state === true}
              aria-label={node.text || tr("节点")}
              ref={(el) => {
                if (el) el.indeterminate = state === "mixed";
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={() => {
                onSelect?.(node.id);
                onChange((m) => ({
                  ...m,
                  root: toggleMindNode(m.root, node.id),
                }));
                focus(node.id);
              }}
            />
          ) : (
            <span aria-hidden="true">
              {state === true ? "☑" : state === "mixed" ? "⊟" : "☐"}
            </span>
          ))}
        {editing === node.id && active === node.id ? (
          <input
            ref={input}
            className="mind-label-editor canvas-editor"
            aria-label={tr("节点文字")}
            defaultValue={node.text}
            style={{
              ...typography,
              backgroundColor: typography.backgroundColor ?? "transparent",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              saveLabel(node, e.target.value);
              setEditing(undefined);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (!["Enter", "Escape", "Tab"].includes(e.key)) return;
              e.preventDefault();
              if (e.key !== "Escape") saveLabel(node, e.currentTarget.value);
              setEditing(undefined);
              if (e.key === "Tab" && !e.shiftKey) onInsert?.(node.id, false);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isRoot)
                onInsert?.(node.id, true);
            }}
          />
        ) : (
          <span className="mind-label" style={typography}>
            {node.text || "\u00a0"}
          </span>
        )}
        {(map.view === "map" || active === node.id) && !editing && onInsert && (
          <button
            type="button"
            className="mind-add-child"
            title={tr("创建子节点")}
            aria-label={tr("创建子节点")}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onInsert(node.id, false);
            }}
          >
            <Plus size={15} />
          </button>
        )}
      </div>
    );
  }
  function tree(node: MindNode, depth: number, branch: number) {
    const labelLength = node.children.reduce(
      (longest, child) => Math.max(longest, child.edgeLabel?.length ?? 0),
      0,
    );
    return (
      <div className="mind-branch" key={node.id}>
        {label(node, depth, branch)}
        {!!node.children.length && (
          <div
            className="mind-children"
            style={
              labelLength
                ? {
                    paddingLeft: Math.min(
                      220,
                      Math.max(90, labelLength * 13 + 32),
                    ),
                  }
                : undefined
            }
          >
            {node.children.map((child, i) =>
              tree(child, depth + 1, depth === 0 ? i : branch),
            )}
          </div>
        )}
      </div>
    );
  }
  return (
    <>
      <div ref={layout} className="mind-layout" data-view={map.view}>
        {map.view === "map" ? (
          <div className="mind-tree">
            <MindMapLinks
              parents={parents}
              cells={cells}
              dark={dark}
              moving={moving}
              onLabelChange={
                onChange
                  ? (id, edgeLabel) =>
                      patch(id, (n) => ({
                        ...n,
                        edgeLabel: edgeLabel || undefined,
                      }))
                  : undefined
              }
            />
            {tree(map.root, 0, 0)}
          </div>
        ) : (
          <table className="mind-table" aria-label={tr("思维导图表格")}>
            <tbody>
              {rows.map((row) => (
                <tr key={row.at(-1)!.node.id}>
                  {row.map(({ node, depth, branch, span }) => (
                    <td
                      key={node.id}
                      rowSpan={span}
                      colSpan={node.children.length ? 1 : columns - depth}
                    >
                      {label(node, depth, branch)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {currentStyle &&
        selected &&
        onChange &&
        createPortal(
          <div className="mind-format">
            <TextFormatToolbar
              style={currentStyle.text}
              onChange={(style) =>
                patch(selected.id, (n) => ({
                  ...n,
                  style: { ...n.style, ...style },
                }))
              }
            >
              {(
                [
                  ["fill", tr("节点填充色"), Highlighter],
                  ["border", tr("节点边框色"), Square],
                ] as const
              ).map(([field, name, Icon]) => (
                <label key={field} title={name}>
                  <Icon size={16} />
                  <input
                    type="color"
                    aria-label={name}
                    value={
                      currentStyle[field] === "transparent"
                        ? dark
                          ? "#171b22"
                          : "#ffffff"
                        : currentStyle[field]
                    }
                    onChange={(e) =>
                      patch(selected.id, (n) => ({
                        ...n,
                        [field]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </TextFormatToolbar>
          </div>,
          document.body,
        )}
    </>
  );
}

export function MindNodeMenu({
  text,
  id,
  onInsert,
  onChange,
}: {
  text: string;
  id: string;
  onInsert: (sibling: boolean) => void;
  onChange: (update: (map: MindMapData) => MindMapData) => void;
}) {
  const map = parseMindMap(text);
  return (
    <MenuSection label={tr("思维导图")}>
      <MenuButton
        role="menuitem"
        shortcut="addChild"
        autoFocus
        onClick={() => onInsert(false)}
      >
        {tr("创建子节点")}
      </MenuButton>
      {id === map.root.id ? (
        <>
          <button
            role="menuitem"
            onClick={() =>
              onChange((m) => ({
                ...m,
                view: m.view === "map" ? "table" : "map",
              }))
            }
          >
            {tr(map.view === "map" ? "转为表格" : "转为思维导图")}
          </button>
          <button
            role="menuitemcheckbox"
            aria-checked={map.checkboxes}
            onClick={() =>
              onChange((m) => ({ ...m, checkboxes: !m.checkboxes }))
            }
          >
            {tr(map.checkboxes ? "关闭复选框" : "启用复选框")}
          </button>
        </>
      ) : (
        <MenuButton
          role="menuitem"
          shortcut="addSibling"
          onClick={() => onInsert(true)}
        >
          {tr("创建同级节点")}
        </MenuButton>
      )}
    </MenuSection>
  );
}

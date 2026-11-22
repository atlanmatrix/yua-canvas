import { useRef, useState } from "react";
import { ModalBackdrop } from "./ModalBackdrop";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { MindMap, MindNodeMenu } from "./MindMap";
import {
  addMindNode,
  newMindNode,
  parseMindMap,
  type MindMapData,
} from "./mindMapData";
import { t as tr } from "./i18n";

export function MindMapEditor({
  text,
  onSave,
  onClose,
}: {
  text: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [map, setMap] = useState(() => parseMindMap(text));
  const [active, setActive] = useState(map.root.id);
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>();
  const stage = useRef<HTMLDivElement>(null);
  const draft = useRef(map);
  const past = useRef<MindMapData[]>([]);
  const future = useRef<MindMapData[]>([]);
  const source = JSON.stringify(map);
  const change = (update: (map: MindMapData) => MindMapData) => {
    past.current = [...past.current.slice(-99), draft.current];
    future.current = [];
    draft.current = update(draft.current);
    setMap(draft.current);
  };
  const insert = (id: string, sibling: boolean) => {
    const child = newMindNode(tr("新节点"));
    change((m) => ({ ...m, root: addMindNode(m.root, id, child, sibling) }));
    setActive(child.id);
  };
  const dismissMenu = () => {
    setMenu(undefined);
    stage.current
      ?.querySelector<HTMLElement>("[data-mind-node][data-selected]")
      ?.focus();
  };
  return (
    <ModalBackdrop
      className="modal-backdrop diagram-backdrop"
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        const key = e.key.toLowerCase();
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (menu) dismissMenu();
          else onClose();
        } else if (
          (e.metaKey || e.ctrlKey) &&
          key === "enter" &&
          !(e.target as Element).closest("input,textarea,[contenteditable]")
        ) {
          e.preventDefault();
          e.stopPropagation();
          onSave(JSON.stringify(draft.current));
        } else if (
          (e.metaKey || e.ctrlKey) &&
          (key === "z" || key === "y") &&
          !(e.target as Element).closest("input,textarea,[contenteditable]")
        ) {
          e.preventDefault();
          e.stopPropagation();
          const redo = e.shiftKey || key === "y";
          const from = redo ? future : past;
          const to = redo ? past : future;
          const next = from.current.pop();
          if (next) {
            to.current.push(map);
            draft.current = next;
            setMap(next);
            setActive(next.root.id);
          }
        }
      }}
    >
      <section
        className="modal mind-editor"
        role="dialog"
        aria-modal="true"
        aria-label={tr("编辑思维导图")}
        onPointerDownCapture={(e) => {
          if (menu && !(e.target as Element).closest('[role="menu"]'))
            setMenu(undefined);
        }}
      >
        <header className="flow-header">
          <h2>{tr("思维导图")}</h2>
          <div className="flow-header-actions">
            <button className="button" onClick={onClose}>
              {tr("取消")}
            </button>
            <button
              className="primary"
              onClick={() => onSave(JSON.stringify(draft.current))}
            >
              {tr("保存图表")}
            </button>
          </div>
        </header>
        <div ref={setToolbar} />
        <div
          ref={stage}
          className="mind-editor-stage"
          data-mind-active
          onContextMenu={(e) => {
            const node = (e.target as Element).closest<HTMLElement>(
              "[data-mind-node]",
            );
            if (
              !node?.dataset.mindNode ||
              (e.target as Element).closest("input")
            )
              return;
            e.preventDefault();
            setActive(node.dataset.mindNode);
            setMenu({ id: node.dataset.mindNode, x: e.clientX, y: e.clientY });
          }}
        >
          <MindMap
            text={source}
            active={active}
            onSelect={setActive}
            onChange={change}
            onInsert={insert}
            toolbar={toolbar}
          />
        </div>
        {menu && (
          <CanvasContextMenu x={menu.x} y={menu.y}>
            <MindNodeMenu
              text={source}
              id={menu.id}
              onChange={(update) => {
                change(update);
                dismissMenu();
              }}
              onInsert={(sibling) => {
                insert(menu.id, sibling);
                setMenu(undefined);
              }}
            />
          </CanvasContextMenu>
        )}
      </section>
    </ModalBackdrop>
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { t as tr } from "./i18n";
import {
  textCss,
  textSegments,
  type TextRun,
  type TextStyle,
} from "./presentation";
import { TextFormatToolbar } from "./TextFormatToolbar";

const schema = new Schema({
  nodes: {
    doc: { content: "note+" },
    note: {
      content: "text*",
      whitespace: "pre",
      toDOM: () => ["div", 0],
      parseDOM: [{ tag: "div" }],
    },
    text: { inline: true },
  },
  marks: {
    format: {
      attrs: { style: { default: {} } },
      toDOM(mark) {
        const span = document.createElement("span");
        const style = textCss(mark.attrs.style);
        Object.assign(span.style, style, { fontSize: style.fontSize + "px" });
        span.dataset.noteFormat = "";
        formatStyles.set(span, mark.attrs.style);
        return span;
      },
      parseDOM: [
        {
          tag: "span[data-note-format]",
          getAttrs: (el) => {
            // Only preserve marks emitted by this editor's own DOM.
            return { style: formatStyles.get(el) || {} };
          },
        },
      ],
    },
  },
});
const formatStyles = new WeakMap<HTMLElement, TextStyle>();
const markType = schema.marks.format;
function getStyle(
  marks: readonly import("prosemirror-model").Mark[],
): TextStyle {
  return markType.isInSet(marks)?.attrs.style || {};
}
export function TextEditor({
  text,
  mode,
  textStyle,
  textRuns,
  onChange,
  onFinish,
}: {
  text: string;
  mode?: "wrap" | "scroll";
  textStyle?: TextStyle;
  textRuns?: TextRun[];
  onChange: (text: string, runs: TextRun[]) => void;
  onFinish: (cancelled?: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [toolbar, setToolbar] = useState<Element | null>(null);
  const [active, setActive] = useState<TextStyle>({});
  const latest = useRef({ onChange, onFinish });
  latest.current = { onChange, onFinish };
  useLayoutEffect(() => {
    const nodes = textSegments(text, textRuns, textStyle).map((s) =>
      schema.text(
        s.text,
        Object.keys(s.style).length
          ? [markType.create({ style: s.style })]
          : [],
      ),
    );
    const doc = schema.node("doc", null, [schema.node("note", null, nodes)]);
    const editor = new EditorView(host.current!, {
      state: EditorState.create({
        doc,
        selection: TextSelection.atEnd(doc),
        plugins: [
          history(),
          keymap({
            "Mod-z": undo,
            "Mod-Shift-z": redo,
            "Mod-y": redo,
          }),
        ],
      }),
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": tr("文本内容"),
        spellcheck: "false",
        class: "text-editor canvas-editor",
      },
      handleKeyDown(editor, e) {
        if (
          !e.isComposing &&
          e.keyCode !== 229 &&
          (e.key === "Escape" ||
            (e.key === "Enter" && (e.metaKey || e.ctrlKey)))
        ) {
          e.preventDefault();
          latest.current.onFinish(e.key === "Escape");
          return true;
        }
        if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
          // Selectionchange can arrive after the next keydown. Use the native
          // caret when inserting a line immediately after a navigation key.
          const sel = editor.dom.ownerDocument.getSelection();
          const tr = editor.state.tr;
          if (
            sel?.rangeCount &&
            editor.dom.contains(sel.anchorNode) &&
            editor.dom.contains(sel.focusNode)
          ) {
            const range = sel.getRangeAt(0);
            const from = editor.posAtDOM(
              range.startContainer,
              range.startOffset,
            );
            const to = editor.posAtDOM(range.endContainer, range.endOffset);
            tr.setSelection(TextSelection.create(tr.doc, from, to));
          }
          editor.dispatch(tr.insertText("\n").scrollIntoView());
          return true;
        }
        return false;
      },
      handlePaste(editor, e) {
        const plain = e.clipboardData?.getData("text/plain");
        if (plain === undefined) return false;
        editor.dispatch(
          editor.state.tr
            .insertText(plain.replace(/\r\n?/g, "\n"))
            .scrollIntoView(),
        );
        return true;
      },
      clipboardTextSerializer: (slice) =>
        slice.content.textBetween(0, slice.content.size, "\n"),
      dispatchTransaction(transaction) {
        const state = editor.state.apply(transaction);
        editor.updateState(state);
        const sel = state.selection;
        setActive(
          getStyle(
            state.storedMarks ||
              (!sel.empty && sel.$from.nodeAfter?.marks) ||
              sel.$from.marks(),
          ),
        );
        if (!transaction.docChanged) return;
        const runs: TextRun[] = [];
        const lines: string[] = [];
        let start = 0;
        state.doc.forEach((block) => {
          lines.push(block.textContent);
          block.forEach((node, offset) => {
            if (node.marks.length)
              runs.push({
                from: start + offset,
                to: start + offset + node.nodeSize,
                style: getStyle(node.marks),
              });
          });
          start += block.content.size + 1;
        });
        latest.current.onChange(lines.join("\n"), runs);
      },
    });
    view.current = editor;
    setToolbar(host.current!.closest(".card,.group-component-editor"));
    setActive(getStyle(editor.state.selection.$from.marks()));
    editor.focus();
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, []);
  const format = (patch: TextStyle) => {
    const editor = view.current!;
    const { state } = editor;
    let { from, to, empty } = state.selection;
    const sel = editor.hasFocus()
      ? editor.dom.ownerDocument.getSelection()
      : null;
    if (
      sel?.rangeCount &&
      editor.dom.contains(sel.anchorNode) &&
      editor.dom.contains(sel.focusNode)
    ) {
      const range = sel.getRangeAt(0);
      from = editor.posAtDOM(range.startContainer, range.startOffset);
      to = editor.posAtDOM(range.endContainer, range.endOffset);
      empty = from === to;
    }
    const transaction = state.tr;
    if (from !== state.selection.from || to !== state.selection.to)
      transaction.setSelection(TextSelection.create(state.doc, from, to));
    if (empty) {
      transaction.addStoredMark(
        markType.create({ style: { ...active, ...patch } }),
      );
    } else {
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.isText)
          transaction.addMark(
            Math.max(from, pos),
            Math.min(to, pos + node.nodeSize),
            markType.create({ style: { ...getStyle(node.marks), ...patch } }),
          );
      });
    }
    editor.dispatch(transaction);
    if (!(document.activeElement instanceof HTMLInputElement)) editor.focus();
  };
  return (
    <>
      <div
        ref={host}
        className={"note-editor-host text-" + (mode || "wrap")}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
        }}
        onBlur={(e) => {
          if (
            !(e.relatedTarget as Element | null)?.closest(
              ".text-format-toolbar",
            )
          )
            onFinish();
        }}
      />
      {toolbar &&
        createPortal(
          <TextFormatToolbar style={active} onChange={format} />,
          toolbar,
        )}
    </>
  );
}

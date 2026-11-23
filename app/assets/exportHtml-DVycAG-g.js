import{a as e,zt as t}from"./canvasHierarchy-BWo7HRqL.js";import{toPng as n}from"./es-De3bU9FS.js";import{withExportScene as r}from"./exportPng-75YWQ20Q.js";var i=`.card-text .note-body.note-address,
.share-card .note-address,
article.note-address {
  display: flex;
  align-items: center;
  gap: var(--address-gap);
  padding: var(--address-inset) var(--address-end) var(--address-inset)
    var(--address-inset);
}
.card-text .note-body.note-address p,
.share-card .note-address p {
  flex: 1;
  min-width: 0;
  margin: 0;
}
.note-address .note-link {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit;
  text-decoration: none;
}
.note-address.text-scroll .note-link {
  overflow-x: auto;
  text-overflow: clip;
  scrollbar-width: none;
}
.note-address.text-scroll .note-link::-webkit-scrollbar {
  display: none;
}
.note-address .note-link:focus-visible {
  border-width: 0;
  color: var(--accent);
  text-decoration: underline;
}
body .note-address .note-link-icon {
  display: inline-flex;
  flex: 0 0 var(--address-icon);
  align-items: center;
  justify-content: center;
  width: var(--address-icon);
  height: var(--address-icon);
  min-height: 0;
  margin: 0;
  padding: 0;
  border: var(--address-border) solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
  box-shadow: none;
}
.note-body.note-address {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
`,a=`* {
  box-sizing: border-box;
}
html {
  overflow: hidden;
  overscroll-behavior: none;
}
body {
  position: fixed;
  inset: 0;
  overflow: clip;
  margin: 0;
  background: var(--canvas-bg);
  color: var(--ink);
  touch-action: none;
  font:
    13px/1.5 system-ui,
    sans-serif;
}
.export-group {
  position: absolute;
  border: 1px dashed var(--border);
  border-radius: var(--radius-card);
  pointer-events: none;
}
.export-group-title {
  position: absolute;
  top: 8px;
  left: 12px;
  max-width: calc(100% - 24px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
main {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  transform-origin: 0 0;
}
body.is-grabbing,
body.is-grabbing * {
  cursor: grabbing;
  user-select: none;
}
article {
  position: absolute;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: 0 3px 12px #0001;
}
article > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  border-radius: inherit;
}
.note,
.tasks {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 12px;
}
.note {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
}
.note.scroll {
  white-space: pre;
  overflow-wrap: normal;
}
.note:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: inherit;
}
.tasks {
  padding: 12px 15px;
}
header {
  font: 11px monospace;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin-bottom: 12px;
}
label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
  cursor: pointer;
}
input {
  margin: 0;
  accent-color: var(--accent);
}
label span,
aside {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
input:checked + span {
  color: var(--muted);
  text-decoration: line-through;
}
aside {
  position: absolute;
  left: calc(100% + 14px);
  top: 0;
  width: 200px;
  max-height: 260px;
  overflow: auto;
  padding: 10px 12px;
  background: var(--surface);
  border-left: 2px solid var(--border);
  font: 12px/1.7 system-ui;
}

article.is-link-note {
  border-radius: 999px;
}
.is-link-note .note {
  flex: 1;
  min-width: 0;
  height: auto;
  max-height: 100%;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.is-link-note .note.scroll,
.is-link-note .note:focus {
  overflow: auto;
  white-space: pre;
  text-overflow: clip;
}
`,o=`// This script runs in the standalone file. Only text and checkbox state are stored.
(() => {
  const canvas = document.querySelector("main");
  const viewport = document.documentElement;
  const fitScale = () =>
    Math.min(
      1,
      viewport.clientWidth / canvas.offsetWidth,
      viewport.clientHeight / canvas.offsetHeight,
    );
  let x = 0,
    y = 0,
    zoom = 1;
  let fitting = true;
  let drag;
  const render = () => {
    canvas.style.transform = \`translate(\${x}px, \${y}px) scale(\${zoom})\`;
  };
  const fit = () => {
    fitting = true;
    zoom = fitScale();
    x = (viewport.clientWidth - canvas.offsetWidth * zoom) / 2;
    y = (viewport.clientHeight - canvas.offsetHeight * zoom) / 2;
    render();
  };
  const zoomAt = (scale, px, py) => {
    fitting = false;
    if (scale === zoom) return;
    const ratio = scale / zoom;
    x = px - (px - x) * ratio;
    y = py - (py - y) * ratio;
    zoom = scale;
    render();
  };
  fit();
  window.addEventListener("resize", () => {
    if (fitting) fit();
  });
  document.addEventListener("contextmenu", (event) => event.preventDefault());

  const stopDrag = () => {
    if (!drag) return;
    const { pointerId } = drag;
    drag = undefined;
    document.body.classList.remove("is-grabbing");
    try {
      if (document.body.hasPointerCapture(pointerId))
        document.body.releasePointerCapture(pointerId);
    } catch {}
  };
  const touches = new Map();
  let pinch;
  const resetTouch = () => {
    touches.clear();
    pinch = undefined;
  };
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      if (event.target.closest?.(".note, input, a")) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinch = {
          distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          zoom,
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
        };
      }
      return;
    }
    if (event.button !== 2) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    try {
      document.body.setPointerCapture(event.pointerId);
    } catch {}
    document.body.classList.add("is-grabbing");
  });
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && touches.has(event.pointerId)) {
      const prev = touches.get(event.pointerId);
      const dx = event.clientX - prev.x;
      const dy = event.clientY - prev.y;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2 && pinch) {
        const [a, b] = [...touches.values()];
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        x += midX - pinch.midX;
        y += midY - pinch.midY;
        pinch.midX = midX;
        pinch.midY = midY;
        const next = Math.max(
          Math.min(0.1, fitScale()),
          Math.min(4, (pinch.zoom * dist) / pinch.distance),
        );
        zoomAt(next, midX, midY);
      } else if (dx || dy) {
        fitting = false;
        x += dx;
        y += dy;
        render();
      }
      return;
    }
    if (event.pointerId !== drag?.pointerId) return;
    if (!(event.buttons & 2)) {
      stopDrag();
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!dx && !dy) return;
    fitting = false;
    x += dx;
    y += dy;
    drag.x = event.clientX;
    drag.y = event.clientY;
    render();
  });
  const endDrag = (event) => {
    if (touches.has(event.pointerId)) {
      touches.delete(event.pointerId);
      if (touches.size < 2) pinch = undefined;
    }
    if (event.pointerId === drag?.pointerId) stopDrag();
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  document.addEventListener("lostpointercapture", endDrag);
  window.addEventListener("blur", () => {
    stopDrag();
    resetTouch();
  });

  document.addEventListener(
    "wheel",
    (event) => {
      if (!drag && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? viewport.clientHeight
            : 1;
      const factor = drag ? 0.006 : 0.003;
      const scale = zoom * Math.exp(-event.deltaY * unit * factor);
      zoomAt(
        Math.max(Math.min(0.1, fitScale()), Math.min(4, scale)),
        event.clientX,
        event.clientY,
      );
    },
    { passive: false },
  );
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.isComposing || event.keyCode === 229) return;
    const editing =
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        event.target.closest("input,textarea,select"));
    const mod = event.metaKey || event.ctrlKey;
    if (!mod && editing) return;
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;
    if ((mod || !editing) && !event.shiftKey && event.key === "0") {
      event.preventDefault();
      fit();
    } else if ((mod || !editing) && !event.shiftKey && event.key === "1") {
      event.preventDefault();
      zoomAt(1, cx, cy);
    } else if (
      (mod || !editing) &&
      (event.key === "+" || event.key === "=")
    ) {
      event.preventDefault();
      zoomAt(Math.min(4, Math.round((zoom + 0.2) * 10) / 10), cx, cy);
    } else if ((mod || !editing) && event.key === "-") {
      event.preventDefault();
      zoomAt(
        Math.max(Math.min(0.1, fitScale()), Math.round((zoom - 0.2) * 10) / 10),
        cx,
        cy,
      );
    }
  });

  canvas
    .querySelectorAll(".note,input[type=checkbox]")
    .forEach((field, index) => {
      const key = "yua-html:" + canvas.dataset.export + ":" + index;
      const checkbox = field instanceof HTMLInputElement;
      const runs = [...field.querySelectorAll("span")].map((span) =>
        span.cloneNode(false),
      );
      // Preserve the original formatting spans and native editing line breaks.
      // Restore only elements from this list, including when storage was modified.
      const record = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        if (node.nodeName === "BR") return ["br"];
        return [
          node.nodeName === "DIV" ? "div" : "span",
          node.dataset?.run,
          [...node.childNodes].map(record),
        ];
      };
      const restore = (value) => {
        if (typeof value === "string") return document.createTextNode(value);
        if (value[0] === "br") return document.createElement("br");
        const element =
          value[0] === "div"
            ? document.createElement("div")
            : (typeof value[1] === "string" &&
                runs[Number(value[1])]?.cloneNode(false)) ||
              document.createElement("span");
        element.append(...value[2].map(restore));
        return element;
      };
      try {
        const stored = JSON.parse(localStorage.getItem(key));
        if (checkbox && typeof stored === "boolean") field.checked = stored;
        else if (!checkbox && Array.isArray(stored))
          field.replaceChildren(...stored.map(restore));
      } catch {
        /* Some browsers disable storage for local files. */
      }
      field.addEventListener(checkbox ? "change" : "input", () => {
        try {
          localStorage.setItem(
            key,
            JSON.stringify(
              checkbox ? field.checked : [...field.childNodes].map(record),
            ),
          );
        } catch {
          /* The current document remains editable. */
        }
      });
    });
})();
`;function s(t,n,r){let i=r.createElement(`div`);i.className=`note `+(t.textMode||`wrap`),i.setAttribute(`contenteditable`,`plaintext-only`),i.setAttribute(`role`,`textbox`),i.setAttribute(`aria-label`,e(`文本内容`)),i.setAttribute(`aria-multiline`,`true`);let a=n.querySelector(`.note-body p`);i.style.cssText=a.style.cssText;let o=a.querySelectorAll(`span`);return o.length||(i.textContent=t.text),o.forEach((e,t)=>{let n=r.createElement(`span`);n.dataset.run=String(t),n.style.cssText=e.style.cssText,n.textContent=e.textContent,i.append(n)}),i}function c(e,t){let n=t.createElement(`div`);n.className=`tasks`;let r=t.createElement(`header`);r.textContent=e.title||`TODO`,n.append(r);for(let r of e.tasks||[]){let e=t.createElement(`label`),i=t.createElement(`input`),a=t.createElement(`span`);i.type=`checkbox`,i.defaultChecked=r.done,a.textContent=r.text,e.append(i,a),n.append(e)}return n}async function l(e){let t=e;if(e.querySelector(`.tool-component`)){t=e.cloneNode(!0);let n=`input,select,textarea,.calendar-grid button`,r=e.querySelectorAll(n);t.querySelectorAll(n).forEach((e,t)=>{let n=r[t],i=document.createElement(`span`);i.textContent=n instanceof HTMLSelectElement?n.selectedOptions[0]?.textContent||``:n instanceof HTMLInputElement||n instanceof HTMLTextAreaElement?n.value||n.placeholder:n.textContent,i.className=n.className,e.replaceWith(i)}),t.querySelector(`.calculator-keys`)?.remove(),e.after(t)}let{left:r,top:i}=t.style;t.style.left=`0px`,t.style.top=`0px`;try{let r=e.offsetWidth,i=e.offsetHeight;return await n(t,{pixelRatio:Math.min(2,8192/r,8192/i,Math.sqrt(16e6/(r*i))),skipFonts:!0,style:{boxShadow:`none`,borderColor:`transparent`},filter:e=>!(e instanceof Element&&e.matches(`.component-remark,.pdf-navigation,.agent-readonly,button:not(.canvas-card-preview button),input,textarea,select`))})}finally{t.style.left=r,t.style.top=i,t!==e&&t.remove()}}function u(n){return r(n,async(n,r)=>{let u=document.implementation.createHTMLDocument(`Yua Canvas`);u.documentElement.lang=document.documentElement.lang;let d=crypto.randomUUID(),f=u.createElement(`meta`);f.setAttribute(`charset`,`utf-8`);let p=u.createElement(`meta`);p.httpEquiv=`Content-Security-Policy`,p.content=`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${d}'; base-uri 'none'; form-action 'none'`;let m=u.createElement(`meta`);m.name=`viewport`,m.content=`width=device-width, initial-scale=1`;let h=u.createElement(`style`);h.textContent=a+i,u.head.prepend(f,p,m),u.head.append(h);let g=getComputedStyle(n);for(let e of[`--canvas-bg`,`--ink`,`--accent`,`--border`,`--muted`,`--surface`,`--surface-muted`,`--radius-card`,`--connection-color`])u.documentElement.style.setProperty(e,g.getPropertyValue(e));for(let[e,n]of Object.entries(t))u.documentElement.style.setProperty(e,n);u.documentElement.style.colorScheme=document.documentElement.dataset.theme===`dark`?`dark`:`light`;let _=u.createElement(`main`);_.dataset.export=d,_.style.width=n.style.width,_.style.height=n.style.height;let v=n.firstElementChild,y=u.createElement(`div`);y.style.cssText=v.style.cssText;for(let e of v.querySelectorAll(`:scope > .group-boundary`)){let t=u.createElement(`section`);t.className=`export-group`,t.style.left=e.style.left,t.style.top=e.style.top,t.style.width=e.style.width,t.style.height=e.style.height;let n=getComputedStyle(e);t.style.background=n.backgroundColor;let r=e.querySelector(`.group-title`)?.textContent?.trim();if(r){let e=u.createElement(`span`);e.className=`export-group-title`,e.textContent=r,t.append(e)}y.append(t)}let b=v.querySelector(`:scope > svg[data-export-layer="connections"]`);b&&y.append(b.cloneNode(!0));let x=v.querySelectorAll(`:scope > .card`);for(let[t,n]of r.entries()){let r=x[t],i=u.createElement(`article`);i.style.cssText=r.style.cssText;let a=getComputedStyle(r);if(i.style.background=a.backgroundColor,i.style.borderRadius=a.borderRadius,r.dataset.customColor===`true`)for(let e of[`--ink`,`--muted`,`--surface`,`--border`])i.style.setProperty(e,a.getPropertyValue(e));let o=!n.masked&&!n.locked&&n.displayMode!==`small`;if(o&&n.kind===`text`){let e=r.querySelector(`.note-address .note-link-icon`);e&&(i.className=`is-link-note note-address`,i.append(e.cloneNode(!0))),i.append(s(n,r,u))}else if(o&&n.kind===`todo`)i.append(c(n,u));else{let t=u.createElement(`img`);t.alt=n.masked?e(`已遮罩`):n.locked?e(`已锁定组件`):n.title||n.kind,t.src=await l(r),i.append(t)}if(!n.masked&&!n.locked&&n.remark){let e=u.createElement(`aside`);e.textContent=n.remark,i.append(e)}y.append(i)}let S=v.querySelector(`:scope > svg[data-export-layer="strokes"]`);S&&y.append(S.cloneNode(!0)),_.append(y);let C=u.createElement(`script`);return C.setAttribute(`nonce`,d),C.textContent=o,u.body.append(_,C),new Blob([`<!doctype html>
`,u.documentElement.outerHTML],{type:`text/html;charset=utf-8`})})}export{u as exportHtml};
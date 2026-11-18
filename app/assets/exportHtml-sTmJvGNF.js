import{b as e}from"./index-Dx9UrJjs.js";import{toPng as t}from"./es-CdjYEENL.js";import{withExportScene as n}from"./exportPng-BNtahE0w.js";var r=`* {
  box-sizing: border-box;
}
html {
  overflow: hidden;
}
body {
  position: fixed;
  inset: 0;
  overflow: clip;
  margin: 0;
  background: var(--canvas-bg);
  color: var(--ink);
  font:
    13px/1.5 system-ui,
    sans-serif;
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
  border-radius: 12px;
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
`,i=`// This script runs in the standalone file. Only text and checkbox state are stored.
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
    if (document.body.hasPointerCapture(pointerId))
      document.body.releasePointerCapture(pointerId);
  };
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 2) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    document.body.setPointerCapture(event.pointerId);
    document.body.classList.add("is-grabbing");
  });
  document.addEventListener("pointermove", (event) => {
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
    if (event.pointerId === drag?.pointerId) stopDrag();
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  document.addEventListener("lostpointercapture", endDrag);
  window.addEventListener("blur", stopDrag);

  document.addEventListener(
    "wheel",
    (event) => {
      if (!drag) return;
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? viewport.clientHeight
            : 1;
      const scale = zoom * Math.exp(-event.deltaY * unit * 0.006);
      zoomAt(
        Math.max(Math.min(0.1, fitScale()), Math.min(4, scale)),
        event.clientX,
        event.clientY,
      );
    },
    { passive: false },
  );
  document.addEventListener("keydown", (event) => {
    if (
      !(event.metaKey || event.ctrlKey) ||
      event.altKey ||
      event.shiftKey ||
      event.isComposing
    )
      return;
    if (event.key === "0") {
      event.preventDefault();
      fit();
    } else if (event.key === "1") {
      event.preventDefault();
      zoomAt(1, viewport.clientWidth / 2, viewport.clientHeight / 2);
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
`;function a(t,n,r){let i=r.createElement(`div`);i.className=`note `+(t.textMode||`wrap`),i.setAttribute(`contenteditable`,`plaintext-only`),i.setAttribute(`role`,`textbox`),i.setAttribute(`aria-label`,e(`文本内容`)),i.setAttribute(`aria-multiline`,`true`);let a=n.querySelector(`.note-body p`);i.style.cssText=a.style.cssText;let o=a.querySelectorAll(`span`);return o.length||(i.textContent=t.text),o.forEach((e,t)=>{let n=r.createElement(`span`);n.dataset.run=String(t),n.style.cssText=e.style.cssText,n.textContent=e.textContent,i.append(n)}),i}function o(e,t){let n=t.createElement(`div`);n.className=`tasks`;let r=t.createElement(`header`);r.textContent=`TODO`,n.append(r);for(let r of e.tasks||[]){let e=t.createElement(`label`),i=t.createElement(`input`),a=t.createElement(`span`);i.type=`checkbox`,i.defaultChecked=r.done,a.textContent=r.text,e.append(i,a),n.append(e)}return n}async function s(e){let n=e;if(e.querySelector(`.tool-component`)){n=e.cloneNode(!0);let t=`input,select,textarea,.calendar-grid button`,r=e.querySelectorAll(t);n.querySelectorAll(t).forEach((e,t)=>{let n=r[t],i=document.createElement(`span`);i.textContent=n instanceof HTMLSelectElement?n.selectedOptions[0]?.textContent||``:n instanceof HTMLInputElement||n instanceof HTMLTextAreaElement?n.value||n.placeholder:n.textContent,i.className=n.className,e.replaceWith(i)}),n.querySelector(`.calculator-keys`)?.remove(),e.after(n)}let{left:r,top:i}=n.style;n.style.left=`0px`,n.style.top=`0px`;try{let r=e.offsetWidth,i=e.offsetHeight;return await t(n,{pixelRatio:Math.min(2,8192/r,8192/i,Math.sqrt(16e6/(r*i))),skipFonts:!0,style:{boxShadow:`none`,borderColor:`transparent`},filter:e=>!(e instanceof Element&&e.matches(`.component-remark,.pdf-navigation,.agent-readonly,button:not(.canvas-card-preview button),input,textarea,select`))})}finally{n.style.left=r,n.style.top=i,n!==e&&n.remove()}}function c(t){return n(t,async(t,n)=>{let c=document.implementation.createHTMLDocument(`Yua Canvas`);c.documentElement.lang=document.documentElement.lang;let l=crypto.randomUUID(),u=c.createElement(`meta`);u.setAttribute(`charset`,`utf-8`);let d=c.createElement(`meta`);d.httpEquiv=`Content-Security-Policy`,d.content=`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${l}'; base-uri 'none'; form-action 'none'`;let f=c.createElement(`meta`);f.name=`viewport`,f.content=`width=device-width, initial-scale=1`;let p=c.createElement(`style`);p.textContent=r,c.head.prepend(u,d,f),c.head.append(p);let m=getComputedStyle(t);for(let e of[`--canvas-bg`,`--ink`,`--accent`,`--border`,`--muted`,`--surface`,`--connection-color`])c.documentElement.style.setProperty(e,m.getPropertyValue(e));let h=c.createElement(`main`);h.dataset.export=l,h.style.width=t.style.width,h.style.height=t.style.height;let g=t.firstElementChild,_=c.createElement(`div`);_.style.cssText=g.style.cssText,_.append(g.querySelector(`:scope > svg`).cloneNode(!0));let v=g.querySelectorAll(`:scope > .card`);for(let[t,r]of n.entries()){let n=v[t],i=c.createElement(`article`);i.style.cssText=n.style.cssText,i.style.background=getComputedStyle(n).backgroundColor;let l=!r.masked&&!r.locked&&r.displayMode!==`small`;if(l&&r.kind===`text`)i.append(a(r,n,c));else if(l&&r.kind===`todo`)i.append(o(r,c));else{let t=c.createElement(`img`);t.alt=r.masked?e(`已遮罩`):r.locked?e(`已锁定组件`):r.title||r.kind,t.src=await s(n),i.append(t)}if(!r.masked&&!r.locked&&r.remark){let e=c.createElement(`aside`);e.textContent=r.remark,i.append(e)}_.append(i)}h.append(_);let y=c.createElement(`script`);return y.setAttribute(`nonce`,l),y.textContent=i,c.body.append(h,y),new Blob([`<!doctype html>
`,c.documentElement.outerHTML],{type:`text/html;charset=utf-8`})})}export{c as exportHtml};
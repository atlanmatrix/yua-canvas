// This script runs in the standalone file. Only text and checkbox state are stored.
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
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
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

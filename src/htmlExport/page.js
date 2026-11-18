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

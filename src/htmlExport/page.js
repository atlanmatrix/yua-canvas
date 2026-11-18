// This script runs in the standalone file. Only text and checkbox state are stored.
(() => {
  const canvas = document.querySelector("main");
  const menu = document.querySelector("#zoom-menu");
  const items = [...menu.querySelectorAll("button")];
  const fitScale = () =>
    Math.min(1, document.documentElement.clientWidth / canvas.offsetWidth);
  let zoom = fitScale();
  let fitting = true;
  let anchor;
  const setZoom = (scale) => {
    zoom = scale;
    canvas.style.zoom = scale;
  };
  setZoom(zoom);

  window.addEventListener("resize", () => {
    menu.hidePopover();
    if (fitting) setZoom(fitScale());
  });
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    anchor = { x: event.clientX, y: event.clientY };
    menu.showPopover();
    const { clientWidth, clientHeight } = document.documentElement;
    menu.style.left = `${Math.max(4, Math.min(anchor.x, clientWidth - menu.offsetWidth - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(anchor.y, clientHeight - menu.offsetHeight - 4))}px`;
    items[0].focus({ preventScroll: true });
  });
  menu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.zoom;
    if (!action) return;
    menu.hidePopover();
    fitting = action === "fit";
    if (fitting) {
      setZoom(fitScale());
      window.scrollTo(0, 0);
      return;
    }
    const before = canvas.getBoundingClientRect();
    const scale = zoom * (action === "in" ? 1.25 : 0.8);
    const previousZoom = zoom;
    setZoom(Math.max(Math.min(0.1, fitScale()), Math.min(4, scale)));
    const after = canvas.getBoundingClientRect();
    window.scrollBy(
      after.left + ((anchor.x - before.left) * zoom) / previousZoom - anchor.x,
      after.top + ((anchor.y - before.top) * zoom) / previousZoom - anchor.y,
    );
  });
  menu.addEventListener("keydown", (event) => {
    const index = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
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

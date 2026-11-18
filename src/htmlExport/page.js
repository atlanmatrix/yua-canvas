// This script runs in the standalone file. Only text and checkbox state are stored.
(() => {
  const canvas = document.querySelector("main");
  const fit = () => {
    canvas.style.zoom = Math.min(
      1,
      document.documentElement.clientWidth / canvas.offsetWidth,
    );
  };
  fit();
  window.addEventListener("resize", fit);

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

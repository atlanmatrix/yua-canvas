// DSH's lazy CommonJS client factory. React comes from the host's platform
// table; the canvas keeps its own React and global styles inside its iframe.
window.__ModuleLoader__.load({
  id: "dsh-yua-canvas",
  factory(require) {
    const React = require("react");
    const PANEL = "yua-canvas";

    function CanvasIcon({ size = 20 }) {
      return React.createElement(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.6,
          "aria-hidden": true,
        },
        React.createElement("rect", {
          x: 3,
          y: 3,
          width: 18,
          height: 18,
          rx: 4,
        }),
        React.createElement("path", {
          d: "M8 8h3v3H8zM14 13h3v3h-3zM11 10l4 3",
        }),
      );
    }

    function CanvasPanel() {
      return React.createElement(
        "section",
        {
          "aria-label": "Canvas of Yua",
          style: {
            width: "100%",
            height: "100%",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            paddingTop: "var(--dsh-frame-top-clearance, 0px)",
          },
        },
        React.createElement("iframe", {
          title: "Canvas of Yua",
          src: new URL("api/yua-canvas/index.html", document.baseURI).href,
          allow: "clipboard-read; clipboard-write",
          style: { border: 0, width: "100%", flex: 1, minHeight: 0 },
        }),
      );
    }

    return {
      name: PANEL,
      inject: ["slots", "layout"],
      apply(ctx) {
        ctx.slots.inject("main", () =>
          ctx.slots.register(
            {
              name: "main",
              key: PANEL,
            },
            CanvasPanel,
          ),
        );
        ctx.slots.inject("sidebar.panellist", () =>
          ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: PANEL,
              label: "Canvas",
              order: 10,
            },
            CanvasIcon,
          ),
        );
      },
    };
  },
});

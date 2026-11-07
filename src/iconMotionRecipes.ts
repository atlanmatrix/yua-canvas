export type MotionPhase =
  "hover" | "leave" | "press" | "click" | "entry" | "busy";
export type MotionPart = {
  nodes: SVGGeometryElement[];
  frames: Keyframe[];
  name: string;
  origin?: string;
  delay?: number;
  duration?: number;
};
type Elements = SVGGeometryElement[];
const list = (value: Elements, test: (node: SVGGeometryElement) => boolean) =>
  value.filter(test);
const d = (node: Element) => node.getAttribute("d") || "";
const tag = (nodes: Elements, name: string) =>
  list(nodes, (node) => node.tagName.toLowerCase() === name);
const linear = (nodes: Elements) =>
  list(
    nodes,
    (node) =>
      node.tagName === "line" ||
      (node.tagName === "path" && !/[acqst]/i.test(d(node))),
  );
const dots = (nodes: Elements) =>
  list(
    nodes,
    (node) =>
      /h\.01/.test(d(node)) ||
      (node.tagName === "circle" && Number(node.getAttribute("r")) < 2),
  );
const identity = "translate(0px, 0px) rotate(0deg) scale(1)";

export const iconMotionFamilies: Record<string, string> = {};
for (const [family, names] of Object.entries({
  settings: "Settings Settings2",
  appearance: "Sun Moon Monitor",
  transfer: "Upload Download FileUp FolderUp",
  document: "Copy ClipboardPaste Scissors Save Package",
  viewport: "Plus Minus Maximize Square",
  navigation:
    "ArrowLeft ArrowUpRight LogOut ChevronUp ChevronDown ChevronLeft ChevronRight",
  history: "Undo2 RotateCcw RotateCw RefreshCw",
  visibility: "Eye EyeOff",
  remove: "Trash2 Delete X Unlink",
  drawing: "Paintbrush Pencil Palette Highlighter",
  typography: "Type Bold Italic Underline Strikethrough",
  layout: "Layers PanelsTopLeft PanelsLeftBottom LayoutGrid List",
  tasks: "ListTodo Check MoreHorizontal WrapText ArrowLeftRight",
  assistance: "Pin MessageSquare CircleHelp Search",
  agent: "Bot Send Play Terminal Code2 VSCodeIcon",
  spatial: "Box Network",
  files: "Image ImagePlus FileText Folder",
  tools: "Calculator CalendarDays Thermometer Ruler CloudSun",
  status: "Cloud WifiOff CircleAlert FileWarning",
}))
  for (const name of names.split(" ")) iconMotionFamilies[name] = family;

/** Select SVG geometry by meaning/attributes, never by child position. */
export function iconMotionRecipe(
  svg: SVGSVGElement,
  phase: MotionPhase,
): MotionPart[] {
  const name = svg.dataset.uiIcon || "";
  const all = [
    ...svg.querySelectorAll<SVGGeometryElement>(
      ":scope > path,:scope > circle,:scope > rect,:scope > line,:scope > polyline,:scope > polygon,:scope > ellipse",
    ),
  ];
  const shapes = list(all, (node) => !node.hasAttribute("data-icon-detail"));
  const paths = tag(shapes, "path"),
    circles = tag(shapes, "circle"),
    rects = tag(shapes, "rect");
  const result: MotionPart[] = [];
  const strength =
    phase === "hover"
      ? 1.8
      : phase === "busy"
        ? 1.4
        : phase === "press"
          ? 1.6
          : 2.2;
  const amplify = (value: string) =>
    value.replace(
      /(translate(?:X|Y)?|rotate|skew(?:X|Y)?|scale(?:X|Y)?)\(([^)]+)\)/g,
      (_, kind: string, values: string) =>
        `${kind}(${values.replace(/-?\d*\.?\d+/g, (number) => {
          const value = Number(number);
          return String(
            Number(
              (kind.startsWith("scale")
                ? 1 + (value - 1) * strength
                : value * strength
              ).toFixed(3),
            ),
          );
        })})`,
    );
  const transform = (
    nodes: Elements,
    value: string,
    part: string,
    origin = "12px 12px",
  ) =>
    result.push({
      nodes,
      name: part,
      origin,
      frames: [
        { transform: identity },
        { transform: amplify(value), offset: 0.42 },
        { transform: identity },
      ],
    });
  const move = (nodes: Elements, x: number, y: number, part: string) =>
    transform(nodes, `translate(${x}px,${y}px)`, part);
  const rotate = (
    nodes: Elements,
    angle: number,
    part: string,
    origin?: string,
  ) => transform(nodes, `rotate(${angle}deg)`, part, origin);
  const draw = (nodes: Elements, part: string) => {
    for (const node of nodes) {
      if (getComputedStyle(node).stroke === "none") continue;
      let length: number;
      try {
        length = node.getTotalLength();
      } catch {
        continue;
      }
      if (!length) continue;
      result.push({
        nodes: [node],
        name: part,
        frames: [
          {
            strokeDasharray: `${length} ${length}`,
            strokeDashoffset: phase === "entry" ? length : 0,
            opacity: phase === "entry" ? 0.7 : 1,
          },
          ...(phase === "entry"
            ? []
            : [
                {
                  strokeDasharray: `${length} ${length}`,
                  strokeDashoffset: length * (phase === "hover" ? 0.5 : 1),
                  opacity: 0.7,
                  offset: 0.35,
                },
              ]),
          {
            strokeDasharray: `${length} ${length}`,
            strokeDashoffset: 0,
            opacity: 1,
          },
        ],
      });
    }
  };
  const stagger = (nodes: Elements, part: string, axis: "x" | "y" = "y") =>
    nodes.forEach((node, i) => {
      move([node], axis === "x" ? 1 : 0, axis === "y" ? -1 : 0, part);
      result[result.length - 1].delay = Math.min(i * 22, 110);
    });
  const blink = (nodes: Elements, part = "eyes") =>
    result.push({
      nodes,
      name: part,
      origin: "12px 14px",
      frames: [
        { transform: "scaleY(1)" },
        { transform: "scaleY(.16)", offset: phase === "busy" ? 0.12 : 0.5 },
        { transform: "scaleY(1)", offset: phase === "busy" ? 0.22 : 1 },
        ...(phase === "busy" ? [{ transform: "scaleY(1)" }] : []),
      ],
    });
  // These gestures are directional journeys, including a fully clipped wrap.
  // Keep the wrap discrete: interpolation across the viewport would flash it.
  const wrap = (nodes: Elements, axis: "X" | "Y", part: string) => {
    const sign = phase === "leave" ? 1 : -1;
    result.push({
      nodes,
      name: part,
      duration: 600,
      frames: [
        { transform: `translate${axis}(0px)` },
        { transform: `translate${axis}(${-sign * 2}px)`, offset: 0.16 },
        {
          transform: `translate${axis}(${sign * 28}px)`,
          offset: 0.49,
          easing: "steps(1, end)",
        },
        { transform: `translate${axis}(${-sign * 28}px)`, offset: 0.5 },
        { transform: `translate${axis}(0px)` },
      ],
    });
  };
  if (
    (phase === "hover" || phase === "leave" || phase === "click") &&
    ((name === "ArrowLeft" && !!svg.closest(".canvas-navigation")) ||
      (["FileUp", "FolderUp"].includes(name) && !!svg.closest(".toolbar")))
  ) {
    wrap(
      name === "ArrowLeft" ? shapes : linear(shapes),
      name === "ArrowLeft" ? "X" : "Y",
      "travel-arrow",
    );
    return result;
  }
  if (svg.closest(".bottom-tools") && phase !== "press" && phase !== "busy") {
    const reverse = phase === "leave";
    if (name === "ImagePlus") {
      const frames = [
        { transform: "translate(0px, 0px)", opacity: 1 },
        {
          transform: "translate(4px, 10px)",
          opacity: 0,
          offset: 0.48,
          easing: "steps(1, end)",
        },
        { transform: "translate(-6px, 10px)", opacity: 0, offset: 0.5 },
        { transform: "translate(-3px, 3px)", opacity: 1, offset: 0.76 },
        { transform: "translate(0px, 0px)", opacity: 1 },
      ];
      result.push({
        nodes: circles,
        name: "sun-orbit",
        duration: 600,
        frames: reverse
          ? frames.map((f, i) => ({
              ...frames[frames.length - i - 1],
              offset: f.offset,
              easing: f.easing,
            }))
          : frames,
      });
      return result;
    }
    if (name === "PanelsTopLeft") {
      const frames: Keyframe[] = [
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        {
          transform: "translate(-18px, -18px) scale(1.7)",
          opacity: 0,
          offset: 0.49,
          easing: "steps(1, end)",
        },
        {
          transform: "translate(15px, 15px) scale(.2)",
          opacity: 0,
          offset: 0.5,
        },
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
      ];
      result.push({
        nodes: paths,
        name: "canvas-expand",
        duration: 600,
        frames: reverse
          ? frames.map((f, i) => ({
              ...frames[frames.length - i - 1],
              offset: f.offset,
              easing: f.easing,
            }))
          : frames,
      });
      return result;
    }
    if (name === "ListTodo") {
      const tick = list(paths, (node) => /^m3 17/i.test(d(node)));
      for (const node of tick) {
        const length = node.getTotalLength();
        result.push({
          nodes: [node],
          name: "todo-check",
          duration: 600,
          frames: reverse
            ? [
                {
                  strokeDasharray: `${length} ${length}`,
                  strokeDashoffset: 0,
                  opacity: 1,
                },
                {
                  strokeDasharray: `${length} ${length}`,
                  strokeDashoffset: length,
                  opacity: 0,
                },
              ]
            : [
                {
                  strokeDasharray: `${length} ${length}`,
                  strokeDashoffset: length,
                  opacity: 0,
                },
                {
                  strokeDasharray: `${length} ${length}`,
                  strokeDashoffset: length,
                  opacity: 0,
                  offset: 0.25,
                },
                {
                  strokeDasharray: `${length} ${length}`,
                  strokeDashoffset: 0,
                  opacity: 1,
                },
              ],
        });
      }
      result.push({
        nodes: list(all, (node) => node.dataset.iconDetail === "todo-square"),
        name: "todo-square",
        duration: 600,
        frames: reverse
          ? [{ opacity: 0 }, { opacity: 1, offset: 0.75 }, { opacity: 1 }]
          : [{ opacity: 1 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }],
      });
      return result;
    }
    const ink = all.find((node) => node.dataset.iconDetail === "pen-ink");
    if (name === "Paintbrush" && ink) {
      // The nib follows the same cubic S curve as the ink, then lifts home.
      const frames: Keyframe[] = [];
      const inkFrames: Keyframe[] = [];
      const length = ink.getTotalLength(),
        start = ink.getPointAtLength(0);
      for (let i = 0; i <= 24; i++) {
        const t = i / 24,
          progress = t * t * (3 - 2 * t);
        const point = ink.getPointAtLength(length * progress);
        frames.push({
          transform: `translate(${point.x - start.x}px,${point.y - start.y}px)`,
          offset: t * 0.7,
          easing: "linear",
        });
        inkFrames.push({
          strokeDashoffset: 1 - progress,
          opacity: i ? 1 : 0,
          offset: t * 0.7,
          easing: "linear",
        });
      }
      frames.push(
        { transform: "translate(0px,0px)", offset: 0.86 },
        { transform: "translate(0px,0px)" },
      );
      result.push({ nodes: shapes, name: "pen-sweep", duration: 900, frames });
      result.push({
        nodes: [ink],
        name: "pen-ink",
        duration: 900,
        frames: [...inkFrames, { strokeDashoffset: 0, opacity: 0 }],
      });
      return result;
    }
  }
  if (phase === "press") {
    transform(shapes, "scale(.95)", "press");
    return result;
  }
  if (phase === "busy") {
    if (name === "Bot") {
      blink(list(paths, (node) => /^M(9|15) 13/.test(d(node))));
      move(
        list(paths, (node) => d(node).startsWith("M12 8")),
        0,
        -0.6,
        "antenna",
      );
    } else
      result.push({
        nodes: shapes,
        name: "progress",
        frames: [
          { transform: "rotate(0deg)" },
          { transform: `rotate(${name === "RotateCcw" ? -360 : 360}deg)` },
        ],
      });
    return result;
  }
  switch (name) {
    case "Settings":
      rotate(paths, phase === "hover" ? 15 : 30, "gear");
      break;
    case "Settings2":
      circles.forEach((node) =>
        move(
          [node],
          Number(node.getAttribute("cy")) < 12 ? 1.5 : -1.5,
          0,
          "slider",
        ),
      );
      break;
    case "Sun":
      rotate(paths, 12, "rays");
      transform(circles, "scale(1.07)", "sun");
      break;
    case "Moon":
      rotate(paths, -9, "moon", "15px 8px");
      break;
    case "Monitor":
      draw(rects, "screen");
      move(paths, 0, -0.5, "stand");
      break;
    case "Upload":
    case "Download":
    case "FileUp":
    case "FolderUp":
      move(linear(shapes), 0, name === "Download" ? 1.5 : -1.5, "arrow");
      break;
    case "Copy":
      move(rects, 1, 1, "front-page");
      move(paths, -0.5, -0.5, "back-page");
      break;
    case "ClipboardPaste":
      move(linear(paths), 1.5, 0, "paste-arrow");
      move(rects, 0, 0.6, "clip");
      break;
    case "Scissors":
      rotate(
        list(
          shapes,
          (node) =>
            node.getAttribute("cy") === "6" || /^M8\.12|^M14\.8/.test(d(node)),
        ),
        -8,
        "blade-upper",
      );
      rotate(
        list(
          shapes,
          (node) => node.getAttribute("cy") === "18" || /^M20 4/.test(d(node)),
        ),
        8,
        "blade-lower",
      );
      break;
    case "Save":
      move(
        list(paths, (node) => /^M7 3|^M17 21/.test(d(node))),
        0,
        1,
        "save-slot",
      );
      break;
    case "Package":
      rotate(tag(shapes, "polyline"), -6, "lid", "12px 12px");
      draw(linear(paths), "fold");
      break;
    case "Plus":
    case "Minus":
      transform(shapes, "scale(1.1)", "sign");
      break;
    case "Maximize":
      transform(shapes, "scale(1.1)", "corners");
      break;
    case "Square":
      transform(shapes, "scale(.9)", "stop");
      break;
    case "ArrowLeft":
    case "ChevronLeft":
    case "Delete":
      move(
        linear(shapes).length ? linear(shapes) : shapes,
        -1.5,
        0,
        "direction",
      );
      break;
    case "ChevronRight":
    case "LogOut":
      move(linear(shapes), 1.5, 0, "direction");
      break;
    case "ArrowUpRight":
      move(shapes, 1.1, -1.1, "direction");
      break;
    case "ChevronUp":
      move(shapes, 0, -1.5, "direction");
      break;
    case "ChevronDown":
      move(shapes, 0, 1.5, "direction");
      break;
    case "RotateCcw":
    case "RotateCw":
    case "RefreshCw":
      result.push({
        nodes: shapes,
        name: "rotation",
        frames:
          phase === "hover"
            ? [
                { transform: "rotate(0deg)" },
                {
                  transform: `rotate(${(name === "RotateCcw" ? -18 : 18) * strength}deg)`,
                  offset: 0.5,
                },
                { transform: "rotate(0deg)" },
              ]
            : [
                { transform: "rotate(0deg)" },
                {
                  transform: `rotate(${name === "RotateCcw" ? -360 : 360}deg)`,
                },
              ],
      });
      break;
    case "Undo2":
      draw(paths, "undo-arc");
      rotate(shapes, -12, "undo");
      break;
    case "Eye":
      blink(shapes);
      break;
    case "EyeOff":
      blink(list(shapes, (node) => !/^m2 2/.test(d(node))));
      draw(
        list(paths, (node) => /^m2 2/.test(d(node))),
        "slash",
      );
      break;
    case "Trash2":
      rotate(
        list(paths, (node) => {
          const box = node.getBBox();
          return box.y <= 6 && box.height <= 5;
        }),
        -9,
        "lid",
        "7px 5px",
      );
      break;
    case "X":
      transform(shapes, "scale(.87)", "close");
      break;
    case "Unlink":
      paths.forEach((node) =>
        move([node], node.getBBox().x < 10 ? -0.8 : 0.8, 0, "link"),
      );
      break;
    case "Paintbrush":
    case "Pencil":
    case "Highlighter":
      rotate(shapes, -7, "nib", "6px 19px");
      break;
    case "Palette":
      stagger(circles, "pigment");
      break;
    case "Bold":
      result.push({
        nodes: shapes,
        name: "weight",
        frames: [
          { strokeWidth: 2 },
          { strokeWidth: 2.6, offset: 0.5 },
          { strokeWidth: 2 },
        ],
      });
      break;
    case "Italic":
      transform(shapes, "skewX(-5deg)", "italic");
      break;
    case "Underline":
    case "Strikethrough":
      draw(tag(shapes, "line"), "decoration");
      break;
    case "Type":
      draw(shapes, "letter");
      break;
    case "Layers":
      stagger(paths, "layer");
      break;
    case "PanelsTopLeft":
    case "PanelsLeftBottom":
      move(paths, name === "PanelsTopLeft" ? 0.8 : -0.8, 0.6, "divider");
      break;
    case "LayoutGrid":
      stagger(rects, "cell");
      break;
    case "List":
      stagger(linear(paths), "row", "x");
      break;
    case "ListTodo":
      draw(
        list(paths, (node) => /^m3 17/.test(d(node))),
        "tick",
      );
      stagger(
        list(paths, (node) => /^M13 /.test(d(node))),
        "task",
        "x",
      );
      break;
    case "Check":
      draw(shapes, "tick");
      break;
    case "MoreHorizontal":
      stagger(circles, "dot");
      break;
    case "WrapText":
      draw(paths, "wrap");
      break;
    case "ArrowLeftRight":
      shapes.forEach((node) =>
        move([node], node.getBBox().y < 12 ? 1.3 : -1.3, 0, "exchange"),
      );
      break;
    case "Pin":
      transform(shapes, "translateY(0.8px) rotate(7deg)", "pin", "12px 20px");
      break;
    case "MessageSquare":
      transform(shapes, "scale(1.05)", "bubble", "6px 19px");
      break;
    case "CircleHelp":
      rotate(paths, -6, "question");
      draw(paths, "question-stroke");
      break;
    case "Search":
      transform(circles, "scale(1.08)", "lens", "10px 10px");
      move(paths, 0.6, 0.6, "handle");
      break;
    case "Bot":
      blink(list(paths, (node) => /^M(9|15) 13/.test(d(node))));
      move(
        list(paths, (node) => d(node).startsWith("M12 8")),
        0,
        -1,
        "antenna",
      );
      break;
    case "Send":
      move(shapes, 1.7, -1.7, "flight");
      break;
    case "Play":
      move(shapes, 1.2, 0, "play");
      break;
    case "Terminal":
      move(tag(shapes, "polyline"), 1, 0, "prompt");
      draw(paths, "cursor");
      break;
    case "Code2":
      shapes.forEach((node) =>
        move([node], node.getBBox().x < 12 ? -1 : 1, 0, "bracket"),
      );
      break;
    case "VSCodeIcon":
      transform(shapes, "skewX(-3deg) scale(1.025)", "bracket");
      break;
    case "Box":
      draw(linear(paths), "edge");
      rotate(shapes, 3, "cube");
      break;
    case "Network":
      rects.forEach((node) =>
        move(
          [node],
          Number(node.getAttribute("x")) < 12 ? -0.7 : 0.7,
          -0.5,
          "node",
        ),
      );
      draw(paths, "connection");
      break;
    case "Image":
    case "ImagePlus":
      move(circles, 0, -0.8, "image-sun");
      move(
        list(paths, (node) => /^m21 15|^m3 16|^m21 16/i.test(d(node))),
        0,
        0.8,
        "landscape",
      );
      if (name === "ImagePlus")
        transform(
          list(paths, (node) => /^M16 5|^M19 2/.test(d(node))),
          "scale(1.1)",
          "image-plus",
          "19px 5px",
        );
      break;
    case "FileText":
      draw(linear(paths), "file-lines");
      move(
        list(paths, (node) => /^M14 2/.test(d(node))),
        0,
        -0.6,
        "fold",
      );
      break;
    case "Folder":
      transform(paths, "skewX(-3deg) scaleY(.96)", "folder", "3px 20px");
      break;
    case "Calculator":
      stagger(dots(shapes), "key");
      break;
    case "CalendarDays":
      stagger(dots(shapes), "date");
      move(
        list(paths, (node) => /^M3 9/.test(d(node))),
        0,
        -0.8,
        "page",
      );
      break;
    case "Thermometer":
      draw(paths, "tube");
      result.push({
        nodes: list(all, (node) => node.hasAttribute("data-icon-detail")),
        name: "mercury",
        frames: [
          { strokeDasharray: "10 10", strokeDashoffset: 10, opacity: 0 },
          {
            strokeDasharray: "10 10",
            strokeDashoffset: 0,
            opacity: 0.65,
            offset: 0.55,
          },
          { strokeDasharray: "10 10", strokeDashoffset: 0, opacity: 0 },
        ],
      });
      break;
    case "Ruler":
      draw(
        list(paths, (node) => d(node).length < 30),
        "tick-marks",
      );
      break;
    case "CloudSun":
      move(
        list(paths, (node) => /^M13 22/.test(d(node))),
        1,
        0,
        "cloud",
      );
      rotate(
        list(paths, (node) => !/^M13 22/.test(d(node))),
        -8,
        "sun",
        "12px 12px",
      );
      break;
    case "Cloud":
      move(paths, 1.1, 0, "cloud");
      if (phase !== "hover")
        result.push({
          nodes: list(all, (node) => node.hasAttribute("data-icon-detail")),
          name: "sync-wave",
          frames: [
            { transform: "scale(.7)", opacity: 0 },
            { transform: "scale(1)", opacity: 0.3, offset: 0.4 },
            { transform: "scale(1.4)", opacity: 0 },
          ],
        });
      break;
    case "WifiOff":
      draw(paths, "signal");
      break;
    case "CircleAlert":
    case "FileWarning":
      draw(linear(paths), "warning");
      transform(circles, "scale(1.04)", "warning-ring");
      break;
    default:
      draw(shapes, "outline");
  }
  // Keep a useful local stroke response if an upstream icon shape changes.
  if (!result.some((part) => part.nodes.length)) draw(shapes, "outline");
  return result.filter((part) => part.nodes.length);
}

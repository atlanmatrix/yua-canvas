import { test, expect, type Page } from "@playwright/test";

async function gallery(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeEnabled();
  return page.evaluate(async () => {
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const React = reactModule.default || reactModule;
    const domModule =
      await import("/node_modules/.vite/deps/react-dom_client.js");
    const DOM = domModule.default || domModule;
    const icons = await import("/src/icons.tsx");
    const { VSCodeIcon } = await import("/src/VSCodeIcon.tsx");
    const { ExportPreviewContext } =
      await import("/src/ExportPreviewContext.ts");
    const host = document.createElement("section");
    host.id = "motion-gallery";
    host.style.cssText =
      "position:fixed;left:20px;right:20px;top:90px;max-height:70vh;overflow:auto;background:var(--surface);z-index:999;display:grid;grid-template-columns:repeat(13,1fr);gap:4px;padding:12px";
    document.body.append(host);
    const catalogue = { ...icons, VSCodeIcon };
    const root = DOM.createRoot(host);
    root.render(
      React.createElement(
        React.Fragment,
        null,
        ...Object.entries(catalogue).map(([name, Icon]) =>
          React.createElement(
            "button",
            { key: name, "aria-label": "demo " + name, style: { height: 54 } },
            React.createElement(Icon, { size: 24 }),
          ),
        ),
        React.createElement(
          "button",
          {
            "aria-label": "disabled demo",
            disabled: true,
            style: { height: 54 },
          },
          React.createElement(icons.Plus),
        ),
        React.createElement(
          "button",
          { "aria-label": "busy demo", disabled: true, style: { height: 54 } },
          React.createElement(icons.RefreshCw, { motionBusy: true }),
        ),
        React.createElement(
          "button",
          { "aria-label": "busy agent", style: { height: 54 } },
          React.createElement(icons.Bot, { motionBusy: true }),
        ),
        React.createElement(
          ExportPreviewContext.Provider,
          { value: 2 },
          React.createElement(
            "button",
            { "aria-label": "export demo", style: { height: 54 } },
            React.createElement(icons.EyeOff),
          ),
        ),
      ),
    );
    return Object.keys(catalogue);
  });
}
const svg = (page: Page, name: string) =>
  page
    .getByRole("button", { name: "demo " + name, exact: true })
    .locator("svg");
const count = (locator: any) =>
  locator.evaluate(
    (node: Element) =>
      node
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running").length,
  );

test("all 79 interface icons animate their own geometry while control dimensions and accessible names stay stable", async ({
  page,
}) => {
  const names = await gallery(page);
  expect(names).toHaveLength(79);
  await expect(page.locator("#motion-gallery svg[data-ui-icon]")).toHaveCount(
    83,
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const name of names) {
    const button = page.getByRole("button", {
      name: "demo " + name,
      exact: true,
    });
    const before = await button.boundingBox();
    await button.hover();
    const result = await svg(page, name).evaluate((node) => ({
      phase: node.getAttribute("data-icon-phase"),
      family: node.getAttribute("data-icon-family"),
      hidden: node.getAttribute("aria-hidden"),
      root: node.getAnimations().length,
      parts: node
        .getAnimations({ subtree: true })
        .map((a) =>
          (a.effect as KeyframeEffect).target?.getAttribute("data-motion-part"),
        ),
    }));
    expect(result.phase, name).toBe("hover");
    expect(result.family, name).toBeTruthy();
    expect(result.root, name).toBe(0);
    expect(result.hidden, name).toBe("true");
    expect(result.parts.length, name).toBeGreaterThan(0);
    expect(await button.boundingBox(), name).toEqual(before);
  }
  expect(errors).toEqual([]);
});

test("semantic parts move independently, repeated clicks replay, and completed icons return to their original geometry", async ({
  page,
}) => {
  await gallery(page);
  await page
    .getByRole("button", { name: "demo Settings", exact: true })
    .hover();
  await expect(svg(page, "Settings").locator("path")).toHaveAttribute(
    "data-motion-part",
    "gear",
  );
  expect(
    await svg(page, "Settings")
      .locator("circle")
      .evaluate((n) => n.getAnimations().length),
  ).toBe(0);
  const scissors = page.getByRole("button", {
    name: "demo Scissors",
    exact: true,
  });
  const original = await svg(page, "Scissors").evaluate((n) =>
    [...n.children].map((p) => p.getAttribute("d") || p.getAttribute("cx")),
  );
  await scissors.hover();
  const parts = await svg(page, "Scissors").evaluate((n) =>
    [...n.querySelectorAll("[data-motion-part]")].map((p) =>
      p.getAttribute("data-motion-part"),
    ),
  );
  expect(parts).toContain("blade-upper");
  expect(parts).toContain("blade-lower");
  const box = (await scissors.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(svg(page, "Scissors")).toHaveAttribute(
    "data-icon-phase",
    "press",
  );
  await page.mouse.up();
  await expect(svg(page, "Scissors")).toHaveAttribute(
    "data-icon-phase",
    "click",
  );
  await expect.poll(() => count(svg(page, "Scissors"))).toBe(0);
  await scissors.click();
  await expect(svg(page, "Scissors")).toHaveAttribute(
    "data-icon-phase",
    "click",
  );
  await expect.poll(() => count(svg(page, "Scissors"))).toBe(0);
  expect(
    await svg(page, "Scissors").evaluate((n) =>
      [...n.children].map((p) => p.getAttribute("d") || p.getAttribute("cx")),
    ),
  ).toEqual(original);
  expect(
    await svg(page, "Scissors").evaluate((n) =>
      [...n.children].every((p) => getComputedStyle(p).transform === "none"),
    ),
  ).toBe(true);
});

test("disabled and export icons stay still; keyboard focus and activation receive animation", async ({
  page,
}) => {
  await gallery(page);
  const disabled = page.getByRole("button", {
    name: "disabled demo",
    exact: true,
  });
  await disabled.hover();
  expect(await count(disabled)).toBe(0);
  const exported = page.getByRole("button", {
    name: "export demo",
    exact: true,
  });
  await expect(exported.locator("svg")).toHaveAttribute("data-icon-static", "");
  await exported.hover();
  await exported.click();
  expect(await count(exported)).toBe(0);
  const first = page.getByRole("button", {
    name: "demo ArrowLeft",
    exact: true,
  });
  await page.keyboard.press("Tab");
  await first.focus();
  await expect(svg(page, "ArrowLeft")).toHaveAttribute(
    "data-icon-phase",
    "hover",
  );
  await page.keyboard.press("Enter");
  await expect(svg(page, "ArrowLeft")).toHaveAttribute(
    "data-icon-phase",
    "click",
  );
});

test("real controls keep working through menus, theme changes and closing dialogs", async ({
  page,
}) => {
  await page.goto("/");
  const settings = page.getByRole("button", { name: "设置", exact: true });
  await settings.hover();
  await expect(settings.locator("svg")).toHaveAttribute(
    "data-icon-phase",
    "hover",
  );
  await settings.click();
  await expect(page.locator(".settings-popover")).toBeVisible();
  const theme = page.getByRole("slider", { name: "外观", exact: true });
  await theme.press("Home");
  await theme.press("ArrowRight");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.locator('.settings-popover [data-ui-icon="Moon"]'),
  ).toHaveAttribute("data-icon-phase", "click");
  const exportTrigger = page.getByRole("button", { name: "导出", exact: true });
  await exportTrigger.hover();
  await expect(
    exportTrigger.locator('svg[data-ui-icon="ChevronRight"]'),
  ).toHaveAttribute("data-icon-phase", "hover");
  await expect(
    page.getByRole("menu", { name: "导出格式", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "组件压缩包", exact: true }).hover();
  await expect(
    page
      .getByRole("menuitem", { name: "组件压缩包", exact: true })
      .locator("svg"),
  ).toHaveAttribute("data-icon-phase", "hover");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-popover")).not.toBeVisible();
  await page.getByRole("button", { name: "使用说明", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "使用说明", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭使用说明", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = await page.locator(".world").getAttribute("style");
  const zoom = page.getByRole("button", { name: "放大", exact: true });
  await zoom.click();
  await expect(page.locator(".world")).not.toHaveAttribute("style", before!);
  await expect(zoom.locator("svg")).toHaveAttribute("data-icon-phase", "click");
});

test("busy feedback follows real state, pauses with camera activity and resumes; reduced motion cancels all movement", async ({
  page,
}) => {
  await gallery(page);
  const busy = page.getByRole("button", { name: "busy demo", exact: true });
  const agent = page.getByRole("button", { name: "busy agent", exact: true });
  await expect.poll(() => count(busy)).toBeGreaterThan(0);
  await expect.poll(() => count(agent)).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const { pauseIconMotion } = await import("/src/iconMotionActivity.ts");
    pauseIconMotion(450);
  });
  expect(await count(busy)).toBe(0);
  expect(await count(agent)).toBe(0);
  await page
    .getByRole("button", { name: "demo Scissors", exact: true })
    .hover();
  expect(await count(svg(page, "Scissors"))).toBe(0);
  await expect.poll(() => count(busy)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page
        .locator("#motion-gallery")
        .evaluate((n) => n.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await page.getByRole("button", { name: "demo Copy", exact: true }).hover();
  await page.getByRole("button", { name: "demo Copy", exact: true }).click();
  expect(await count(svg(page, "Copy"))).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => count(busy)).toBeGreaterThan(0);
});

test("dragged controls cancel feedback instead of playing a click animation", async ({
  page,
}) => {
  await gallery(page);
  const control = page.getByRole("button", { name: "demo Plus", exact: true }),
    box = (await control.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(svg(page, "Plus")).toHaveAttribute("data-icon-phase", "press");
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, {
    steps: 3,
  });
  await page.mouse.up();
  expect(await count(svg(page, "Plus"))).toBe(0);
  await control.click();
  await expect(svg(page, "Plus")).toHaveAttribute("data-icon-phase", "click");
});

test("PNG scenes render static icons even while interface loading animations are running", async ({
  page,
}) => {
  await gallery(page);
  const result = await page.evaluate(async () => {
    const { exportPng } = await import("/src/exportPng.tsx");
    let inspected = false,
      animated = 0,
      icons = 0;
    const inspect = () => {
      const root = document.querySelector(".png-export");
      if (root) {
        inspected = true;
        icons = root.querySelectorAll("svg[data-icon-static]").length;
        animated += root.getAnimations({ subtree: true }).length;
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      const blob = await exportPng({
        version: 1,
        groups: [],
        cards: [
          {
            id: "masked",
            kind: "text",
            title: "",
            text: "secret",
            masked: true,
            x: 10,
            y: 10,
            width: 180,
            height: 100,
            color: "#ffffff",
          },
          {
            id: "canvas",
            kind: "canvas",
            title: "Canvas",
            text: "",
            x: 240,
            y: 10,
            width: 240,
            height: 180,
            color: "#ffffff",
            canvas: { version: 1, cards: [], groups: [] },
          },
        ],
      });
      return { inspected, animated, icons, size: blob.size, type: blob.type };
    } finally {
      observer.disconnect();
    }
  });
  expect(result.inspected).toBe(true);
  expect(result.animated).toBe(0);
  expect(result.icons).toBeGreaterThan(1);
  expect(result.type).toBe("image/png");
  expect(result.size).toBeGreaterThan(1000);
});

test.describe("touch icon feedback", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test("successive finger taps replay click feedback without a sticky hover", async ({
    page,
  }) => {
    await gallery(page);
    await page
      .locator("#motion-gallery")
      .evaluate(
        (n) => ((n as HTMLElement).style.gridTemplateColumns = "repeat(5,1fr)"),
      );
    const control = page.getByRole("button", {
      name: "demo ArrowLeft",
      exact: true,
    });
    await control.tap();
    await expect(svg(page, "ArrowLeft")).toHaveAttribute(
      "data-icon-phase",
      "click",
    );
    await expect.poll(() => count(svg(page, "ArrowLeft"))).toBe(0);
    await control.tap();
    await expect(svg(page, "ArrowLeft")).toHaveAttribute(
      "data-icon-phase",
      "click",
    );
    await expect.poll(() => count(svg(page, "ArrowLeft"))).toBe(0);
    await expect(svg(page, "ArrowLeft")).not.toHaveAttribute(
      "data-icon-phase",
      "hover",
    );
  });
});

test("SVG instances inside passive preview content receive feedback without adding button semantics", async ({
  page,
}) => {
  await gallery(page);
  await page.evaluate(() => {
    const source = document.querySelector(
      '#motion-gallery [data-ui-icon="Box"]',
    )!;
    const host = document.createElement("div");
    host.className = "card";
    host.setAttribute("data-testid", "standalone-icon");
    host.style.cssText =
      "position:fixed;left:20px;top:10px;width:64px;height:64px;display:flex;align-items:center;justify-content:center;z-index:1000";
    host.append(source.cloneNode(true));
    document.body.append(host);
  });
  const preview = page.getByTestId("standalone-icon"),
    icon = preview.locator("svg");
  await preview.hover();
  await expect(icon).toHaveAttribute("data-icon-phase", "hover");
  await preview.click();
  await expect(icon).toHaveAttribute("data-icon-phase", "click");
  expect(await preview.getAttribute("role")).toBeNull();
  expect(await preview.getAttribute("tabindex")).toBeNull();
  await expect.poll(() => count(icon)).toBe(0);
});

test("larger motions stay continuous when a hover becomes a press or returns to rest", async ({
  page,
}) => {
  await gallery(page);
  const control = page.getByRole("button", {
    name: "demo Settings",
    exact: true,
  });
  await control.hover();
  const press = await control.evaluate((button) => {
    const icon = button.querySelector("svg")!,
      path = icon.querySelector("path")!;
    const running = icon.getAnimations({ subtree: true });
    for (const animation of running) {
      animation.pause();
      animation.currentTime = 200;
    }
    const before = new DOMMatrix(getComputedStyle(path).transform);
    const duration = Number(running[0].effect!.getTiming().duration);
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "mouse",
        pointerId: 1,
        button: 0,
        buttons: 1,
      }),
    );
    for (const animation of icon.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 0;
    }
    const after = new DOMMatrix(getComputedStyle(path).transform);
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerType: "mouse",
        pointerId: 1,
        button: 0,
        buttons: 0,
      }),
    );
    return {
      before: [before.a, before.b, before.c, before.d, before.e, before.f],
      after: [after.a, after.b, after.c, after.d, after.e, after.f],
      duration,
    };
  });
  expect(press.duration).toBeGreaterThan(300);
  expect(Math.abs(press.before[1])).toBeGreaterThan(0.35);
  press.before.forEach((value, index) =>
    expect(press.after[index]).toBeCloseTo(value, 4),
  );
  const copy = page.getByRole("button", { name: "demo Copy", exact: true });
  await copy.hover();
  const leaving = await copy.evaluate((button) => {
    const icon = button.querySelector("svg")!,
      rect = icon.querySelector("rect")!;
    for (const animation of icon.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 180;
    }
    const before = new DOMMatrix(getComputedStyle(rect).transform);
    button.dispatchEvent(
      new PointerEvent("pointerout", {
        bubbles: true,
        pointerType: "mouse",
        relatedTarget: document.body,
      }),
    );
    const animations = icon.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 0;
    }
    const after = new DOMMatrix(getComputedStyle(rect).transform);
    animations.forEach((animation) => animation.play());
    return {
      before: [before.a, before.b, before.c, before.d, before.e, before.f],
      after: [after.a, after.b, after.c, after.d, after.e, after.f],
      phase: icon.getAttribute("data-icon-phase"),
    };
  });
  expect(leaving.phase).toBe("settle");
  leaving.before.forEach((value, index) =>
    expect(leaving.after[index]).toBeCloseTo(value, 4),
  );
  await expect.poll(() => count(svg(page, "Copy"))).toBe(0);
  expect(
    await svg(page, "Copy")
      .locator("rect")
      .evaluate((node) => getComputedStyle(node).transform),
  ).toBe("none");
});

test("finishing a loading state eases back to its resting icon", async ({
  page,
}) => {
  await gallery(page);
  await page.evaluate(async () => {
    const reactModule = await import("/node_modules/.vite/deps/react.js"),
      React = reactModule.default || reactModule;
    const domModule =
        await import("/node_modules/.vite/deps/react-dom_client.js"),
      DOM = domModule.default || domModule;
    const { RefreshCw } = await import("/src/icons.tsx");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:20px;top:10px;z-index:1000";
    document.body.append(host);
    function Loading() {
      const [busy, setBusy] = React.useState(false);
      return React.createElement(
        "button",
        {
          "aria-label": "finish loading",
          onClick: () => setBusy(!busy),
          style: { width: 50, height: 50 },
        },
        React.createElement(RefreshCw, { motionBusy: busy }),
      );
    }
    DOM.createRoot(host).render(React.createElement(Loading));
  });
  const button = page.getByRole("button", {
      name: "finish loading",
      exact: true,
    }),
    icon = button.locator("svg");
  await button.click();
  await expect(icon).toHaveAttribute("data-icon-phase", "busy");
  const turning = await icon.evaluate((node) => {
    const animations = node
      .getAnimations({ subtree: true })
      .filter(
        (animation) => animation.effect!.getTiming().iterations === Infinity,
      );
    const sample = (fraction: number) => {
      for (const animation of animations) {
        const timing = animation.effect!.getTiming();
        animation.pause();
        animation.currentTime =
          Number(timing.delay) + Number(timing.duration) * fraction;
      }
      return new DOMMatrix(
        getComputedStyle(node.querySelector("path")!).transform,
      ).b;
    };
    return { quarter: sample(0.25), threeQuarters: sample(0.75) };
  });
  expect(turning.quarter).toBeGreaterThan(0.8);
  expect(turning.threeQuarters).toBeLessThan(-0.8);
  await button.click();
  await expect(icon).toHaveAttribute("data-icon-phase", "settle");
  await expect.poll(() => count(icon)).toBe(0);
  expect(
    await icon.evaluate((node) =>
      [...node.children].every(
        (part) => getComputedStyle(part).transform === "none",
      ),
    ),
  ).toBe(true);
});

test("gear holds a counterclockwise half turn and preserves inertia in both interrupted directions", async ({
  page,
}) => {
  await page.goto("/");
  const settings = page.getByRole("button", { name: "设置", exact: true });
  await settings.hover();
  const result = await settings.evaluate((button) => {
    const svg = button.querySelector("svg")!,
      path = svg.querySelector("path")!;
    const angle = () => {
      const m = new DOMMatrix(getComputedStyle(path).transform);
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    };
    const seek = (time: number) => {
      const animation = path.getAnimations()[0];
      animation.pause();
      animation.currentTime = time;
      return angle();
    };
    const event = (type: string) =>
      button.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerType: "mouse",
          relatedTarget: document.body,
        }),
      );
    const duration = path.getAnimations()[0].effect!.getTiming().duration;
    const quarter = seek(150),
      middle = seek(300),
      end = seek(600);
    seek(300);
    event("pointerout");
    const reversed = seek(0),
      coastOut = seek(30),
      returning = seek(300);
    event("pointerover");
    const reentered = seek(0),
      coastIn = seek(30),
      held = seek(600);
    event("pointerout");
    const left = seek(600);
    return {
      duration,
      quarter,
      middle,
      end,
      reversed,
      coastOut,
      returning,
      reentered,
      coastIn,
      held,
      left,
    };
  });
  expect(result.duration).toBe(600);
  expect(result.quarter).toBeGreaterThan(-40);
  expect(result.quarter).toBeLessThan(-15);
  expect(result.middle).toBeCloseTo(-90, 0);
  expect(Math.abs(result.end)).toBeCloseTo(180, 0);
  expect(result.reversed).toBeCloseTo(result.middle, 3);
  expect(result.coastOut).toBeLessThan(result.reversed);
  expect(result.reentered).toBeCloseTo(result.returning, 3);
  expect(result.coastIn).toBeGreaterThan(result.reentered);
  expect(Math.abs(result.held)).toBeCloseTo(180, 0);
  expect(result.left).toBeCloseTo(0, 3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      settings.locator("path").evaluate((n) => n.getAnimations().length),
    )
    .toBe(0);
});

test("upload arrows anticipate, fully clear the clip, wrap from below and reverse on leave without moving their frames", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of ["上传文件", "导入目录"]) {
    const control = page.getByRole("button", { name, exact: true });
    const bounds = await control.boundingBox();
    await control.hover();
    const sample = await control.evaluate((button) => {
      const svg = button.querySelector("svg")!;
      const node = svg.querySelector<SVGGeometryElement>(
        '[data-motion-part="travel-arrow"]',
      )!;
      const read = (time: number) => {
        for (const animation of svg.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = time;
        }
        return new DOMMatrix(getComputedStyle(node).transform).f;
      };
      const forward = [read(96), read(294), read(300), read(600)];
      button.dispatchEvent(
        new PointerEvent("pointerout", {
          bubbles: true,
          pointerType: "mouse",
          relatedTarget: document.body,
        }),
      );
      return {
        forward,
        backward: [read(96), read(294), read(300), read(600)],
        clip: getComputedStyle(svg).overflow,
        fixed: [...svg.children]
          .filter((n) => !n.hasAttribute("data-motion-part"))
          .every((n) => getComputedStyle(n).transform === "none"),
      };
    });
    expect(sample.clip).toBe("hidden");
    expect(sample.fixed).toBe(true);
    expect(sample.forward[0]).toBeGreaterThan(1);
    expect(sample.forward[1]).toBeLessThan(-24);
    expect(sample.forward[2]).toBeGreaterThan(24);
    expect(sample.forward[3]).toBeCloseTo(0);
    expect(sample.backward[0]).toBeLessThan(-1);
    expect(sample.backward[1]).toBeGreaterThan(24);
    expect(sample.backward[2]).toBeLessThan(-24);
    expect(sample.backward[3]).toBeCloseTo(0);
    expect(await control.boundingBox()).toEqual(bounds);
  }
});

test("bottom icon geometry shows a solid 3D cube, an orbiting sun, an empty-to-checked task and an S ink stroke", async ({
  page,
}) => {
  await page.goto("/");
  const inspect = async (name: string, time: number) => {
    const control = page.getByRole("button", { name, exact: true });
    await control.hover();
    return control.locator("svg").evaluate((svg, time) => {
      for (const animation of svg.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = time;
      }
      return [...svg.children].map((n) => ({
        part: n.getAttribute("data-motion-part"),
        detail: n.getAttribute("data-icon-detail"),
        transform: getComputedStyle(n).transform,
        opacity: Number(getComputedStyle(n).opacity),
        dash: getComputedStyle(n).strokeDasharray,
      }));
    }, time);
  };
  const cube = await inspect("添加 miniature", 200);
  expect(
    cube.every(
      (p) =>
        p.transform.startsWith("matrix3d(") &&
        p.opacity === 1 &&
        p.dash === "none",
    ),
  ).toBe(true);
  const sun = await inspect("上传图片", 260);
  expect(sun.find((p) => p.part === "sun-orbit")!.opacity).toBeLessThan(0.2);
  expect(
    sun
      .filter((p) => p.part !== "sun-orbit")
      .every((p) => p.transform === "none"),
  ).toBe(true);
  const blank = await inspect("添加任务", 0);
  expect(blank.find((p) => p.part === "todo-check")!.opacity).toBe(0);
  expect(blank.find((p) => p.detail === "todo-square")!.opacity).toBe(1);
  const checked = await page
    .getByRole("button", { name: "添加任务", exact: true })
    .evaluate((button) => {
      const svg = button.querySelector("svg")!;
      for (const animation of svg.getAnimations({ subtree: true }))
        animation.currentTime = 600;
      return {
        tick: getComputedStyle(
          svg.querySelector('[data-motion-part="todo-check"]')!,
        ).opacity,
        square: getComputedStyle(
          svg.querySelector('[data-icon-detail="todo-square"]')!,
        ).opacity,
      };
    });
  expect(checked).toEqual({ tick: "1", square: "0" });
  const pen = await inspect("画笔", 400);
  expect(pen.find((p) => p.detail === "pen-ink")!.opacity).toBe(1);
  expect(
    pen.some((p) => p.part === "pen-sweep" && p.transform !== "none"),
  ).toBe(true);
  const alignment = await page
    .getByRole("button", { name: "画笔", exact: true })
    .evaluate((button) => {
      const ink = button.querySelector<SVGGeometryElement>(
        '[data-icon-detail="pen-ink"]',
      )!;
      const nib = button.querySelector('[data-motion-part="pen-sweep"]')!;
      const matrix = new DOMMatrix(getComputedStyle(nib).transform);
      const start = ink.getPointAtLength(0);
      const tip = ink.getPointAtLength(
        ink.getTotalLength() *
          (1 - parseFloat(getComputedStyle(ink).strokeDashoffset)),
      );
      return Math.hypot(start.x + matrix.e - tip.x, start.y + matrix.f - tip.y);
    });
  expect(alignment).toBeLessThan(0.2);
});

test("subcanvas dividers expand through the top left while the parent arrow wraps horizontally", async ({
  page,
}) => {
  await page.goto("/");
  const create = page.getByRole("button", { name: "创建子画布", exact: true });
  await create.hover();
  const divider = await create.locator("svg").evaluate((svg) => {
    const paths = [...svg.querySelectorAll("path")];
    const sample = (time: number) => {
      for (const animation of svg.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = time;
      }
      return paths.map((n) => ({
        x: new DOMMatrix(getComputedStyle(n).transform).e,
        opacity: getComputedStyle(n).opacity,
      }));
    };
    return {
      out: sample(294),
      incoming: sample(300),
      frame: getComputedStyle(svg.querySelector("rect")!).transform,
    };
  });
  expect(divider.out.every((p) => p.x < -15 && p.opacity === "0")).toBe(true);
  expect(divider.incoming.every((p) => p.x > 12 && p.opacity === "0")).toBe(
    true,
  );
  expect(divider.frame).toBe("none");
  await create.click();
  await page
    .getByRole("button", { name: "进入子画布 子画布", exact: true })
    .click();
  const back = page.getByRole("button", { name: "返回父画布", exact: true });
  await back.hover();
  const travel = await back.locator("svg").evaluate((svg) => {
    const path = svg.querySelector("path")!;
    const sample = (time: number) => {
      for (const animation of svg.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = time;
      }
      return new DOMMatrix(getComputedStyle(path).transform).e;
    };
    const out = [sample(96), sample(294), sample(300), sample(600)];
    svg.closest("button")!.dispatchEvent(
      new PointerEvent("pointerout", {
        bubbles: true,
        pointerType: "mouse",
        relatedTarget: document.body,
      }),
    );
    return { out, back: [sample(96), sample(294), sample(300), sample(600)] };
  });
  expect(travel.out[0]).toBeGreaterThan(1);
  expect(travel.out[1]).toBeLessThan(-24);
  expect(travel.out[2]).toBeGreaterThan(24);
  expect(travel.out[3]).toBeCloseTo(0);
  expect(travel.back[0]).toBeLessThan(-1);
  expect(travel.back[1]).toBeGreaterThan(24);
  expect(travel.back[2]).toBeLessThan(-24);
  expect(travel.back[3]).toBeCloseTo(0);
  await back.click();
  await expect(page.locator(".card-canvas")).toHaveCount(1);
});

test("drawing dock reverses mid-transition, keeps hidden controls unfocusable, and uses the toolbar ink in both themes", async ({
  page,
}) => {
  await page.goto("/");
  const brush = page.getByRole("button", { name: "画笔", exact: true });
  await brush.click();
  await expect(page.locator(".bottom-tools")).toHaveAttribute(
    "data-drawing",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".bottom-tools")).toHaveAttribute(
    "data-drawing",
    "false",
  );
  await expect(page.locator(".paint-controls")).toHaveAttribute("inert", "");
  await brush.click();
  await expect(page.locator(".paint-dock")).toHaveCSS("width", "292px");
  const exit = page.getByRole("button", { name: "退出绘画", exact: true });
  await exit.hover();
  await page.mouse.move(10, 100);
  for (const theme of ["light", "dark"]) {
    await page
      .locator("html")
      .evaluate((n, theme) => n.setAttribute("data-theme", theme), theme);
    const ink = await brush.evaluate((n) => getComputedStyle(n).color);
    await expect(exit).toHaveCSS("color", ink);
    await expect(
      page.getByRole("button", { name: "隐藏绘画", exact: true }),
    ).toHaveCSS("color", ink);
  }
  await exit.click();
  await expect(brush).toBeFocused();
  await expect(
    page.getByRole("button", { name: "添加任务", exact: true }),
  ).toBeVisible();
});

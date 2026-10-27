import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const svg = readFileSync(
  new URL("../public/icon.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({
  headless: true,
  ...(existsSync("/usr/bin/chromium")
    ? { executablePath: "/usr/bin/chromium" }
    : {}),
});
try {
  const page = await browser.newPage();
  for (const [name, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ]) {
    const png = await page.evaluate(
      async ({ svg, size }) => {
        const img = new Image();
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { svg, size },
    );
    writeFileSync(
      new URL("../public/icons/" + name, import.meta.url),
      Buffer.from(png, "base64"),
    );
  }
} finally {
  await browser.close();
}

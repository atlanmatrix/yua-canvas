import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const name = "yua-canvas";
export const inject = ["connection"];
export const ROUTE = "/api/yua-canvas/";

const types = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  wasm: "application/wasm",
  bcmap: "application/octet-stream",
  ttf: "font/ttf",
  pfb: "application/octet-stream",
  icc: "application/octet-stream",
};

// Enumerate trusted build output, registering exact routes rather than resolving
// user-supplied filesystem paths. Connection owns authentication and peer access.
export function apply(ctx) {
  const root = fileURLToPath(new URL("./app/", import.meta.url));
  function visit(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) visit(file, `${relative}/`);
      else if (entry.isFile()) {
        ctx.connection.fetch.register({
          path: ROUTE + relative.split("/").map(encodeURIComponent).join("/"),
          methods: ["GET", "HEAD"],
          requestBody: "buffered",
          async fetch(request) {
            try {
              const bytes = await readFile(file, { signal: request.signal });
              return new Response(request.method === "HEAD" ? null : bytes, {
                headers: {
                  "content-type":
                    types[entry.name.split(".").at(-1)] ||
                    "application/octet-stream",
                  "content-length": String(bytes.length),
                  "cache-control": "no-store",
                  "x-content-type-options": "nosniff",
                  "referrer-policy": "no-referrer",
                  "content-security-policy":
                    "frame-ancestors 'self'; object-src 'none'",
                },
              });
            } catch (error) {
              if (request.signal.aborted) throw error;
              if (error.code === "ENOENT")
                return new Response("Not found", { status: 404 });
              throw error;
            }
          },
        });
      }
    }
  }
  try {
    visit(root);
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(
        "Canvas build is missing. Run npm run build:dsh in yua-canvas before installing.",
        { cause: error },
      );
    throw error;
  }
}

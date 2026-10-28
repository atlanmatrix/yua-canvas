import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

// Keep PDF fonts, CMaps and image decoders local, including offline/Pages builds.
export function pdfAssets(): Plugin {
  const root = dirname(
    createRequire(import.meta.url).resolve("pdfjs-dist/package.json"),
  );
  const files = new Map<string, Buffer>();
  for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"])
    for (const file of readdirSync(resolve(root, directory), {
      withFileTypes: true,
    }))
      if (file.isFile())
        files.set(
          `${directory}/${file.name}`,
          readFileSync(resolve(root, directory, file.name)),
        );
  let base = "/";
  return {
    name: "pdf-assets",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url || "").split("?")[0];
        const prefix = `${base}assets/pdf/`;
        const file = path.startsWith(prefix) ? path.slice(prefix.length) : "";
        const bytes = files.get(file);
        if (!bytes) return next();
        response.setHeader(
          "Content-Type",
          file.endsWith(".wasm")
            ? "application/wasm"
            : /\.m?js$/.test(file)
              ? "text/javascript"
              : "application/octet-stream",
        );
        response.end(bytes);
      });
    },
    generateBundle() {
      for (const [file, source] of files)
        this.emitFile({
          type: "asset",
          fileName: `assets/pdf/${file}`,
          source,
        });
    },
  };
}

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

// Precache only files emitted by this build and public branding assets. Canvas
// contents, OAuth responses and API attachments never enter the worker cache.
export function canvasPwa(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "canvas-pwa",
    apply: "build",
    enforce: "post",
    configResolved(value) {
      config = value;
    },
    generateBundle(_, bundle) {
      const hash = createHash("sha256");
      hash
        .update(config.base)
        .update(readFileSync(resolve(config.root, "index.html")));
      const publicFiles: string[] = [];
      const visit = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = resolve(directory, entry.name);
          if (entry.isDirectory()) visit(path);
          else {
            publicFiles.push(
              relative(config.publicDir, path).replaceAll("\\", "/"),
            );
            hash.update(readFileSync(path));
          }
        }
      };
      visit(config.publicDir);
      for (const item of Object.values(bundle))
        hash.update(item.type === "chunk" ? item.code : item.source);
      const files = [
        ...new Set([
          "index.html",
          ...publicFiles,
          ...Object.keys(bundle).filter((name) => !name.endsWith(".map")),
        ]),
      ].sort();
      const source = `
const VERSION = "__PWA_VERSION__";
const SCOPE = self.registration.scope;
const PREFIX = 'canvas-of-yua:' + SCOPE + ':';
const CACHE = PREFIX + VERSION;
const INDEX = new URL('index.html', SCOPE).href;
const URLS = ${JSON.stringify(files)}.map(path => new URL(path, SCOPE).href);
const STATIC = new Set(URLS);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(URLS.map(url => new Request(url, { cache: 'reload' })));
    } catch (error) { await caches.delete(CACHE); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // An explicit update must not break lazy imports in another open tab.
    const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(client => client.url.startsWith(SCOPE));
    if (!windows.length) {
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url), scope = new URL(SCOPE);
  if (request.method !== 'GET' || url.origin !== scope.origin ||
      !url.href.startsWith(SCOPE) || url.pathname === '/api' || url.pathname.startsWith('/api/') ||
      url.pathname.startsWith(scope.pathname + 'api/') ||
      request.headers.has('Authorization') || request.headers.has('X-Share-Token')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await (await caches.open(CACHE)).match(INDEX);
      return cached || Response.error();
    }));
  } else if (STATIC.has(url.href)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(request)) || fetch(request))());
  } else if (url.pathname.startsWith(scope.pathname + 'assets/')) {
    // Only look up build assets already cached by an earlier worker, never add
    // unknown responses to the cache.
    event.respondWith((async () => {
      for (const name of (await caches.keys()).filter(name => name.startsWith(PREFIX))) {
        const cached = await (await caches.open(name)).match(request);
        if (cached) return cached;
      }
      return fetch(request);
    })());
  }
});
`;
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: source.replace(
          "__PWA_VERSION__",
          hash.update(source).digest("hex").slice(0, 16),
        ),
      });
    },
  };
}

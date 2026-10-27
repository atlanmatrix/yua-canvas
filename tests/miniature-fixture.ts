import type { Page } from "@playwright/test";

export const SCENE = "https://atlanmatrix.github.io/codex-playground/city/";
export async function mockMiniature(
  page: Page,
  { delay = 0, protocol = true } = {},
) {
  await page.route(
    (url) =>
      url.origin === new URL(SCENE).origin &&
      url.pathname === new URL(SCENE).pathname,
    (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><meta charset="utf-8"><body style="background:#b8cbb3"><button id="orbit">旋转场景</button>${
          protocol
            ? `<script>
      const parentOrigin = new URL(location.href).searchParams.get('parentOrigin') || new URL(document.referrer).origin;
      let view = new URL(location.href).searchParams.get('view') || 'initial';
      function urls() { const url = new URL(location.href); for(const key of ['screenshot','preview','parentOrigin']) url.searchParams.delete(key); url.searchParams.set('view', view); return {url:url.href,state:{view}}; }
      window.addEventListener('message', event => {
        if(event.source !== parent || event.origin !== parentOrigin || event.data?.type !== 'little-worlds:capture') return;
        window.lastCapture = event.data;
        setTimeout(() => {
          const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 72;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = view === 'rotated' ? '#73a4d6' : '#b8cbb3'; ctx.fillRect(0,0,96,72);
          parent.postMessage({type:'little-worlds:response', requestId:event.data.requestId,ok:true,result:{...urls(),width:96,height:72,mimeType:'image/webp',dataUrl:canvas.toDataURL('image/webp')}},parentOrigin);
        }, ${delay});
      });
      document.getElementById('orbit').onclick = () => { view='rotated'; document.getElementById('orbit').textContent='场景已旋转'; parent.postMessage({type:'little-worlds:statechange',...urls()},parentOrigin); };
      parent.postMessage({type:'little-worlds:ready',...urls()},parentOrigin);
    </script>`
            : ""
        }</body>`,
      }),
  );
}

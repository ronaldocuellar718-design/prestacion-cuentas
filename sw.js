/* Prestação de Conta · Grupo Piveta — service worker
   Siempre pide primero la versión nueva a GitHub; si no hay internet usa la guardada.
   No toca nada de Google (Drive, inicio de sesión, fuentes): eso pasa directo. */

const CACHE = 'prestacion-cache-v1';
const BASE = ['./', 'index.html', 'manifest.json', 'icono-192.png', 'icono-512.png', 'icono-mascara-512.png'];

/* Misma clave para './', './index.html' y './index.html?lo-que-sea' */
function clave(u) {
  const x = new URL(u, self.registration.scope);
  x.search = ''; x.hash = '';
  if (x.pathname.endsWith('/')) x.pathname += 'index.html';
  return x.href;
}

/* Una respuesta "redirigida" no se puede entregar a una navegación: se copia limpia */
function limpia(r) {
  if (!r.redirected) return Promise.resolve(r);
  return r.blob().then(function (b) {
    return new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const c = await caches.open(CACHE);
    await Promise.all(BASE.map(async function (u) {
      try {
        const r = await fetch(new Request(new URL(u, self.registration.scope), { cache: 'reload' }));
        if (r.ok) await c.put(clave(u), await limpia(r));
      } catch (_) { /* si un archivo falla, el resto igual se guarda */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const ks = await caches.keys();
    await Promise.all(ks
      .filter(function (k) { return k !== CACHE && k.indexOf('prestacion-cache') === 0; })
      .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // Google, fuentes, etc.: directo
  if (url.href.indexOf(self.registration.scope) !== 0) return;     // fuera de esta app
  if (/\/sw\.js$/.test(url.pathname)) return;                      // el propio sw.js lo maneja el navegador

  e.respondWith((async function () {
    const cache = await caches.open(CACHE);
    try {
      let r = await fetch(req, { cache: 'no-cache' });            // red primero, revalidando
      if (r.redirected) r = await limpia(r);
      if (r && r.ok && r.status === 200) {
        try { await cache.put(clave(req.url), r.clone()); } catch (_) {}
      }
      return r;
    } catch (err) {
      const guardada = await cache.match(clave(req.url));
      if (guardada) return guardada;
      if (req.mode === 'navigate') {
        const inicio = await cache.match(clave(self.registration.scope));
        if (inicio) return inicio;
      }
      return Response.error();
    }
  })());
});

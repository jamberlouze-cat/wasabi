// Service worker : rend l'app installable et la fait démarrer hors ligne.
// - Fichiers de l'app : « réseau d'abord » (toujours la dernière version en
//   ligne), avec un délai court : si le réseau ne répond pas, on sert la copie
//   en cache plutôt que de laisser l'écran de chargement tourner.
// - Tout est servi depuis le site lui-même (supabase-js est dans lib/vendor) :
//   aucun CDN à mettre en cache.
// - Les données Supabase ne passent jamais par ici : c'est lib/store.js qui en
//   garde une copie sur l'appareil.
const CACHE = "wasabi-v2";
const NETWORK_TIMEOUT_MS = 3000;
const SHELL = [
  "./",
  "./index.html",
  "./tokens.css",
  "./app.css",
  "./app.js",
  "./lib/config.js",
  "./lib/supabase.js",
  "./lib/store.js",
  "./lib/textes.js",
  "./lib/icons.js",
  "./lib/vendor/supabase-js.js",
  "./manifest.webmanifest",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
  const network = fetch(request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
    }
    return res;
  });
  if (!cached) return network;
  network.catch(() => {});   // pas de rejet non géré si le délai gagne la course
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
  return Promise.race([network.catch(() => cached), timeout]);
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;       // laisser passer Supabase
  if (url.pathname.startsWith("/api/") || url.pathname === "/_ping") return;   // Worker
  e.respondWith(networkFirst(e.request));
});

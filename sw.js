// A+ Study Bench offline support. Bump VERSION when you upload a new index.html.
const VERSION = "aplus-v8";
const PHOTOS = "aplus-photos-v1";   // saved photos are kept across app updates
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== PHOTOS).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

function isPhoto(url){
  return (url.hostname === "commons.wikimedia.org" && url.pathname.startsWith("/wiki/Special:FilePath/")) || url.hostname === "upload.wikimedia.org";
}
// Photos: use the saved copy if there is one; otherwise download it once and save it.
function photo(req){
  return caches.open(PHOTOS).then(c => c.match(req.url).then(hit => {
    if (hit) return hit;
    return fetch(req.url, {mode: "cors", credentials: "omit"})
      .then(r => { if (!r.ok) throw new Error("bad"); c.put(req.url, r.clone()); return r; })
      .catch(() => fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req.url, r.clone()); return r; }));
  }));
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isPhoto(url)) { e.respondWith(photo(req)); return; }
  // The app page: network first so updates arrive, saved copy when offline
  if (req.mode === "navigate" || (url.origin === location.origin && url.pathname.endsWith("index.html"))) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put("./index.html", copy)); return r; }).catch(() => caches.match("./index.html")));
    return;
  }
  // Icons, manifest and fonts: saved copy, refreshed in the background
  if (url.origin === location.origin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; }).catch(() => hit); return hit || net; }));
  }
  // Videos go straight to the internet
});

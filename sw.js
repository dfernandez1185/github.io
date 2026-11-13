// A+ Study Bench service worker: offline app shell, offline photos, update and daily-study notifications.
const VERSION = "aplus-v54";
const APP_VER = "1.25 beta 4";
const SHELL = "aplus-shell-" + VERSION;
const PHOTOS = "aplus-photos-v1";
const META = "aplus-meta";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

async function getMeta(){ try { const c = await caches.open(META); const r = await c.match("./__meta"); return r ? await r.json() : {}; } catch(e) { return {}; } }
async function setMeta(patch){ const m = Object.assign(await getMeta(), patch); const c = await caches.open(META); await c.put("./__meta", new Response(JSON.stringify(m), {headers: {"content-type": "application/json"}})); return m; }
const dayKey = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const T = (m, en, es) => m.lang === "es" ? es : en;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("aplus-shell-") && k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
    // a new version just took over: tell the student (only after the first install, and only if they turned notifications on)
    const m = await getMeta();
    if (m.seen && m.seen !== APP_VER && m.notif && m.upd !== false) {
      await self.registration.showNotification(T(m, "A+ Study Bench updated ✨", "A+ Study Bench se actualizó ✨"),
        {body: T(m, `Version ${APP_VER} is ready. Tap to see what's new.`, `La versión ${APP_VER} está lista. Toca para ver lo nuevo.`), icon: "icon-192.png", badge: "icon-192.png", tag: "aplus-update"});
    }
    await setMeta({seen: APP_VER});
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith("/version.json")) return; // always from the network
    if (req.mode === "navigate") {
      // network first so updates arrive; the cached copy works offline
      e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(SHELL).then(c => c.put("./index.html", cp)); return r; }).catch(() => caches.match("./index.html").then(r => r || caches.match("./"))));
      return;
    }
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { if (n.ok) { const cp = n.clone(); caches.open(SHELL).then(c => c.put(req, cp)); } return n; })));
    return;
  }
  // Wikimedia photos: keep a copy for offline use
  if (/(^|\.)wikimedia\.org$/.test(url.hostname)) {
    e.respondWith(caches.open(PHOTOS).then(c => c.match(req).then(r => r || fetch(req).then(n => { if (n.ok || n.type === "opaque") c.put(req, n.clone()); return n; }))));
  }
});
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "aplus-prefs") setMeta({notif: !!d.notif, upd: d.upd !== false, time: d.time || "17:30", studied: d.studied || "", body: d.body || "", lang: d.lang || "en", appVer: d.ver || ""});
});
async function dailyCheck(){
  // look for a new version (installing it triggers the "updated" notification) and send the study reminder
  try { await self.registration.update(); } catch(e) {}
  const m = await getMeta(); if (!m.notif) return;
  const now = new Date(), k = dayKey(now), [h, mi] = String(m.time || "17:30").split(":").map(Number);
  if (m.lastRemind === k || m.studied === k || now.getHours() * 60 + now.getMinutes() < (h || 0) * 60 + (mi || 0)) return;
  await self.registration.showNotification(T(m, "📚 A+ study time", "📚 Hora de estudiar A+"), {body: m.body || T(m, "Your plan for today is ready.", "Tu plan de hoy está listo."), icon: "icon-192.png", badge: "icon-192.png", tag: "aplus-daily", data: {go: "home"}});
  await setMeta({lastRemind: k});
}
self.addEventListener("periodicsync", e => { if (e.tag === "aplus-daily") e.waitUntil(dailyCheck()); });
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const upd = e.notification.tag === "aplus-update";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    if (all.length) { const c = all[0]; await c.focus(); c.postMessage({type: "aplus-open", go: upd ? "home" : "home"}); return; }
    await self.clients.openWindow(upd ? "./" : "./?open=plan");
  })());
});

const VERSION = '2026.11.14-19';
const CACHE = 'app-' + VERSION;
const KABUK = ['./', './index.html', './yonetim.html', './stil.css', './ortak.js', './kursiyer.js', './yonetim.js', './config.js',
  './logo.png', './qr.png', './baslik.jpg', './icon-192.png', './icon-512.png', './manifest.webmanifest'];

// Anlık bildirimler (Firebase Cloud Messaging) — config.js doluysa etkinleşir
try {
  importScripts('./config.js');
  if (self.BP_AYAR && self.BP_AYAR.firebase && self.BP_AYAR.firebase.apiKey && self.BP_AYAR.vapidKey) {
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
    firebase.initializeApp(self.BP_AYAR.firebase);
    firebase.messaging();
  }
} catch (e) { /* bildirim olmadan devam */ }

self.addEventListener('install', (e) => {
  // Tarayıcının 10 dakikalık ara belleğini atla: her dosya sunucudan taze alınır
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(KABUK.map((u) => new Request(u, { cache: 'no-store' })))).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('app-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  const ayniKaynak = url.origin === self.location.origin;
  const cdn = url.hostname === 'www.gstatic.com' || url.hostname === 'cdn.sheetjs.com' || url.hostname === 'cdnjs.cloudflare.com';
  if (!ayniKaynak && !cdn) return; // Firestore, Drive vb. asla önbelleğe alınmaz

  const sayfa = r.mode === 'navigate' || /\.(html|js|css)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (ayniKaynak && sayfa) {
    // Ağ öncelikli: güncel sürüm; çevrimdışıyken önbellek
    e.respondWith(fetch(r, { cache: 'no-store' }).then((res) => {
      const kopya = res.clone();
      caches.open(CACHE).then((c) => c.put(r, kopya));
      return res;
    }).catch(() => caches.match(r).then((m) => m || caches.match('./index.html'))));
  } else {
    // İkon ve CDN dosyaları: önbellek öncelikli
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => {
      if (res.ok || res.type === 'opaque') { const kopya = res.clone(); caches.open(CACHE).then((c) => c.put(r, kopya)); }
      return res;
    })));
  }
});

// Uygulama açıkken elle gösterilen bildirimlere dokunulunca ilgili sayfayı aç
self.addEventListener('notificationclick', (e) => {
  const link = e.notification.data && e.notification.data.bpLink;
  if (!link) return;
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => 'focus' in x);
    return c ? c.focus().then(() => c.navigate(link)).catch(() => {}) : self.clients.openWindow(link);
  }));
});

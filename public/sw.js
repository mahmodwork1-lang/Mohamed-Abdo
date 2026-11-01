// تطبيق الموبايل: بيجيب من النت الأول دايمًا (عشان التحديثات توصل)، والمخزن للطوارئ بس لما النت يقطع
const CACHE = 'shell-v1';
const SHELL = /\.(html|js|css|png|jpg|webmanifest)$|^\/$|^\/reels$/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // الصوت والفيديو والـ API مابيتخزنوش (حجمهم كبير ومتغيرين)
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/pins/') || u.pathname.startsWith('/photos/') || !SHELL.test(u.pathname)) return;
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request);
      if (r.ok) { const c = await caches.open(CACHE); c.put(e.request, r.clone()); }
      return r;
    } catch (err) {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      throw err;
    }
  })());
});

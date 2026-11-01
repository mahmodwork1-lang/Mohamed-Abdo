// سيرفر موقع محبي الشيخ محمد عبده (موقع غير رسمي)
// تشغيل: node server.js  ثم افتح http://localhost:3100
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const PORT = process.env.PORT || 3100;
const PUBLIC = path.join(__dirname, 'public');
const LIBRARY = path.join(__dirname, 'data', 'library.json');

// قراءة .env لو موجود
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const ALLOWED_HOSTS = ['pexels.com', 'pixabay.com', 'api.alquran.cloud', 'cdn.islamic.network'];
const hostAllowed = (h) => ALLOWED_HOSTS.some((a) => h === a || h.endsWith('.' + a));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

// ---------- مكتبة التسجيلات ----------
const loadLibrary = () => { try { return JSON.parse(fs.readFileSync(LIBRARY, 'utf8')); } catch { return []; } };
const saveLibrary = (items) => fs.writeFileSync(LIBRARY, JSON.stringify(items, null, 2));

// لو فيه باسورد لازم يتبعت، ولو مفيش يبقى الإضافة من نفس الجهاز بس
function isAdmin(req) {
  const pass = process.env.ADMIN_PASSWORD;
  if (pass) {
    const got = Buffer.from(String(req.headers['x-admin'] || ''));
    const want = Buffer.from(pass);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  // من غير باسورد: الإدارة من نفس الجهاز بس. ولو الطلب جاي من بروكسي يبقى زائر من النت مش الجهاز نفسه
  if (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers.forwarded) return false;
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// ---------- حماية لما الموقع يبقى على النت ----------
const clientIp = (req) => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '';
const visitorOf = (req) => {
  const v = String(req.headers['x-visitor'] || '');
  if (!/^[a-z0-9]{16,40}$/.test(v)) throw Object.assign(new Error('حدّث الصفحة وجرّب تاني'), { status: 400 });
  return v;
};
const hits = new Map();
function limit(req, key, max) {
  const k = key + ':' + clientIp(req), now = Date.now(), h = (hits.get(k) || []).filter((t) => now - t < 36e5);
  if (h.length >= max && !isAdmin(req)) throw Object.assign(new Error('استخدمت ده كتير في الساعة دي — جرّب بعد شوية'), { status: 429 });
  h.push(now);
  hits.set(k, h);
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (!h.some((t) => now - t < 36e5)) hits.delete(k); }, 6e5).unref();
const dirBytes = (d) => { try { return fs.readdirSync(d).reduce((a, f) => a + fs.statSync(path.join(d, f)).size, 0); } catch { return 0; } };

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

const TYPES = ['tilawa', 'doaa', 'ibtihal'];
const cleanYear = (y) => { const n = parseInt(y, 10); return n >= 1990 && n <= 2100 ? n : null; };

function cleanItem(b) {
  const url = String(b.url || '').trim();
  let u;
  try { u = new URL(url); } catch { throw bad('اللينك مش صحيح'); }
  if (!/^https?:$/.test(u.protocol)) throw bad('اللينك لازم يبدأ بـ https');
  const title = String(b.title || '').trim().slice(0, 200);
  if (!title) throw bad('اكتب عنوان للتسجيل');
  const surah = b.surah ? Math.min(114, Math.max(1, parseInt(b.surah, 10) || 0)) || null : null;
  return {
    type: TYPES.includes(b.type) ? b.type : 'tilawa',
    title,
    surah,
    surahs: surah ? [surah] : [],
    year: cleanYear(b.year),
    place: String(b.place || '').trim().slice(0, 200),
    note: String(b.note || '').trim().slice(0, 1000),
    url,
  };
}

async function library(req, res, url) {
  const admin = isAdmin(req);
  if (req.method === 'GET') {
    const items = loadLibrary().filter((x) => admin || !x.hidden);
    let playlists = [];
    try { playlists = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'playlists.json'), 'utf8')); } catch {}
    return sendJson(res, 200, { items, playlists, canEdit: admin });
  }
  if (!admin) return sendJson(res, 401, { error: 'الباسورد غلط' });
  const items = loadLibrary();

  // تعديل جماعي: {ids:[...], set:{type?, year?, hidden?}}
  if (url.pathname === '/api/library/bulk' && req.method === 'POST') {
    const b = await readBody(req);
    const ids = new Set(Array.isArray(b.ids) ? b.ids : []);
    const set = {};
    if (TYPES.includes(b.set?.type)) set.type = b.set.type;
    if (typeof b.set?.hidden === 'boolean') set.hidden = b.set.hidden;
    if (b.set && 'year' in b.set) set.year = cleanYear(b.set.year);
    let n = 0;
    for (const it of items) if (ids.has(it.id)) { Object.assign(it, set, { edited: true }); n++; }
    saveLibrary(items);
    return sendJson(res, 200, { updated: n });
  }

  if (req.method === 'POST') {
    const item = { id: crypto.randomUUID(), ...cleanItem(await readBody(req)), added: new Date().toISOString() };
    items.unshift(item);
    saveLibrary(items);
    return sendJson(res, 200, { item });
  }
  const id = url.searchParams.get('id');
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return sendJson(res, 404, { error: 'مش موجود' });
  if (req.method === 'PUT') {
    const body = cleanItem(await readBody(req));
    // الآيات اللي اتعرفت لوحدها تفضل لو السورة ماتغيرتش
    if (items[i].surah === body.surah) { delete body.surahs; }
    items[i] = { ...items[i], ...body, edited: true };
    saveLibrary(items);
    return sendJson(res, 200, { item: items[i] });
  }
  if (req.method === 'DELETE') {
    // فيديوهات يوتيوب بتستخبى بس (عشان التحديث مايرجعهاش)
    if (items[i].source === 'youtube') items[i].hidden = true; else items.splice(i, 1);
    saveLibrary(items);
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 405, { error: 'method' });
}

// ---------- صوت الفيديوهات + فهرسة الآيات ----------
const audio = require('./audio');
const ALIGN_DIR = path.join(__dirname, 'data', 'align');
fs.mkdirSync(ALIGN_DIR, { recursive: true });

// بس الفيديوهات اللي في المكتبة (مانسمحش بتنزيل أي حاجة تانية)
// الأصوات اللي المستخدم رفعها
const OWN = path.join(__dirname, 'data', 'own-audio.json');
const ownList = () => { try { return JSON.parse(fs.readFileSync(OWN, 'utf8')); } catch { return []; } };
async function ownRoute(req, res, url) {
  const me = visitorOf(req);
  if (req.method === 'GET') return sendJson(res, 200, { items: ownList().filter((x) => x.owner === me).map(({ owner, ...r }) => r) });
  if (req.method === 'POST') {
    limit(req, 'own', 15);
    const ext = String(url.searchParams.get('ext') || '').toLowerCase();
    if (!audio.EXTS.includes(ext)) throw bad('نوع الملف ده مش مدعوم — ارفع ملف صوت أو فيديو');
    const id = 'up_' + crypto.randomBytes(9).toString('hex');
    await audio.saveOwn(id, ext, req, 200e6);
    const item = { id, name: String(url.searchParams.get('name') || 'صوت').slice(0, 80), t: Date.now(), owner: me };
    fs.writeFileSync(OWN, JSON.stringify([item, ...ownList()].slice(0, 2000), null, 1));
    const { owner, ...pub } = item;
    return sendJson(res, 200, pub);
  }
  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    if (!ownList().some((x) => x.id === id && x.owner === me)) throw bad('الملف ده مش بتاعك');
    audio.removeOwn(id);
    fs.writeFileSync(OWN, JSON.stringify(ownList().filter((x) => x.id !== id), null, 1));
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'not found' });
}

function libVideo(url) {
  const id = url.searchParams.get('id') || '';
  if (/^up_[a-f0-9]+$/.test(id) && ownList().some((x) => x.id === id)) return id;
  if (!/^[\w-]{11}$/.test(id)) throw bad('id غلط');
  if (!loadLibrary().some((x) => x.ytId === id)) throw bad('الفيديو ده مش في المكتبة');
  return id;
}

async function audioRoute(req, res, url) {
  if (!audio.available()) return sendJson(res, 501, { error: 'برامج الصوت مش موجودة في فولدر bin' });
  const id = libVideo(url);
  if (audio.needsDownload(id)) limit(req, 'yt', 40);
  if (url.pathname === '/api/audio/prepare') return sendJson(res, 200, await audio.prepare(id));
  if (url.pathname === '/api/audio/clip') {
    await audio.prepare(id);
    const start = Math.max(0, +url.searchParams.get('start') || 0);
    const end = Math.max(start + 0.1, +url.searchParams.get('end') || start + 10);
    if (end - start > 900) throw bad('أقصى مدة ١٥ دقيقة');
    return audio.clip(id, start, end, url.searchParams.get('fmt'), res);
  }
  return sendJson(res, 404, { error: 'not found' });
}

// صور الشيخ اللي بتترفع للمونتاج (data/photos)
const PHOTOS = path.join(__dirname, 'data', 'photos');
fs.mkdirSync(PHOTOS, { recursive: true });
const PHOTO_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const photoFile = (name) => {
  const f = path.basename(String(name || ''));
  if (!PHOTO_MIME[path.extname(f).toLowerCase()] || f !== name) throw bad('اسم الصورة غلط');
  return path.join(PHOTOS, f);
};
async function photosRoute(req, res, url) {
  if (url.pathname.startsWith('/photos/')) {
    const file = photoFile(decodeURIComponent(url.pathname.slice('/photos/'.length)));
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': PHOTO_MIME[path.extname(file).toLowerCase()], 'cache-control': 'public, max-age=86400', 'cross-origin-resource-policy': 'same-origin' });
    return fs.createReadStream(file).pipe(res);
  }
  const me = visitorOf(req);
  const owners = () => { try { return JSON.parse(fs.readFileSync(path.join(PHOTOS, 'owners.json'), 'utf8')); } catch { return {}; } };
  if (req.method === 'GET') {
    const own = owners();
    const list = fs.readdirSync(PHOTOS).filter((f) => PHOTO_MIME[path.extname(f).toLowerCase()] && (own[f] === me || (!own[f] && isAdmin(req))))
      .map((f) => ({ name: f, url: '/photos/' + encodeURIComponent(f), t: fs.statSync(path.join(PHOTOS, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    // الصور الأساسية (من قناة الشيخ) ثابتة ومابتتمسحش
    const builtin = fs.readdirSync(path.join(PUBLIC, 'sheikh')).filter((f) => PHOTO_MIME[path.extname(f).toLowerCase()]).sort()
      .map((f) => ({ name: f, url: '/sheikh/' + encodeURIComponent(f), builtin: true }));
    return sendJson(res, 200, { photos: [...list, ...builtin] });
  }
  if (req.method === 'POST') {
    limit(req, 'photo', 40);
    if (dirBytes(PHOTOS) > 5e9) throw Object.assign(new Error('مساحة الصور خلصت — جرّب بعدين'), { status: 507 });
    const ext = '.' + String(url.searchParams.get('ext') || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!PHOTO_MIME[ext]) throw bad('ارفع صورة JPG أو PNG أو WEBP');
    const name = `sheikh-${crypto.randomBytes(8).toString('hex')}${ext}`, file = path.join(PHOTOS, name);
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(file);
      let size = 0;
      req.on('data', (d) => { size += d.length; if (size > 20e6) { req.destroy(); out.destroy(); fs.rmSync(file, { force: true }); reject(bad('الصورة أكبر من ٢٠ ميجا')); } });
      req.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
    fs.writeFileSync(path.join(PHOTOS, 'owners.json'), JSON.stringify({ ...owners(), [name]: me }));
    return sendJson(res, 200, { name, url: '/photos/' + encodeURIComponent(name) });
  }
  if (req.method === 'DELETE') {
    const name = url.searchParams.get('name'), own = owners();
    if (own[name] !== me) throw bad('الصورة دي مش بتاعتك');
    fs.rmSync(photoFile(name), { force: true });
    delete own[name];
    fs.writeFileSync(path.join(PHOTOS, 'owners.json'), JSON.stringify(own));
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'not found' });
}

// نص كل مقطع بعد ما الموديل يسمعه (بيتحفظ عشان الفهرسة تبقى مرة واحدة)
async function alignRoute(req, res, url) {
  const id = libVideo(url);
  const file = path.join(ALIGN_DIR, id + '.json');
  if (req.method === 'PUT') {
    const b = await readBody(req);
    if (!Array.isArray(b.texts)) throw bad('bad body');
    if (b.texts.length > 20000) throw bad('bad body');
    let old = [];
    try { old = JSON.parse(fs.readFileSync(file, 'utf8')).texts || []; } catch {}
    const texts = b.texts.map((t, i) => (old[i] != null && !isAdmin(req) ? old[i] : t == null ? null : String(t).slice(0, 2000))); // null = لسه ماتسمعش
    const data = { model: String(b.model || '').slice(0, 100), texts, done: !!b.done };
    fs.writeFileSync(file, JSON.stringify(data));
    return sendJson(res, 200, { ok: true });
  }
  try { return sendJson(res, 200, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return sendJson(res, 200, { texts: [] }); }
}

// نص المصحف (إملائي من غير تشكيل) عشان نقارن بيه اللي الموديل سمعه
let quranCache = null;
async function quranRoute(res) {
  if (!quranCache) {
    const { loadQuran, norm } = require('./classify');
    await loadQuran(); // بيتأكد إن الملف متحمّل
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'quran-clean.json'), 'utf8'));
    quranCache = JSON.stringify(raw.map((s) => ({
      id: s.id,
      ayahs: s.texts[0].map((a, i) => {
        let t = norm(a);
        if (i === 0 && s.id !== 1 && t.startsWith('بسم الله الرحمن الرحيم ')) t = t.slice('بسم الله الرحمن الرحيم '.length);
        return t;
      }),
    })));
  }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' });
  res.end(quranCache);
}

// قايمة الفيديوهات اللي اتفهرست
function alignedList() {
  try { return fs.readdirSync(ALIGN_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { return []; }
}

// ---------- تحديث من يوتيوب (بيشتغل في الخلفية) ----------
const job = { running: false, log: [], result: null };

function startImport() {
  if (job.running) return;
  Object.assign(job, { running: true, log: [], result: null });
  const log = (m) => { job.log.push(m); if (job.log.length > 30) job.log.shift(); };
  require('./import').importYoutube({ library: loadLibrary(), log })
    .then((r) => {
      // لو اتعدل حاجة في المكتبة أثناء التحديث ناخد التعديلات دي
      const now = new Map(loadLibrary().map((x) => [x.id, x]));
      const items = r.items.map((x) => (now.get(x.id)?.edited ? { ...x, ...now.get(x.id) } : x));
      for (const x of now.values()) if (!items.some((y) => y.id === x.id)) items.unshift(x);
      saveLibrary(items);
      fs.writeFileSync(path.join(__dirname, 'data', 'playlists.json'), JSON.stringify(r.playlists, null, 1));
      job.result = { added: r.added, updated: r.updated };
    })
    .catch((e) => log('⚠️ ' + e.message))
    .finally(() => { job.running = false; });
}

async function importRoute(req, res) {
  if (!isAdmin(req)) return sendJson(res, 401, { error: 'الباسورد غلط' });
  if (req.method === 'POST') startImport();
  return sendJson(res, 200, job);
}

// ---------- proxy للخلفيات (عشان الكانفس يقدر يسجلها) ----------
async function proxy(req, res, target) {
  let u;
  try { u = new URL(target); } catch { return sendJson(res, 400, { error: 'bad url' }); }
  if (u.protocol !== 'https:' || !hostAllowed(u.hostname)) return sendJson(res, 403, { error: 'host not allowed' });
  const headers = { 'user-agent': 'Mozilla/5.0', 'accept-encoding': 'identity' };
  if (req.headers.range) headers.range = req.headers.range;
  const up = await fetch(u, { headers, redirect: 'follow' });
  const out = { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' };
  const fwd = up.headers.get('content-encoding') ? ['content-type'] : ['content-type', 'content-length', 'content-range', 'accept-ranges'];
  for (const h of fwd) { const v = up.headers.get(h); if (v) out[h] = v; }
  res.writeHead(up.status, out);
  if (!up.body) return res.end();
  Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
}

async function pexels(q, type, orientation, key) {
  if (!key) throw new Error('محتاج Pexels API key');
  const base = type === 'videos' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search';
  const r = await fetch(`${base}?query=${encodeURIComponent(q)}&per_page=24&orientation=${orientation}`, { headers: { Authorization: key } });
  if (!r.ok) throw new Error('Pexels: ' + r.status);
  const d = await r.json();
  if (type === 'videos') {
    return (d.videos || []).map((v) => {
      const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width)
        .sort((a, b) => a.width * a.height - b.width * b.height);
      const best = files.find((f) => Math.max(f.width, f.height) >= 1280) || files[files.length - 1];
      return best && { type: 'video', thumb: v.image, src: best.link, duration: v.duration };
    }).filter(Boolean);
  }
  return (d.photos || []).map((p) => ({ type: 'image', thumb: p.src.medium, src: p.src.large2x }));
}

async function pixabay(q, type, orientation, key) {
  if (!key) throw new Error('محتاج Pixabay API key');
  if (type === 'videos') {
    const r = await fetch(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(q)}&per_page=24&safesearch=true`);
    if (!r.ok) throw new Error('Pixabay: ' + r.status);
    const d = await r.json();
    return (d.hits || []).map((h) => {
      const v = h.videos.large?.url ? h.videos.large : h.videos.medium;
      return { type: 'video', thumb: h.videos.tiny?.thumbnail || h.videos.medium?.thumbnail || '', src: v.url, duration: h.duration };
    });
  }
  const o = orientation === 'portrait' ? 'vertical' : orientation === 'landscape' ? 'horizontal' : 'all';
  const r = await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=24&image_type=photo&orientation=${o}&safesearch=true`);
  if (!r.ok) throw new Error('Pixabay: ' + r.status);
  const d = await r.json();
  return (d.hits || []).map((h) => ({ type: 'image', thumb: h.webformatURL, src: h.largeImageURL }));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/library' || url.pathname === '/api/library/bulk') return await library(req, res, url);
    if (url.pathname === '/api/import') return await importRoute(req, res);
    if (url.pathname.startsWith('/api/audio/')) return await audioRoute(req, res, url);
    if (url.pathname === '/api/align') return await alignRoute(req, res, url);
    if (url.pathname === '/api/quran') return await quranRoute(res);
    if (url.pathname === '/api/duas') {
      const duas = require('./duas');
      if (req.method === 'POST') {
        if (!isAdmin(req)) return sendJson(res, 200, { count: 0 });
        const b = await readBody(req);
        return sendJson(res, 200, { count: duas.addCustom(Array.isArray(b.lines) ? b.lines : []) });
      }
      return sendJson(res, 200, await duas.load());
    }
    if (url.pathname === '/api/aligned') {
      let ready = [];
      try { ready = fs.readdirSync(path.join(__dirname, 'data', 'audio')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch {}
      return sendJson(res, 200, { ids: alignedList(), ready });
    }
    if (url.pathname === '/api/proxy') return await proxy(req, res, url.searchParams.get('url'));
    if (url.pathname === '/api/own') return await ownRoute(req, res, url);
    if (url.pathname.startsWith('/pins/')) return require('./pins').serve(decodeURIComponent(url.pathname.slice(6)), req, res);
    if (url.pathname === '/api/pinterest') {
      const pins = require('./pins');
      const me = visitorOf(req);
      if (req.method === 'GET') return sendJson(res, 200, { items: pins.list(me) });
      if (req.method === 'DELETE') { pins.remove(url.searchParams.get('id'), me); return sendJson(res, 200, { ok: true }); }
      if (req.method === 'POST') {
        limit(req, 'pin', 30);
        if (dirBytes(path.join(__dirname, 'data', 'pins')) > 10e9) throw Object.assign(new Error('مساحة الخلفيات خلصت — جرّب بعدين'), { status: 507 });
        return sendJson(res, 200, await pins.add((await readBody(req)).url, me));
      }
    }
    if (url.pathname === '/api/photos' || url.pathname.startsWith('/photos/')) return await photosRoute(req, res, url);
    if (url.pathname === '/api/config') {
      return sendJson(res, 200, { pexels: !!process.env.PEXELS_KEY, pixabay: !!process.env.PIXABAY_KEY });
    }
    if (url.pathname === '/api/media') {
      const q = url.searchParams.get('q') || 'nature';
      const source = url.searchParams.get('source') || 'pexels';
      const type = url.searchParams.get('type') === 'photos' ? 'photos' : 'videos';
      const orientation = url.searchParams.get('orientation') || 'portrait';
      const items = source === 'pixabay'
        ? await pixabay(q, type, orientation, req.headers['x-pixabay-key'] || process.env.PIXABAY_KEY)
        : await pexels(q, type, orientation, req.headers['x-pexels-key'] || process.env.PEXELS_KEY);
      return sendJson(res, 200, { items });
    }

    let p = url.pathname === '/' ? '/index.html' : url.pathname === '/reels' ? '/reels.html' : url.pathname;
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(p)));
    if (!file.startsWith(PUBLIC)) return sendJson(res, 403, { error: 'forbidden' });
    fs.readFile(file, (err, data) => {
      if (err) return sendJson(res, 404, { error: 'not found' });
      const headers = { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': 'no-cache' };
      // صفحة الريلز محتاجة "عزل" عشان موديل التعرّف على التلاوة يشتغل على كل أنوية البروسيسور
      if (/(reels\.html|-worker\.js)$/.test(file)) Object.assign(headers, { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' });
      res.writeHead(200, headers);
      res.end(data);
    });
  } catch (e) {
    if (!res.headersSent) sendJson(res, e.status || (e.message === 'bad json' ? 400 : 500), { error: e.message, code: e.code });
    else res.destroy();
  }
});

// الصوت القديم بيتمسح لما المساحة تكبر
const pruneNow = () => { try { const gone = new Set(audio.prune()); if (gone.size) fs.writeFileSync(OWN, JSON.stringify(ownList().filter((x) => !gone.has(x.id)), null, 1)); } catch (e) { console.error('prune', e.message); } };
pruneNow();
setInterval(pruneNow, 18e5).unref();
if (!process.env.ADMIN_PASSWORD) console.log('ℹ️ مفيش ADMIN_PASSWORD: الإدارة من نفس الجهاز بس. على النت لازم تحطه في .env');
server.listen(PORT, () => console.log(`✅ الموقع شغال: http://localhost:${PORT}`));

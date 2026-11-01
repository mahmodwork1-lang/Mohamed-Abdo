// خلفيات من بنترست: المستخدم بيحط لينك بن واحد، والموقع بيجيب الفيديو أو الصورة ويحفظها على الجهاز
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { ytdlpExtra } = require('./audio');

const DIR = path.join(__dirname, 'data', 'pins');
const INDEX = path.join(DIR, 'index.json');
const YTDLP = path.join(__dirname, 'bin', 'yt-dlp');
fs.mkdirSync(DIR, { recursive: true });

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const all = () => { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return []; } };
// كل زائر بيشوف اللي هو جابه بس
const list = (owner) => all().filter((x) => (x.owners || []).includes(owner)).map(({ owners, ...r }) => r);
const saveList = (a) => fs.writeFileSync(INDEX, JSON.stringify(a, null, 1));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const isPinterest = (h) => /(^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(h);
const pinId = (u) => /\/pin\/(?:[^/]*--)?(\d{6,})/.exec(u)?.[1];

// بنقبل لينكات بنترست بس (وpin.it المختصرة بنفتحها ونتأكد إنها راجعة لبنترست)
async function resolve(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw bad('ده مش لينك'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw bad('ده مش لينك');
  if (u.hostname === 'pin.it') {
    const r = await fetch(u.href, { headers: { 'user-agent': UA } });
    u = new URL(r.url);
  }
  if (!isPinterest(u.hostname)) throw bad('حط لينك من بنترست');
  const id = pinId(u.pathname);
  if (!id) throw bad('ده مش لينك بن — افتح الصورة أو الفيديو في بنترست وانسخ اللينك');
  return { id, url: `https://www.pinterest.com/pin/${id}/` };
}
function ytdlp(args) {
  return new Promise((res, rej) => execFile(YTDLP, args, { maxBuffer: 2e7, timeout: 180000 }, (e, out, err) => (e ? rej(new Error(String(err || e.message))) : res(out))));
}
async function grab(url, file) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !/(^|\.)pinimg\.com$/.test(u.hostname)) throw new Error('bad media host');
  const r = await fetch(u.href, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error('http ' + r.status);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
async function add(raw, owner) {
  const { id, url } = await resolve(raw);
  const items = all(), old = items.find((x) => x.id === id);
  if (old) {
    old.owners = [...new Set([...(old.owners || []), owner])];
    saveList(items);
    const { owners, ...r } = old;
    return r;
  }
  let item = null;
  // فيديو؟
  try {
    const j = JSON.parse(await ytdlp(['-j', '--no-warnings', '--no-playlist', ...ytdlpExtra(), url]));
    const file = `${id}.mp4`;
    await ytdlp(['-q', '--no-warnings', '--no-playlist', ...ytdlpExtra(), '--max-filesize', '200M', '-f', 'V_720P/best[ext=mp4][protocol^=http]/best[ext=mp4]', '--ffmpeg-location', path.join(__dirname, 'bin'), '-o', path.join(DIR, file), url]);
    if (!fs.existsSync(path.join(DIR, file))) throw bad('الفيديو ده كبير أوي');
    let thumb = '';
    try { await grab(j.thumbnail, path.join(DIR, `${id}.jpg`)); thumb = `/pins/${id}.jpg`; } catch {}
    item = { id, type: 'video', src: `/pins/${file}`, thumb, duration: Math.round(j.duration || 0) };
  } catch (e) {
    if (e.status) throw e;
    if (!/No video formats/i.test(e.message)) throw bad('ماقدرتش أجيب البن ده — ممكن يكون خاص أو اتمسح');
    // صورة: من صفحة البن نفسها
    const html = await (await fetch(url, { headers: { 'user-agent': UA } })).text();
    const og = /<meta[^>]*content="(https:\/\/i\.pinimg\.com\/[^"]+)"[^>]*property="og:image"/.exec(html)?.[1] || /<meta[^>]*property="og:image"[^>]*content="(https:\/\/i\.pinimg\.com\/[^"]+)"/.exec(html)?.[1];
    if (!og) throw bad('ماقدرتش أجيب البن ده — ممكن يكون خاص أو اتمسح');
    const ext = (/\.(jpe?g|png|webp)$/i.exec(og)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const file = `${id}.${ext}`;
    // أعلى جودة لو متاحة
    await grab(og.replace(/\/\d+x\//, '/originals/'), path.join(DIR, file)).catch(() => grab(og, path.join(DIR, file)));
    item = { id, type: 'image', src: `/pins/${file}`, thumb: `/pins/${file}`, duration: 0 };
  }
  item.link = url;
  saveList([{ ...item, owners: [owner] }, ...all()]);
  return item;
}
function remove(id, owner) {
  if (!/^\d+$/.test(String(id))) throw bad('id غلط');
  const items = all(), it = items.find((x) => x.id === id);
  if (!it || !(it.owners || []).includes(owner)) return;
  it.owners = it.owners.filter((o) => o !== owner);
  // الملف بيتمسح لما مفيش حد تاني مستخدمه
  if (!it.owners.length) {
    for (const f of fs.readdirSync(DIR)) if (f.startsWith(id + '.') && f !== 'index.json') fs.rmSync(path.join(DIR, f), { force: true });
    return saveList(items.filter((x) => x !== it));
  }
  saveList(items);
}
const MIME = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
function serve(name, req, res) {
  const base = path.basename(name), file = path.join(DIR, base), type = MIME[path.extname(base).toLowerCase()];
  if (base !== name || !type || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(file).size, m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], size - 1) : size - 1;
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': b - a + 1 });
    return fs.createReadStream(file, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size, 'cache-control': 'public, max-age=86400' });
  fs.createReadStream(file).pipe(res);
}
module.exports = { list, add, remove, serve };

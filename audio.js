// صوت فيديوهات الشيخ: تنزيل (yt-dlp) + تقطيع على أماكن النَّفَس + قص أي جزء (ffmpeg)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BIN = path.join(__dirname, 'bin');
const DIR = path.join(__dirname, 'data', 'audio');
const YTDLP = path.join(BIN, 'yt-dlp');
const FFMPEG = path.join(BIN, 'ffmpeg');
fs.mkdirSync(DIR, { recursive: true });

const available = () => fs.existsSync(YTDLP) && fs.existsSync(FFMPEG);
// الملف بيتحفظ بصيغته الأصلية (m4a غالباً) — التحويل لـ mp3 كان بياخد دقايق
const EXTS = ['m4a', 'webm', 'opus', 'mp3', 'wav', 'ogg', 'oga', 'aac', 'flac', 'mp4', 'mov', 'mkv'];
const mediaPath = (id) => EXTS.map((e) => path.join(DIR, `${id}.${e}`)).find((f) => fs.existsSync(f));
const infoPath = (id) => path.join(DIR, id + '.json');

function run(cmd, args, { onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    p.stdout.on('data', (d) => onStdout?.(d));
    p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(err.split('\n').filter(Boolean).slice(-2).join(' ') || 'exit ' + code))));
  });
}

// كوكيز يوتيوب اختيارية (لو يوتيوب حظر السيرفر)، و Node لفك حماية يوتيوب
const ytdlpExtra = () => [...(process.env.YTDLP_COOKIES ? ['--cookies', process.env.YTDLP_COOKIES] : []), '--js-runtimes', 'node'];
// تنزيلين بالكتير في نفس الوقت عشان السيرفر مايقعش
let running = 0;
const waiting = [];
function slot(fn) {
  return new Promise((resolve, reject) => {
    const go = () => { running++; fn().then(resolve, reject).finally(() => { running--; waiting.shift()?.(); }); };
    if (running < 2) go(); else waiting.push(go);
  });
}
// ينضّف الصوت القديم لما المساحة تكبر (الأقدم استخدامًا الأول)، والأصوات المرفوعة بعد ٧ أيام
function prune(maxBytes = (+process.env.AUDIO_MAX_GB || 15) * 1e9) {
  const media = fs.readdirSync(DIR).filter((f) => !f.endsWith('.json')).map((f) => { const p = path.join(DIR, f), s = fs.statSync(p); return { f, p, size: s.size, t: s.mtimeMs }; });
  const expired = [];
  for (const m of media) if (m.f.startsWith('up_') && Date.now() - m.t > 7 * 864e5) { expired.push(m.f.replace(/\.[^.]+$/, '')); removeOwn(expired[expired.length - 1]); m.size = 0; m.gone = true; }
  let total = media.reduce((a, m) => a + m.size, 0);
  for (const m of media.filter((x) => !x.gone).sort((a, b) => a.t - b.t)) {
    if (total <= maxBytes) break;
    if (pending.has(m.f.replace(/\.[^.]+$/, ''))) continue;
    fs.rmSync(m.p, { force: true });
    total -= m.size;
  }
  return expired;
}

// التنزيل مرة واحدة لكل فيديو (ولو اتطلب مرتين في نفس الوقت يستنوا نفس التنزيل)
const pending = new Map();
function download(id) {
  if (mediaPath(id)) return Promise.resolve();
  if (id.startsWith('up_')) return Promise.reject(Object.assign(new Error('الملف ده مش موجود — ارفعه تاني'), { status: 400 }));
  if (!pending.has(id)) {
    const p = slot(() => run(YTDLP, [
      '-q', '--no-warnings', '--no-playlist', ...ytdlpExtra(), '-f', 'bestaudio[ext=m4a]/bestaudio',
      '--ffmpeg-location', BIN, '-o', path.join(DIR, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${id}`,
    ])).catch((e) => {
      console.error('yt-dlp:', id, e.message);
      throw Object.assign(new Error(/Sign in|bot/i.test(e.message) ? 'يوتيوب وقف التنزيل مؤقتًا — جرّب تاني بعد شوية أو ارفع الصوت من عندك' : 'مش قادر أجيب الصوت من يوتيوب دلوقتي — جرّب تاني بعد شوية'), { status: 502 });
    }).finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return pending.get(id);
}

// أماكن النَّفَس: هبوط في صوت القارئ بالنسبة للي حواليه (السكوت المطلق مش موجود غالباً بسبب الصدى والخلفية)
async function analyze(id) {
  const chunks = [];
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', mediaPath(id), '-ac', '1', '-ar', '16000',
    '-af', 'highpass=f=250,lowpass=f=3500', '-f', 'f32le', '-'], { onStdout: (d) => chunks.push(d) });
  const b = Buffer.concat(chunks);
  const x = new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
  const hop = 320, step = 0.02; // 20ms
  const n = Math.floor(x.length / hop);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * hop, e = j + hop; j < e; j++) s += x[j] * x[j];
    db[i] = 10 * Math.log10(s / hop + 1e-10);
  }
  const sm = db.map((_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) if (i + k >= 0 && i + k < n) { s += db[i + k]; c++; } return s / c; });
  // المرجع = أعلى 20% في شباك ٤ ثواني (بنحسبه كل ربع ثانية عشان السرعة)
  const W = 100, refEvery = 12, refs = new Float32Array(Math.ceil(n / refEvery) + 1);
  for (let r = 0; r * refEvery < n; r++) {
    const i = r * refEvery;
    const win = Array.from(sm.subarray(Math.max(0, i - W), Math.min(n, i + W))).sort((a, c) => a - c);
    refs[r] = win[Math.floor(win.length * 0.8)];
  }
  const pauses = [];
  let start = -1, minAt = -1;
  for (let i = 0; i < n; i++) {
    const low = sm[i] < refs[Math.round(i / refEvery)] - 10;
    if (low) { if (start < 0) { start = i; minAt = i; } if (sm[i] < sm[minAt]) minAt = i; }
    else if (start >= 0) { if (i - start >= 8) pauses.push(minAt * step); start = -1; }
  }
  // مقاطع الكلام بين كل نَفَس والتاني (ومانسيبش مقطع أطول من ٢٥ ثانية عشان الموديل)
  const duration = n * step;
  const cuts = [0, ...pauses.filter((t, i, a) => i === 0 || t - a[i - 1] > 1.2), duration];
  const segments = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    let a = cuts[i];
    const b2 = cuts[i + 1];
    if (b2 - a < 0.6) continue;
    while (b2 - a > 25) { segments.push([round(a), round(a + 20)]); a += 20; }
    segments.push([round(a), round(b2)]);
  }
  // كل أماكن النَّفَس (حتى القريبة من بعض) — بنظبط عليها بداية كل شاشة
  return { duration: round(duration), segments, dips: pauses.map(round) };
}
const round = (t) => Math.round(t * 100) / 100;

const needsDownload = (id) => !mediaPath(id);
async function prepare(id) {
  await download(id);
  const mp = mediaPath(id);
  if (mp) { const now = new Date(); fs.utimes(mp, now, now, () => {}); }
  try { const old = JSON.parse(fs.readFileSync(infoPath(id), 'utf8')); if (old.dips) return old; } catch {}
  const info = await analyze(id);
  fs.writeFileSync(infoPath(id), JSON.stringify(info));
  return info;
}

// قص جزء: wav16 للموديل، mp3 جودة عالية للريلز
function clip(id, start, end, fmt, res) {
  const args = ['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-t', String(Math.max(0.1, end - start)), '-i', mediaPath(id)];
  if (fmt === 'wav16') args.push('-ac', '1', '-ar', '16000', '-f', 'wav', '-');
  else args.push('-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3', '-');
  res.writeHead(200, { 'content-type': fmt === 'wav16' ? 'audio/wav' : 'audio/mpeg', 'cache-control': 'public, max-age=86400' });
  const p = spawn(FFMPEG, args);
  p.stdout.pipe(res);
  p.on('error', () => res.destroy());
  res.on('close', () => p.kill('SIGKILL'));
}

// صوت رفعه المستخدم: بيتحفظ مرة واحدة وبيتعامل زي أي تسجيل
function saveOwn(id, ext, req, maxBytes = 200e6) {
  return new Promise((resolve, reject) => {
    const file = path.join(DIR, `${id}.${ext}`), out = fs.createWriteStream(file);
    let size = 0;
    req.on('data', (d) => {
      size += d.length;
      if (size > maxBytes) { req.destroy(); out.destroy(); fs.rmSync(file, { force: true }); reject(Object.assign(new Error(`الملف أكبر من ${Math.round(maxBytes / 1e6)} ميجا`), { status: 400 })); }
    });
    req.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    req.pipe(out);
  });
}
function removeOwn(id) {
  for (const e of [...EXTS, 'json']) fs.rmSync(path.join(DIR, `${id}.${e}`), { force: true });
}

module.exports = { available, prepare, clip, EXTS, saveOwn, removeOwn, prune, needsDownload, ytdlpExtra };

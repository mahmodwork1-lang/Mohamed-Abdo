// Worker: بيلاقي آيات معينة جوه تسجيل للشيخ — موديل بيسمع التلاوة (Tarteel) + مقارنة بالمصحف
// شغال في الخلفية عشان الصفحة ماتهنجش. كل مقطع اتسمع بيتحفظ على السيرفر، فالمرة التانية بتبقى فورية
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';

const MODEL = 'YunusZJ/whisper-base-ar-quran-ONNX';

// نفس التطبيع اللي في السيرفر (classify.js)
const norm = (s) => String(s || '')
  .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ‏‎]/g, '')
  .replace(/[ٱأإآٲٳ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[^ء-ي\s]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- المصحف ----------
let quranP;
function getQuran() {
  quranP = quranP || fetch('/api/quran').then((r) => r.json()).then((list) => {
    const bySurah = new Map();
    for (const s of list) {
      const words = [], ayahStart = [];
      s.ayahs.forEach((a) => { ayahStart.push(words.length); words.push(...a.split(' ').filter(Boolean)); });
      ayahStart.push(words.length);
      // عدد الحروف لحد كل كلمة (الكلمة الطويلة بتاخد وقت أطول في التلاوة)
      const chars = [0];
      words.forEach((w, i) => chars.push(chars[i] + w.length + 1));
      bySurah.set(s.id, { id: s.id, words, ayahStart, chars });
    }
    return bySurah;
  });
  return quranP;
}
// مكان أي كلمة في المصحف كله كرقم واحد (عشان نقارن قبل/بعد)
const POS = 100000;
const gpos = (surah, w) => surah * POS + w;

// ---------- الموديل ----------
let asrP, asrProgress, gpuOk = true;
const asrOpts = () => ({ progress_callback: (p) => { if (p.status === 'progress' && p.total) asrProgress?.(p.loaded / p.total, p.file); } });
// كارت الشاشة بيسمع أسرع مرتين؛ لو مش متاح أو فشل بنرجع للبروسيسور
async function loadAsr() {
  if (gpuOk && self.navigator?.gpu && await navigator.gpu.requestAdapter().catch(() => null)) {
    try {
      return await pipeline('automatic-speech-recognition', MODEL, {
        device: { encoder_model: 'webgpu', decoder_model_merged: 'wasm' },
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
        ...asrOpts(),
      });
    } catch (e) { console.warn('WebGPU مش شغال:', e); gpuOk = false; }
  }
  return pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8', device: 'wasm', ...asrOpts() });
}
function getAsr(onProgress) {
  if (onProgress) asrProgress = onProgress;
  asrP = asrP || loadAsr();
  return asrP;
}

async function transcribe(id, seg, onProgress) {
  const asr = await getAsr(onProgress);
  const r = await fetch(`/api/audio/clip?id=${id}&start=${seg[0]}&end=${seg[1]}&fmt=wav16`);
  if (!r.ok) throw new Error('مش قادر أجيب الصوت');
  const pcm = wavToFloat(await r.arrayBuffer());
  try {
    return cleanAsr((await asr(pcm)).text || '');
  } catch (e) {
    if (!gpuOk) throw e;
    // كارت الشاشة وقع في النص: نكمّل على البروسيسور
    console.warn('WebGPU وقع:', e);
    gpuOk = false; asrP = null;
    return cleanAsr((await (await getAsr())(pcm)).text || '');
  }
}

// الموديلات أحياناً بتألّف كلام لما مفيش صوت واضح (موسيقى/سكوت): "you"، "شكرا"، "اشتركوا في القناة"، أو تكرار
function cleanAsr(text) {
  const t = text.trim();
  if (!t || /[a-z]/i.test(t) || /اشتركوا|ترجمة|موسيقى|^شكرا/.test(t)) return '';
  const w = t.split(/\s+/);
  if (w.length > 6 && new Set(w).size / w.length < 0.35) return '';
  return t;
}

// WAV (PCM 16-bit mono من ffmpeg) → أرقام (الـ Worker مافيهوش AudioContext)
function wavToFloat(buf) {
  const v = new DataView(buf);
  let p = 12;
  while (p + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
    let size = v.getUint32(p + 4, true);
    if (id === 'data') {
      if (size === 0xffffffff || p + 8 + size > v.byteLength) size = v.byteLength - p - 8; // ffmpeg وهو بيكتب على stdout
      const n = Math.floor(size / 2), out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = v.getInt16(p + 8 + i * 2, true) / 32768;
      return out;
    }
    p += 8 + size + (size % 2);
  }
  throw new Error('ملف صوت غلط');
}

// ---------- المقارنة ----------
function sim(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb || Math.abs(la - lb) > Math.max(la, lb) / 2) return 0;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    for (let j = 1; j <= lb; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[lb] / Math.max(la, lb);
}

// محاذاة محلية (Smith-Waterman) على مستوى الكلمات: فين الكلام ده في السورة؟
function alignIn(words, sw) {
  const m = words.length, n = sw.length;
  let prevH = new Float32Array(n + 1), prevS = new Int32Array(n + 1);
  let best = 0, bestEnd = -1, bestStart = -1;
  const cache = new Map();
  const score = (w, x) => {
    const k = w + '|' + x;
    let s = cache.get(k);
    if (s === undefined) { const v = sim(w, x); s = v >= 0.8 ? 2 : v >= 0.6 ? 1 : -1; cache.set(k, s); }
    return s;
  };
  for (let i = 1; i <= m; i++) {
    const H = new Float32Array(n + 1), S = new Int32Array(n + 1);
    for (let j = 1; j <= n; j++) {
      const d = prevH[j - 1] + score(words[i - 1], sw[j - 1]);
      const up = prevH[j] - 1, left = H[j - 1] - 1;
      let h = 0, st = j - 1;
      if (d > h) { h = d; st = prevH[j - 1] > 0 ? prevS[j - 1] : j - 1; }
      if (up > h) { h = up; st = prevS[j]; }
      if (left > h) { h = left; st = S[j - 1]; }
      H[j] = h; S[j] = st;
      if (h > best) { best = h; bestEnd = j - 1; bestStart = st; }
    }
    prevH = H; prevS = S;
  }
  return { score: best, ws: bestStart, we: bestEnd };
}

function locateText(text, surahs, quran) {
  const words = norm(text).split(' ').filter(Boolean);
  if (words.length < 2) return null;
  let best = null;
  for (const id of surahs) {
    const s = quran.get(id);
    const r = alignIn(words, s.words);
    if (r.score > (best?.score || 0)) best = { ...r, surah: id };
  }
  // لازم نص الكلام تقريباً يكون مطابق
  if (!best || best.score < Math.max(3, words.length * 0.9)) return null;
  return { surah: best.surah, startPos: gpos(best.surah, best.ws), endPos: gpos(best.surah, best.we) };
}

// ---------- الدوّارة ----------
// item: فيديو من المكتبة. target: {surah, from, to}. hooks.status(msg, pct)
async function locate(item, target, hooks = {}) {
  const status = hooks.status || (() => {});
  const id = item.ytId;
  status('بجيب صوت التسجيل...', 3);
  const pr = await fetch('/api/audio/prepare?id=' + id);
  const info = await pr.json();
  if (!pr.ok) throw new Error(info.error || 'مش قادر أجيب الصوت');
  const segs = info.segments;
  const quran = await getQuran();
  const T = quran.get(target.surah);
  const targetStart = gpos(target.surah, T.ayahStart[target.from - 1]);
  const targetEnd = gpos(target.surah, T.ayahStart[target.to] - 1);

  // السور اللي ممكن تكون في التسجيل
  const known = [...(item.surahs || []), ...(hooks.range || [])].filter((x) => quran.has(x));
  let candidates;
  if (known.length) {
    const lo = Math.min(target.surah, ...known), hi = Math.max(target.surah, ...known);
    candidates = [...quran.keys()].filter((x) => x >= lo && x <= hi);
  } else candidates = [...quran.keys()];

  // اللي اتسمع قبل كده
  const saved = await (await fetch('/api/align?id=' + id)).json();
  const texts = saved.model === MODEL ? saved.texts : [];
  let dirty = 0, heard = 0;
  const save = (done = false) => fetch('/api/align?id=' + id, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, texts, done }),
  }).catch(() => {});

  const matches = new Map();
  async function matchSeg(i) {
    if (matches.has(i)) return matches.get(i);
    if (texts[i] == null) {
      texts[i] = await transcribe(id, segs[i], (p) => status(`بحمّل موديل التعرّف على التلاوة (مرة واحدة بس)... ${Math.round(p * 100)}%`, p * 30));
      heard++;
      if (++dirty >= 3) { dirty = 0; save(); }
    }
    const m = texts[i] ? locateText(texts[i], candidates, quran) : null;
    matches.set(i, m);
    return m;
  }
  const where = (m) => { const s = Math.floor(m.startPos / POS); return `سورة ${s} آية ${ayahOf(quran.get(s), m.startPos % POS)}`; };

  // ١. بحث ثنائي: نقرّب لحد أول مقطع فيه الآيات المطلوبة
  let lo = 0, hi = segs.length - 1, steps = 0;
  while (hi - lo > 2 && steps < 30) {
    steps++;
    const mid = (lo + hi) >> 1;
    let found = null;
    for (const k of [mid, mid + 1, mid - 1, mid + 2, mid - 2, mid + 3]) {
      if (k < lo || k > hi) continue;
      const m = await matchSeg(k);
      if (m) { found = { k, m }; break; }
    }
    status(`بدوّر على مكان الآيات... ${found ? '(سمعت ' + where(found.m) + ')' : ''}`, 30 + steps * 2);
    if (!found) break;
    if (found.m.endPos < targetStart) lo = found.k + 1; else hi = found.k;
  }

  // ٢. نسمع من هناك لحد ما نعدّي آخر آية
  // مقطع قصير (كلمة أو اتنين زي "الرَّحْمَٰنُ") مايتعرفش لوحده — بنقارنه باللي المفروض ييجي بعد المقطع اللي قبله
  const byContext = (text, lastEnd) => {
    const words = norm(text).split(' ').filter(Boolean);
    if (!words.length || words.length > 3 || lastEnd == null) return null;
    const sNow = Math.floor(lastEnd / POS);
    const starts = [lastEnd + 1, lastEnd + 2, gpos(sNow + 1, 0)];
    for (const p of starts) {
      const S = quran.get(Math.floor(p / POS));
      const w = p % POS;
      if (!S || w + words.length > S.words.length) continue;
      if (words.every((x, k) => sim(x, S.words[w + k]) >= 0.75)) return { surah: S.id, startPos: p, endPos: p + words.length - 1 };
    }
    return null;
  };

  const covering = [];
  let started = false, misses = 0, lastEnd = null;
  for (let i = Math.max(0, lo - 3); i < segs.length; i++) {
    let m = await matchSeg(i);
    if (!m && texts[i]) m = byContext(texts[i], lastEnd);
    if (m) lastEnd = m.endPos;
    status(`بسمع الآيات... (${covering.length} مقطع لحد دلوقتي)`, 55 + Math.min(40, covering.length * 4));
    if (!m) { if (started && ++misses > 6) break; continue; }
    misses = 0;
    if (m.startPos > targetEnd + 1) break;
    if (m.endPos >= targetStart && m.startPos <= targetEnd) { covering.push({ i, t0: segs[i][0], t1: segs[i][1], ...m }); started = true; }
    if (covering.length > 120) break;
  }
  if (heard) save(true);
  if (!covering.length) throw new Error('ملقتش الآيات دي في التسجيل ده — جرب تسجيل تاني');

  // نقرّب الوقت لأقرب نَفَس للشيخ (لو قريب)
  const dips = info.dips || [];
  const snap = (t, win = 1.2) => {
    let best = t, d = win;
    for (const x of dips) if (Math.abs(x - t) < d) { d = Math.abs(x - t); best = x; }
    return best;
  };
  const timeAt = (c, p) => snap(timeIn(c, p, quran));
  const first = covering[0], last = covering[covering.length - 1];
  const start = targetStart <= first.startPos + 1 ? Math.max(0, first.t0 - 0.1) : timeAt(first, targetStart);
  const end = last.endPos <= targetEnd + 1 ? last.t1 : timeAt(last, targetEnd + 1);
  return { id, start, end, covering, quran: T, all: quran, snap, missingStart: first.startPos > targetStart + 3, missingEnd: last.endPos < targetEnd - 3 };
}

// وقت كلمة جوه مقطع: بالنسبة لعدد الحروف (ولو المقطع بين سورتين بعدد الكلمات)
function timeIn(c, p, quran) {
  const sA = Math.floor(c.startPos / POS), sB = Math.floor(c.endPos / POS), sP = Math.floor(p / POS);
  let f;
  if (sA === sB && sP === sA) {
    const ch = quran.get(sA).chars;
    const a = ch[c.startPos % POS], b = ch[(c.endPos % POS) + 1], x = ch[p % POS];
    f = (x - a) / Math.max(1, b - a);
  } else f = (p - c.startPos) / (c.endPos - c.startPos + 1);
  return c.t0 + Math.max(0, Math.min(1, f)) * (c.t1 - c.t0);
}

function ayahOf(s, w) { let a = 0; while (a + 1 < s.ayahStart.length && s.ayahStart[a + 1] <= w) a++; return a + 1; }

// وقت بداية كل شاشة: ayah + frac = مكان أول كلمة في الشاشة جوه الآية
function screenTimes(screens, r) {
  const T = r.quran;
  let ptr = 0;
  const out = screens.map((sc) => {
    if (!sc.ayah) return null;
    const a0 = T.ayahStart[sc.ayah - 1], len = T.ayahStart[sc.ayah] - a0;
    const p = gpos(T.id, a0 + Math.floor((sc.frac || 0) * len));
    for (let k = ptr; k < r.covering.length; k++) {
      const c = r.covering[k];
      if (c.startPos <= p && p <= c.endPos) {
        ptr = k;
        // لو الشاشة بتبدأ مع أول المقطع خد بداية المقطع بالظبط، غير كده قدّر وقرّب لأقرب نَفَس
        const t = p <= c.startPos + 1 ? c.t0 : r.snap(timeIn(c, p, r.all), 1.5);
        return t - r.start;
      }
    }
    return null;
  });
  // اللي ماتعرفش وقته ناخده من اللي جنبه
  for (let i = 0; i < out.length; i++) {
    if (out[i] != null) continue;
    const prev = i ? out[i - 1] : 0;
    let j = i + 1; while (j < out.length && out[j] == null) j++;
    const next = j < out.length ? out[j] : r.end - r.start;
    out[i] = prev + (next - prev) / (j - i + 1);
  }
  out[0] = 0;
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + 0.3);
  return out;
}

// ---------- تصحيح كلام الدعاء على نصوص موثّقة ----------
// كل نص بيتقسم لكلمات (بالتشكيل للعرض + من غير تشكيل للمقارنة)
let duasP;
function getDuas() {
  duasP = duasP || fetch('/api/duas').then((r) => r.json()).then((list) => {
    const docs = [], index = new Map();
    for (const e of list) {
      const toks = String(e.text).replace(/[()﴿﴾*«»"]/g, ' ').split(/\s+/).filter(Boolean);
      const words = [], shown = [];
      for (const t of toks) { const n = norm(t); if (n) { words.push(n); shown.push(t); } }
      if (words.length < 2) continue;
      const d = docs.length;
      docs.push({ words, shown, src: e.src });
      for (const w of new Set(words)) { if (!index.has(w)) index.set(w, []); index.get(w).push(d); }
    }
    return { docs, index };
  });
  return duasP;
}

// ثلاثيات الحروف (من غير مسافات) — عشان نلاقي المرشحين حتى لو الموديل قسّم الكلمات غلط
const grams = (str) => { const g = new Set(); for (let i = 0; i + 3 <= str.length; i++) g.add(str.slice(i, i + 3)); return g; };

// محاذاة على مستوى الحروف: السطر كله لازم يتطابق مع حتة متصلة من النص الموثّق
function fitChars(L, D) {
  const m = L.length, n = D.length;
  let prev = new Float32Array(n + 1), prevM = new Int32Array(n + 1), prevS = new Int32Array(n + 1);
  for (let j = 0; j <= n; j++) prevS[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Float32Array(n + 1), curM = new Int32Array(n + 1), curS = new Int32Array(n + 1);
    cur[0] = -i; curS[0] = 0;
    for (let j = 1; j <= n; j++) {
      const eq = L[i - 1] === D[j - 1];
      const d = prev[j - 1] + (eq ? 2 : -1), up = prev[j] - 1, left = cur[j - 1] - 1;
      if (d >= up && d >= left) { cur[j] = d; curM[j] = prevM[j - 1] + (eq ? 1 : 0); curS[j] = prevS[j - 1]; }
      else if (up >= left) { cur[j] = up; curM[j] = prevM[j]; curS[j] = prevS[j]; }
      else { cur[j] = left; curM[j] = curM[j - 1]; curS[j] = curS[j - 1]; }
    }
    prev = cur; prevM = curM; prevS = curS;
  }
  let bj = 1;
  for (let j = 1; j <= n; j++) if (prev[j] > prev[bj]) bj = j;
  return { score: prev[bj], matched: prevM[bj], from: prevS[bj], to: bj - 1 };
}

let duaGrams;
async function correctLine(line) {
  const { docs } = await getDuas();
  if (!duaGrams) {
    duaGrams = new Map();
    docs.forEach((d, k) => {
      d.joined = d.words.join('');
      d.wordOf = [];
      d.words.forEach((w, wi) => { for (let c = 0; c < w.length; c++) d.wordOf.push(wi); });
      for (const g of grams(d.joined)) { if (!duaGrams.has(g)) duaGrams.set(g, []); duaGrams.get(g).push(k); }
    });
  }
  const L = norm(line).replace(/\s+/g, '');
  if (L.length < 6) return { text: line, ok: false };
  const votes = new Map();
  for (const g of grams(L)) for (const k of duaGrams.get(g) || []) votes.set(k, (votes.get(k) || 0) + 1);
  const top = [...votes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k]) => k);
  let best = null;
  for (const k of top) {
    const r = fitChars(L, docs[k].joined);
    if (!best || r.score > best.score) best = { ...r, k };
  }
  if (!best) return { text: line, ok: false };
  const doc = docs[best.k];
  // نوسّع لحد أول وآخر كلمة كاملة
  const w0 = doc.wordOf[best.from], w1 = doc.wordOf[best.to];
  const spanChars = doc.words.slice(w0, w1 + 1).join('').length;
  const identity = best.matched / L.length;
  // نقبل بس لو الحروف متطابقة بنسبة عالية وطول الجملة قريب
  const ok = identity >= 0.8 && spanChars >= L.length * 0.8 && spanChars <= L.length * 1.25;
  if (!ok) return { text: line, ok: false };
  return { text: doc.shown.slice(w0, w1 + 1).join(' ').replace(/[،,.؛:]+$/, ''), ok: true, src: doc.src };
}

// الصفحة بتبعت: {item, target, range, screens} — وبنرد بالتقدم وبعدين النتيجة
self.onmessage = async ({ data }) => {
  const status = (msg, pct) => self.postMessage({ type: 'status', msg, pct });
  // تجهيز الموديل أول ما الصفحة تفتح عشان أول فيديو مايستناش
  if (data.type === 'warm') { getAsr().catch((e) => { console.warn(e); asrP = null; }); return; }
  try {
    // الأدعية: نكتب كلام كل مقطع (مالهاش نص ثابت نقارن بيه)
    if (data.type === 'transcribe') {
      const texts = [];
      for (const [k, seg] of data.segs.entries()) {
        status(`بكتب كلام الدعاء... ${k + 1}/${data.segs.length}`, (k / data.segs.length) * 100);
        texts.push((await transcribe(data.id, seg, (p) => status(`بحمّل موديل التعرّف على الصوت (مرة واحدة بس)... ${Math.round(p * 100)}%`, p * 100))).trim());
      }
      self.postMessage({ type: 'done', texts });
      return;
    }
    if (data.type === 'correct') {
      status('بصحّح الكلام على نصوص الأدعية الموثّقة...', 90);
      const out = [];
      for (const l of data.lines) out.push(await correctLine(l));
      self.postMessage({ type: 'done', lines: out });
      return;
    }
    const r = await locate(data.item, data.target, { status, range: data.range });
    const times = screenTimes(data.screens, r);
    self.postMessage({ type: 'done', start: r.start, end: r.end, times, missingStart: r.missingStart, missingEnd: r.missingEnd });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message || String(e) });
  }
};

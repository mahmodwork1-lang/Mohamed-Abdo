// صانع الريلز: تختار الآيات ← الموقع يلاقيها في تلاوة الشيخ ويظبط الصوت والشاشات ← خلفية ← محرر ← تحميل
// كل الأوقات بالثانية "جوه ملف الصوت" (state.buf)، والفيديو بيبدأ من audioIn ويخلص عند audioOut
const proxied = (url) => '/api/proxy?url=' + encodeURIComponent(url);
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const WAQF = /^[ۖ-ۜ۞۩]+$/; // علامات الوقف بتيجي ككلمة لوحدها
const TAFSIR_NAMES = { 'ar.muyassar': 'التفسير الميسر', 'ar.jalalayn': 'تفسير الجلالين' };
const BG_CHIPS = [['سماء', 'sky clouds'], ['بحر', 'sea waves'], ['جبال', 'mountains'], ['مسجد', 'mosque'], ['ليل ونجوم', 'night stars'], ['مطر', 'rain'], ['طبيعة', 'forest'], ['غروب', 'sunset']];
const BLACK = (() => { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 8, 8); return c.toDataURL('image/png'); })();
const PAD = 3; // ثواني زيادة قبل وبعد الصوت (عشان تقدر تمدّ في المحرر)

const state = {
  surahs: [],
  buf: null,
  audioIn: 0, audioOut: 0,
  segs: [],        // شاشات الآيات/الدعاء: {text, sub, label, group, ayah, frac, start, end, flag}
  texts: [],       // نصوص إضافية: {text, x, y, size, font, color, box, start, end}
  bgs: [],         // خلفيات ورا بعض بسرعتها العادية: {type, src, thumb, local, el, len, trimIn}
  subName: '', surahTitle: '',
  playing: null, tafsir: 'ar.muyassar', chosen: null, busy: false,
  fx: FX.load(),   // تأثيرات المونتاج
};

const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let actx;
const audioCtx = () => (actx = actx || new AudioContext());
const D = () => (state.buf ? Math.max(0.1, state.audioOut - state.audioIn) : 0);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const mode = () => $('mode').querySelector('.on').dataset.m;
// الصوت اللي المستخدم رفعه: {item, kind: 'ayat'|'free'}
const own = { item: null, kind: 'ayat', list: [] };
const textMode = () => (mode() === 'own' ? own.kind : mode());

function setStatus(msg, pct) {
  $('status').textContent = msg;
  if (pct != null) $('bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
}
function progress(msg, pct) {
  $('progress').hidden = false;
  $('pmsg').textContent = msg;
  if (pct != null) $('pbar').style.width = Math.max(0, Math.min(100, pct)) + '%';
}
function refreshButtons() {
  const ready = state.buf && state.segs.length;
  $('renderBtn').disabled = !ready || !!state.playing;
  $('makeBtn').disabled = state.busy;
  window.Editor?.refresh();
}

// ---------- التعرّف على التلاوة (Worker) ----------
let worker;
function askWorker(msg) {
  worker = worker || new Worker('tilawa-worker.js', { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'status') progress(data.msg, data.pct);
      else if (data.type === 'done') resolve(data);
      else if (data.type === 'error') reject(new Error(data.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'حصلت مشكلة في التعرّف على الصوت'));
    worker.postMessage(msg);
  });
}

// ---------- التفسير على قد الكلام اللي في الشاشة ----------
// التفسير الميسر بيشرح الآية بالترتيب، فبنقسمه جمل ونوزّع كل جملة على الشاشة اللي كلامها فيها
const normW = (s) => String(s || '').replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
  .replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^ء-ي\s]/g, ' ').split(/\s+/).filter(Boolean);
const stem = (w) => w.replace(/^(و|ف)?(ب|ل|ك)?(ال)?/, '').replace(/(ون|ين|ات|ها|هم|هن|كم|نا|ه|ي)$/, '');
// جذر تقريبي: الكلمة من غير "ال" والزوائد وحروف العلة (العلي ↔ العلي، العظيم ↔ العظمة)
const root = (w) => { const s = stem(w.replace(/^(و|ف)?(ب|ل|ك)?(ال)?/, '')) || w; return s[0] + s.slice(1).replace(/[اويى]/g, ''); };
const related = (a, b) => {
  const x = root(a), y = root(b);
  if (x.length < 2 || y.length < 2) return false;
  return Math.min(x.length, y.length) >= 3 ? x.slice(0, 3) === y.slice(0, 3) : x === y;
};

function splitTafsir(chunks, tafsir) {
  const clauses = String(tafsir || '').split(/(?<=[،؛.:!؟])\s+|\s+-\s+/).map((c) => c.trim()).filter((c) => c.length > 1);
  if (!clauses.length) return chunks.map(() => '');
  const cw = chunks.map((c) => normW(c));
  // تطابق كل جملة مع كل شاشة (عدد الكلمات المشتركة)
  const score = clauses.map((cl) => { const w = normW(cl); return cw.map((ch) => ch.filter((x) => w.some((y) => related(x, y))).length); });
  // توزيع متسلسل (الجمل بالترتيب) بأعلى تطابق — Dynamic programming
  const n = clauses.length, k = chunks.length;
  const best = Array.from({ length: n + 1 }, () => new Array(k).fill(-1e9)), from = Array.from({ length: n + 1 }, () => new Array(k).fill(0));
  for (let j = 0; j < k; j++) best[0][j] = 0;
  for (let i = 1; i <= n; i++) for (let j = 0; j < k; j++) {
    let b = -1e9, bf = 0;
    for (let p = 0; p <= j; p++) if (best[i - 1][p] > b) { b = best[i - 1][p]; bf = p; }
    best[i][j] = b + score[i - 1][j]; from[i][j] = bf;
  }
  let j = best[n].indexOf(Math.max(...best[n]));
  const owner = new Array(n);
  for (let i = n; i >= 1; i--) { owner[i - 1] = j; j = from[i][j]; }
  // الجمل اللي بعد آخر جملة ليها علاقة (زي "وفي الآية ترغيب...") بنشيلها — دي اللي كانت بتطوّل
  let last = -1;
  clauses.forEach((_, i) => { if (Math.max(...score[i]) > 0) last = i; });
  const out = chunks.map(() => []);
  clauses.forEach((cl, i) => { if (i <= Math.max(last, 0)) out[owner[i]].push(cl); });
  return out.map((parts, i) => {
    let t = parts.join(' ').replace(/[،؛:\s]+$/, '');
    const words = t.split(/\s+/);
    if (words.length > 40) t = words.slice(0, 40).join(' ') + ' …';
    return t;
  });
}

// ---------- الكلام ----------
async function buildText() {
  const maxWords = Math.max(2, +$('maxWords').value || 12);
  const segs = [];
  if (textMode() === 'ayat') {
    const s = state.surahs.find((x) => x.id === +$('surah').value);
    const from = Math.min(s.ayahs, Math.max(1, +$('fromAyah').value || 1));
    const to = Math.min(s.ayahs, Math.max(from, +$('toAyah').value || from));
    $('fromAyah').value = from; $('toAyah').value = to;
    if (to - from > 40) throw new Error('اختار ٤٠ آية بالكتير في الفيديو الواحد');
    progress('بجيب الآيات والتفسير...', 2);
    const editions = ['quran-uthmani', state.tafsir].filter(Boolean).join(',');
    const r = await fetch(`https://api.alquran.cloud/v1/surah/${s.id}/editions/${editions}?offset=${from - 1}&limit=${to - from + 1}`);
    if (!r.ok) throw new Error('مش قادر أوصل لموقع القرآن — اتأكد من النت');
    const d = (await r.json()).data;
    const ayahs = d[0].ayahs, tf = d[1]?.ayahs || [];
    const short = $('shortTafsir').checked;
    ayahs.forEach((a, i) => {
      let words = a.text.split(/\s+/).filter(Boolean);
      if (a.numberInSurah === 1 && s.id !== 1 && words[0]?.startsWith('بِسْمِ') && words.length > 4) words = words.slice(4);
      const chunks = chunkWords(words, maxWords);
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const subs = short ? splitTafsir(chunks.map((c) => c.join(' ')), tf[i]?.text) : chunks.map(() => tf[i]?.text || '');
      let off = 0;
      chunks.forEach((chunk, k) => {
        segs.push({ text: chunk.join(' '), sub: subs[k], label: null, group: i, ayah: a.numberInSurah, frac: off / total });
        off += chunk.length;
      });
      segs[segs.length - 1].label = a.numberInSurah;
    });
    state.subName = TAFSIR_NAMES[state.tafsir] || '';
    state.surahTitle = 'سورة ' + s.name;
  } else {
    const lines = $('freeText').value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error('اكتب كلام الدعاء الأول');
    lines.forEach((l, i) => {
      const [text, ...rest] = l.replace(/^⚠️\s*/, '').split('|');
      segs.push({ text: text.trim(), sub: rest.join('|').trim(), label: null, group: i });
    });
    state.subName = '';
    state.surahTitle = 'دعاء';
  }
  state.segs = segs;
}

function chunkWords(raw, maxWords) {
  const words = [];
  for (const w of raw) {
    if (WAQF.test(w) && words.length) words[words.length - 1] += ' ' + w; else words.push(w);
  }
  if (words.length <= maxWords) return [words];
  const out = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(w);
    const left = words.length - i - 1;
    const waqf = /[ۖ-ۜ]/.test(w);
    if (cur.length >= maxWords || (waqf && cur.length >= Math.min(4, maxWords) && left >= 2)) { out.push(cur); cur = []; }
  });
  if (cur.length) { if (cur.length <= 2 && out.length) out[out.length - 1].push(...cur); else out.push(cur); }
  return out;
}

// ---------- تسجيلات الشيخ ----------
const lib = { items: [], aligned: new Set(), ready: new Set() };
const durOf = (x) => (x.length || '').split(':').reduce((a, v) => a * 60 + (+v || 0), 0);
const JUZ = [[/جزء عم|JUZ AMMA/i, 78, 114], [/جزء تبارك|JUZ TABARAK/i, 67, 77], [/جزء قد سمع|QAD SAMI/i, 58, 66]];
function surahRange(x) {
  const s = x.surahs || [];
  for (const [re, a, b] of JUZ) if (re.test(x.title)) return [a, b];
  if (s.length >= 2 && /(^|\s)(من|ما تيسر من)\s.*\s(ال[يى]|إلى)\s/.test(x.title)) return [Math.min(...s), Math.max(...s)];
  return null;
}
const hasSurah = (x, surah) => (x.surahs || []).includes(surah) || ((r) => r && surah >= r[0] && surah <= r[1])(surahRange(x));

function candidates() {
  if (mode() === 'own') { if (own.item) own.item.surahs = [+$('surah').value]; return own.item ? [own.item] : []; }
  const surah = +$('surah').value, from = +$('fromAyah').value, to = +$('toAyah').value;
  const list = lib.items.filter((x) => x.type === 'tilawa' && hasSurah(x, surah)
    && (!x.ayahs || (x.surahs || []).length > 1 || (x.ayahs[0] <= to && x.ayahs[1] >= from) || /كامل/.test(x.title)));
  // الأول: تسجيل معروف إن الآيات جواه، وبعدين اللي اتسمع قبل كده (بيخلص في ثواني)، وبعدين السورة كاملة، واللي صوته متحمّل، والأقصر
  const rank = (x) => (x.ayahs && x.ayahs[0] <= from && x.ayahs[1] >= to ? -1e7 : 0)
    + (lib.aligned.has(x.ytId) ? -3e6 : 0)
    + (/كامل/.test(x.title) && (x.surahs || []).length === 1 ? -1e6 : 0)
    + (lib.ready.has(x.ytId) ? -2e4 : 0) + durOf(x);
  return list.sort((a, b) => rank(a) - rank(b));
}

function renderList(box, list, onPick, current) {
  box.innerHTML = '';
  for (const x of list.slice(0, 30)) {
    const b = document.createElement('button');
    b.className = 'match' + (x === current ? ' on' : '');
    b.innerHTML = `<img loading="lazy" src="https://i.ytimg.com/vi/${esc(x.ytId)}/mqdefault.jpg" alt="">
      <span><b>${esc(x.title)}</b><small>${x.year ? arDigits(x.year) + ' · ' : ''}${esc(x.length || '')}</small></span>
      <span class="ok">${lib.aligned.has(x.ytId) ? '⚡' : ''}</span>`;
    b.onclick = () => onPick(x);
    box.append(b);
  }
}

function showRecInfo(item, count) {
  $('recInfo').hidden = false;
  $('recInfo').innerHTML = `🎙 من تسجيل: <b>${esc(item.title)}</b>${item.year ? ' (' + arDigits(item.year) + ')' : ''}
    ${count > 1 ? `<button class="link" id="changeRec">تسجيل تاني؟ (${arDigits(count - 1)})</button>` : ''}`;
  $('changeRec')?.addEventListener('click', () => {
    const box = $('matches');
    box.hidden = !box.hidden;
    if (!box.hidden) renderList(box, candidates(), (x) => { state.chosen = x; box.hidden = true; make(); }, item);
  });
}

// ---------- الزرار الكبير ----------
async function make() {
  if (state.busy) return;
  stop();
  state.busy = true;
  refreshButtons();
  $('download').innerHTML = '';
  audioCtx().resume();
  try {
    if (mode() === 'own' && !own.item) throw new Error('ارفع الصوت الأول');
    if (textMode() === 'ayat') await makeAyat(); else await makeDoaa();
    state.texts = state.texts.filter((t) => t.start < state.audioOut);
    await loadFonts();
    Editor.open();
    drawIdle();
    document.querySelector('.preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.error(e);
    progress('⚠️ ' + e.message, 0);
  } finally {
    state.busy = false;
    refreshButtons();
  }
}

// بيجيب الصوت بهامش قبل وبعد (عشان المحرر يقدر يمدّ)
async function loadAudio(ytId, a, b) {
  const from = Math.max(0, a - PAD);
  const res = await fetch(`/api/audio/clip?id=${ytId}&start=${from.toFixed(2)}&end=${(b + PAD).toFixed(2)}`);
  if (!res.ok) throw new Error('مش قادر أجيب الصوت');
  state.buf = await audioCtx().decodeAudioData(await res.arrayBuffer());
  return from;
}

async function makeAyat() {
  const list = candidates();
  if (!list.length) throw new Error('ملقتش تسجيل للشيخ فيه السورة دي — جرب سورة تانية');
  await buildText();
  const target = { surah: +$('surah').value, from: +$('fromAyah').value, to: +$('toAyah').value };
  // لو التسجيل مفيهوش الآيات نجرب اللي بعده لوحدنا
  const order = state.chosen && list.includes(state.chosen) ? [state.chosen, ...list.filter((x) => x !== state.chosen)] : list;
  let item, r;
  for (const [k, cand] of order.slice(0, 5).entries()) {
    item = cand;
    showRecInfo(item, list.length);
    if (k) progress(`التسجيل اللي قبله مفيهوش الآيات — بجرب "${item.title.slice(0, 50)}"...`, 5);
    try {
      r = await askWorker({
        item: { ytId: item.ytId, surahs: item.surahs }, target, range: surahRange(item),
        screens: state.segs.map((s) => ({ ayah: s.ayah, frac: s.frac })),
      });
      break;
    } catch (e) {
      if (!/ملقتش/.test(e.message) || k === Math.min(4, order.length - 1)) throw e;
    }
  }
  if (r.end - r.start > 900) throw new Error('الآيات دي طويلة أوي (أكتر من ١٥ دقيقة) — اختار آيات أقل');
  progress('بجهز الصوت...', 97);
  const off = await loadAudio(item.ytId, r.start, r.end);
  state.audioIn = Math.max(0, r.start - off - 0.15);
  state.audioOut = Math.min(state.buf.duration, r.end - off + 0.35);
  // r.times محسوبة من r.start
  state.segs.forEach((s, i) => { s.start = i === 0 ? state.audioIn : r.start - off + r.times[i]; });
  closeSegs();
  lib.aligned.add(item.ytId);
  lib.ready.add(item.ytId);
  const warn = r.missingStart || r.missingEnd ? ' — ⚠️ التسجيل ده مش فيه كل الآيات، جرب "تسجيل تاني"' : '';
  progress(`✅ جاهز (${fmt(D())}) — شوفه تحت وعدّل اللي محتاجه${warn}`, 100);
  setStatus('✅ جاهز — دوس ▶ في المحرر', 100);
}

// نهاية كل شاشة = بداية اللي بعدها
function closeSegs() {
  state.segs.forEach((s, i) => { s.end = i + 1 < state.segs.length ? state.segs[i + 1].start : state.audioOut; });
  for (const s of state.segs) if (s.end - s.start < 0.2) s.end = s.start + 0.2;
}

// ---------- الأدعية ----------
function showDoaa() {
  if (mode() === 'own') return;
  const q = $('doaaSearch').value.trim();
  const list = lib.items.filter((x) => x.type === 'doaa' && (!q || x.title.includes(q)));
  renderList($('doaaList'), list, showPieces, pick.item);
  if (!list.length) $('doaaList').innerHTML = '<p class="hint">مفيش نتايج</p>';
}

const pick = { item: null, segs: [], a: -1, b: -1, audio: new Audio(), heard: null };
async function showPieces(item) {
  Object.assign(pick, { item, a: -1, b: -1, heard: null });
  showDoaa();
  const box = $('pieces');
  box.hidden = false;
  box.innerHTML = '<p class="hint">⏳ بجيب صوت الدعاء...</p>';
  const r = await fetch('/api/audio/prepare?id=' + item.ytId);
  const info = await r.json();
  if (!r.ok) { box.innerHTML = `<p class="hint">⚠️ ${esc(info.error)}</p>`; return; }
  pick.segs = info.segments;
  renderPieces();
}

function renderPieces() {
  const box = $('pieces');
  const ft = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  box.innerHTML = '<p class="hint">اسمع المقاطع ▶ ودوس "من" على أول مقطع و"إلى" على آخر مقطع:</p>';
  pick.segs.forEach(([t0, t1], i) => {
    const row = document.createElement('div');
    row.className = 'piece' + (pick.a >= 0 && i >= pick.a && i <= pick.b ? ' in' : '');
    row.innerHTML = `<button data-a="play">▶</button><span>${ft(t0)} – ${ft(t1)}</span>
      <button data-a="from" class="${pick.a === i ? 'on' : ''}">من</button><button data-a="to" class="${pick.b === i ? 'on' : ''}">إلى</button>`;
    row.querySelector('[data-a=play]').onclick = () => { pick.audio.src = `/api/audio/clip?id=${pick.item.ytId}&start=${t0}&end=${t1}`; pick.audio.play(); };
    row.querySelector('[data-a=from]').onclick = () => { pick.a = i; if (pick.b < i) pick.b = i; piecesChanged(); };
    row.querySelector('[data-a=to]').onclick = () => { pick.b = i; if (pick.a < 0 || pick.a > i) pick.a = i; piecesChanged(); };
    box.append(row);
  });
}

function piecesChanged() {
  renderPieces();
  $('freeTextRow').hidden = false;
  $('freeText').value = '';
  pick.heard = null;
  $('freeText').placeholder = 'هيتكتب لوحده لما تدوس "اعمل الفيديو" — أو اكتبه بإيدك';
}

async function makeDoaa() {
  if (!pick.item || pick.a < 0) throw new Error('اختار الدعاء وحدد المقاطع ("من" و"إلى") الأول');
  const parts = pick.segs.slice(pick.a, pick.b + 1);
  if (!$('freeText').value.trim()) {
    // نكتب الكلام من الصوت، وبعدين نصحّحه على نصوص الأدعية الموثّقة
    const { texts } = await askWorker({ type: 'transcribe', id: pick.item.ytId, segs: parts });
    const { lines } = await askWorker({ type: 'correct', lines: texts.map((t) => t || '…') });
    pick.heard = lines.map((l) => l.text);
    $('freeText').value = lines.map((l) => (l.ok ? '' : '⚠️ ') + l.text).join('\n');
    const bad = lines.filter((l) => !l.ok).length;
    $('doaaCheck').hidden = false;
    $('doaaCheck').textContent = bad
      ? `✅ ${arDigits(lines.length - bad)} سطر اتصحح على نصوص موثّقة — ⚠️ ${arDigits(bad)} سطر مش موجود في المراجع، راجعه بنفسك (عليه علامة ⚠️)`
      : '✅ كل السطور اتصححت على نصوص موثّقة';
  } else if (pick.heard) {
    // اللي صححته بإيدك بيتحفظ، والمرة الجاية يتكتب صح لوحده
    const fixed = $('freeText').value.split('\n').map((l) => l.replace(/^⚠️\s*/, '').trim()).filter((l, i) => l && l !== pick.heard[i]);
    if (fixed.length) fetch('/api/duas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: fixed }) }).catch(() => {});
  }
  await buildText();
  const t0 = parts[0][0], t1 = parts[parts.length - 1][1];
  progress('بجهز الصوت...', 95);
  const off = await loadAudio(pick.item.ytId, t0, t1);
  state.audioIn = t0 - off;
  state.audioOut = t1 - off;
  if (state.segs.length === parts.length) state.segs.forEach((s, i) => { s.start = parts[i][0] - off; });
  else {
    const w = state.segs.map((s) => s.text.length + 10), total = w.reduce((a, b) => a + b, 0);
    let acc = 0;
    state.segs.forEach((s, i) => { s.start = state.audioIn + (acc / total) * D(); acc += w[i]; });
  }
  closeSegs();
  progress(`✅ جاهز (${fmt(D())}) — شوفه تحت وعدّل اللي محتاجه`, 100);
  setStatus('✅ جاهز — دوس ▶ في المحرر', 100);
}

// ---------- الخلفيات (ورا بعض بسرعتها العادية) ----------
function prepareBg(bg) {
  if (bg.el) return Promise.resolve();
  return new Promise((resolve) => {
    if (bg.type === 'video') {
      const v = document.createElement('video');
      if (!bg.local) v.crossOrigin = 'anonymous';
      v.muted = true; v.loop = false; v.playsInline = true; v.preload = 'auto';
      v.src = bg.src;
      v.onloadedmetadata = () => { if (!bg.len) bg.len = Math.max(1, v.duration || 8); };
      v.oncanplay = () => { bg.el = v; v.oncanplay = null; if (!bg.len) bg.len = Math.max(1, v.duration || 8); resolve(); };
      v.onerror = () => resolve();
      v.load();
    } else {
      const img = new Image();
      if (!bg.local) img.crossOrigin = 'anonymous';
      img.onload = () => { bg.el = img; if (!bg.len) bg.len = 6; resolve(); };
      img.onerror = () => resolve();
      img.src = bg.src;
    }
  });
}

// الخلفية اللي شغالة في لحظة t (ولو الفيديوهات خلصت قبل الآخر بتعيد من الأول)
function bgAt(t) {
  const bgs = state.bgs.filter((b) => b.el && b.len > 0);
  const total = bgs.reduce((a, b) => a + b.len, 0);
  if (!total) return null;
  let tt = t % total, at = 0;
  const f = state.fx, d = f.transDur;
  for (const [i, b] of bgs.entries()) {
    if (tt < at + b.len) {
      const e = tt - at;
      const cur = { bg: b, local: (b.trimIn || 0) + e, p: e / b.len };
      if (bgs.length > 1 && (i > 0 || t >= total)) {
        const pv = bgs[(i - 1 + bgs.length) % bgs.length];
        // الخلفية اللي فاتت بتكمّل مشي تحت اللي داخلة لحد ما تختفي
        if (['fade', 'slide', 'zoom'].includes(f.transition) && e < d) Object.assign(cur, { prev: { bg: pv, local: (pv.trimIn || 0) + pv.len + e, p: 1 + e / pv.len }, mix: e / d });
      }
      if ((f.transition === 'black' || f.transition === 'white') && bgs.length > 1) {
        const near = Math.min(i > 0 || t >= total ? e : Infinity, b.len - e);
        if (near < d / 2) { cur.dip = 1 - near / (d / 2); cur.dipColor = f.transition === 'white' ? '255,255,255' : '0,0,0'; }
      }
      return cur;
    }
    at += b.len;
  }
  return null;
}

function drawCover(el, scale = 1, g = ctx, W = canvas.width, H = canvas.height) {
  const sw = el.videoWidth || el.naturalWidth || el.displayWidth, sh = el.videoHeight || el.naturalHeight || el.displayHeight;
  if (!sw || !sh) return false;
  const s = Math.max(W / sw, H / sh) * scale;
  g.drawImage(el, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
  return true;
}

function drawDefaultBg(t) {
  const W = canvas.width, H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b2a22'); g.addColorStop(1, '#040e0b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W / 2 + Math.sin(t / 3) * W * 0.2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.6);
  r.addColorStop(0, 'rgba(212,175,55,0.2)'); r.addColorStop(1, 'rgba(212,175,55,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
}

let mediaSource = 'pixabay';
const mediaCache = new Map();
async function fetchMedia(q, orientation) {
  const key = q + '|' + orientation;
  if (!mediaCache.has(key)) {
    mediaCache.set(key, (async () => {
      const r = await fetch('/api/media?' + new URLSearchParams({ q, source: mediaSource, type: 'videos', orientation }));
      const d = await r.json();
      if (!r.ok) { mediaCache.delete(key); throw new Error(d.error); }
      return d.items;
    })());
  }
  return mediaCache.get(key);
}
function bgThumb(item) {
  const el = document.createElement('div');
  const src = item.black ? BLACK : item.pin ? item.src : proxied(item.src);
  el.className = 'thumb' + (item.black ? ' black' : '') + (state.bgs.some((b) => b.src === src) ? ' on' : '');
  el.innerHTML = item.black ? '<span class="black-label">⬛ شاشة سودا</span>'
    : `<img loading="lazy" src="${esc(item.thumb)}" alt=""><span class="tag">${item.pin ? '📌 ' : ''}${item.duration ? item.duration + 's' : '🖼'}</span>${item.pin ? '<button type="button" class="thumb-x" aria-label="امسحها">✕</button>' : ''}`;
  el.onclick = (e) => {
    if (e.target.closest('.thumb-x')) { removePin(item); return; }
    toggleBg(item, src, el);
  };
  return el;
}
function toggleBg(item, src, el) {
  const i = state.bgs.findIndex((b) => b.src === src);
  Editor.commit();
  if (i >= 0) state.bgs.splice(i, 1);
  else if (item.black) state.bgs.push({ type: 'image', src, thumb: BLACK, local: true, len: 0, trimIn: 0 });
  else state.bgs.push({ type: item.type, src, thumb: item.thumb, local: !!item.pin, len: item.duration || 0, trimIn: 0 });
  el.classList.toggle('on', i < 0);
  bgChanged();
}
// ---------- بنترست ----------
const PIN_IDEAS = [['سحاب وسما', 'clouds sky aesthetic video vertical'], ['بحر', 'ocean waves video vertical'], ['طبيعة', 'nature aesthetic video vertical'], ['مساجد', 'mosque aesthetic wallpaper vertical'], ['ليل ونجوم', 'night sky stars video vertical'], ['مطر', 'rain window aesthetic video']];
let pinList = [];
async function loadPins() {
  try { pinList = (await (await vfetch('/api/pinterest')).json()).items || []; } catch { pinList = []; }
  pinList = pinList.map((p) => ({ ...p, pin: true }));
  return pinList;
}
async function removePin(item) {
  if (!confirm('تمسح الخلفية دي من عندك؟')) return;
  const i = state.bgs.findIndex((b) => b.src === item.src);
  if (i >= 0) { Editor.commit(); state.bgs.splice(i, 1); bgChanged(); }
  await vfetch('/api/pinterest?id=' + item.id, { method: 'DELETE' });
  await showPinterest();
}
async function addPins(text, msg) {
  const links = String(text).match(/https?:\/\/\S+/g) || [];
  if (!links.length) { msg.textContent = '⚠️ حط لينك من بنترست'; return; }
  for (const [k, link] of links.entries()) {
    msg.textContent = `⏳ بجيب من بنترست${links.length > 1 ? ` (${arDigits(k + 1)}/${arDigits(links.length)})` : ''}...`;
    try {
      const r = await vfetch('/api/pinterest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: link }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      // لينك حطيته عشان تستخدمه، فبيتختار على طول
      if (!state.bgs.some((b) => b.src === d.src)) {
        Editor.commit();
        state.bgs.push({ type: d.type, src: d.src, thumb: d.thumb, local: true, len: d.duration || 0, trimIn: 0 });
        bgChanged();
      }
    } catch (e) {
      msg.textContent = '⚠️ ' + e.message;
      await showPinterest(msg.textContent);
      return;
    }
  }
  await showPinterest('✅ اتضافت واتختارت خلفية للفيديو');
}
async function showPinterest(note) {
  const box = $('results');
  const panel = document.createElement('div');
  panel.className = 'pin-box';
  panel.innerHTML = `<p class="pin-steps"><b>١.</b> افتح بنترست ودوّر: ${PIN_IDEAS.map(([n, q]) => `<a href="https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}" target="_blank" rel="noopener">${n} ↗</a>`).join(' ')}</p>
    <p class="pin-steps"><b>٢.</b> افتح الصورة أو الفيديو اللي عجبك، وانسخ لينكه من فوق، وحطه هنا:</p>
    <div class="pin-add"><input type="url" dir="ltr" placeholder="https://www.pinterest.com/pin/..." aria-label="لينك بنترست"><button type="button" class="btn gold">➕ ضيف</button></div>
    <p class="hint pin-msg">${esc(note || '')}</p>
    <p class="hint">ملحوظة: الصور والفيديوهات على بنترست ليها أصحاب، فاستخدم اللي مسموح بيه.</p>`;
  const inp = panel.querySelector('input'), msg = panel.querySelector('.pin-msg');
  panel.querySelector('button').onclick = () => addPins(inp.value, msg);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addPins(inp.value, msg); });
  // اللصق بيضيف على طول
  inp.addEventListener('paste', () => setTimeout(() => addPins(inp.value, msg), 0));
  box.replaceChildren(panel);
  for (const p of await loadPins()) box.append(bgThumb(p));
}
async function searchMedia(q) {
  for (const b of $('chips').querySelectorAll('[data-q]')) b.classList.toggle('on', b.dataset.q === q);
  const box = $('results');
  const blackItem = { black: true };
  const token = (searchMedia.t = (searchMedia.t || 0) + 1);
  box.classList.toggle('has-panel', q === '__pin');
  if (q === '__pin') { showPinterest(); return; }
  if (q === '__black') { box.replaceChildren(bgThumb(blackItem)); return; }
  const orientation = canvas.width > canvas.height ? 'landscape' : canvas.width < canvas.height ? 'portrait' : 'square';
  box.innerHTML = '<p class="hint">⏳ بجيب خلفيات...</p>';
  try {
    let items;
    if (q === '__all') {
      // الكل: اللي جبته من بنترست الأول، وبعدين من كل التصنيفات بالتبادل، ومن غير تكرار
      const [pins, ...lists] = await Promise.all([loadPins(), ...BG_CHIPS.map(([, x]) => fetchMedia(x, orientation).catch(() => []))]);
      const seen = new Set();
      items = [...pins];
      for (let i = 0; i < 12; i++) for (const l of lists) if (l[i] && !seen.has(l[i].src)) { seen.add(l[i].src); items.push(l[i]); }
    } else items = (await fetchMedia(q, orientation)).slice(0, 24);
    if (token !== searchMedia.t) return;
    box.replaceChildren(...(q === '__all' ? [bgThumb(blackItem)] : []), ...items.map(bgThumb));
    if (!items.length && q !== '__all') box.innerHTML = '<p class="hint">مفيش نتايج</p>';
  } catch {
    if (token === searchMedia.t) box.replaceChildren(bgThumb(blackItem), Object.assign(document.createElement('p'), { className: 'hint', textContent: 'مفيش خلفيات جاهزة دلوقتي — جرّب بنترست أو ارفع من جهازك 📁' }));
  }
}
// بتتحمّل أول مرة تفتح قسم الخلفية بس (الصفحة تفتح أسرع)
let bgLoaded = false;
function ensureBgLoaded() {
  if (bgLoaded) return;
  bgLoaded = true;
  searchMedia('__all');
}

function onBgUpload(e) {
  Editor.commit();
  for (const file of e.target.files) {
    const type = file.type.startsWith('video') ? 'video' : 'image';
    const src = URL.createObjectURL(file);
    state.bgs.push({ type, src, thumb: type === 'image' ? src : '', local: true, len: 0, trimIn: 0 });
  }
  e.target.value = '';
  bgChanged();
}

function bgChanged() {
  const n = state.bgs.length;
  $('selInfo').innerHTML = n
    ? `✅ اخترت ${arDigits(n)} خلفية — بتشتغل ورا بعض بسرعتها العادية (تقدر تقصّها وترتبها في المحرر) — <button class="link" id="clearBg">شيلهم</button>`
    : 'دوس على أي خلفية تختارها — لو اخترت أكتر من واحدة هيشتغلوا ورا بعض.';
  $('clearBg')?.addEventListener('click', () => {
    Editor.commit();
    state.bgs = [];
    for (const t of $('results').querySelectorAll('.thumb.on')) t.classList.remove('on');
    bgChanged();
  });
  FX.refreshMenu();
  Promise.all(state.bgs.map(prepareBg)).then(() => { drawIdle(); Editor.refresh(); });
}

// ---------- الرسم ----------
function wrap(text, font, maxW) {
  ctx.font = font;
  const lines = [];
  let line = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(text, family, size, minSize, maxW, maxH, lhK) {
  for (let s = size; ; s = Math.max(minSize, s * 0.92)) {
    const font = `${s}px ${family}`;
    const lines = wrap(text, font, maxW);
    if (lines.length * s * lhK <= maxH || s <= minSize) {
      let out = lines;
      const maxLines = Math.max(1, Math.floor(maxH / (s * lhK)));
      if (out.length > maxLines) { out = out.slice(0, maxLines); out[maxLines - 1] += ' …'; }
      return { font, size: s, lines: out, h: out.length * s * lhK, lh: s * lhK };
    }
  }
}

const fade = (t, a, b) => Math.max(0, Math.min(1, (t - a) / 0.25, (b - t) / 0.2));

// t = الوقت من أول الفيديو. live = بيتشغل دلوقتي (الفيديوهات بتمشي لوحدها)
function drawFrame(t, live = false) {
  const W = canvas.width, H = canvas.height, k = Math.min(W, H) / 1080;
  const portrait = H > W * 1.2;
  const bt = t + state.audioIn;

  // الخلفية
  const cur = bgAt(t);
  let drawn = false;
  if (cur) {
    const layers = cur.prev ? [cur.prev, cur] : [cur];
    for (const b of state.bgs) if (!layers.some((l) => l.bg === b) && b.el && b.type === 'video' && !b.el.paused) b.el.pause();
    for (const { bg, local } of layers) {
      if (bg.type !== 'video' || bg.frame) continue;
      const v = bg.el;
      const want = Math.min(local, (v.duration || local + 1) - 0.05);
      if (live) {
        if (Math.abs(v.currentTime - want) > 0.35) v.currentTime = want;
        if (v.paused && want < v.duration - 0.1) v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - want) > 0.05) {
        v.currentTime = want;
        v.onseeked = () => { v.onseeked = null; if (!state.playing) drawFrame(t); };
      }
    }
    const paint = ({ bg, p }) => FX.drawBg(bg.frame || bg.el, bg.type === 'image' ? 1.02 + p * 0.08 : 1);
    ctx.save();
    FX.camera(t, bt);
    if (cur.prev) {
      paint(cur.prev);
      ctx.save();
      const u = cur.mix, ease = 1 - (1 - u) * (1 - u), tr = state.fx.transition;
      if (tr === 'slide') ctx.translate((1 - ease) * W, 0);
      else {
        ctx.globalAlpha = u;
        if (tr === 'zoom') { const s = 1.3 - 0.3 * ease; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); }
      }
      paint(cur);
      ctx.restore();
      drawn = true;
    } else drawn = paint(cur);
    ctx.restore();
    if (cur.dip) { ctx.fillStyle = `rgba(${cur.dipColor},${cur.dip})`; ctx.fillRect(0, 0, W, H); }
  }
  if (!drawn) drawDefaultBg(t);

  ctx.fillStyle = `rgba(0,0,0,${+$('overlay').value / 100})`;
  ctx.fillRect(0, 0, W, H);
  FX.vignette();
  FX.frame();
  ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 14 * k; ctx.shadowOffsetY = 2 * k;

  const headY = portrait ? H * 0.085 : H * 0.09;
  const title = $('title').value.trim() || state.surahTitle;
  if (title) {
    ctx.fillStyle = $('accent').value;
    ctx.font = `700 ${Math.round(58 * k)}px "${$('titleFont').value}", "Amiri", serif`;
    ctx.fillText(title, W / 2, headY);
  }
  const sub = $('subtitle').value.trim();
  if (sub) {
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.font = `${Math.round(32 * k)}px "Cairo", sans-serif`;
    ctx.fillText(sub, W / 2, headY + 62 * k);
  }
  let footY = H - (portrait ? H * 0.06 : H * 0.05);
  if ($('showDisclaimer').checked) {
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = `${Math.round(22 * k)}px "Cairo", sans-serif`;
    ctx.fillText('صفحة محبين — غير رسمية', W / 2, footY);
    footY -= 40 * k;
  }
  const wm = $('watermark').value.trim();
  if (wm) {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = `600 ${Math.round(28 * k)}px "Cairo", sans-serif`;
    ctx.fillText(wm, W / 2, footY);
  }

  FX.drawLayers(bt, t, false);
  const seg = state.segs.find((s) => s.start <= bt && bt < s.end);
  if (seg) drawSeg(bt, seg, headY + 110 * k, footY - 50 * k);
  drawTexts(bt);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.globalAlpha = 1;
  FX.drawLayers(bt, t, true);
  FX.finish(t);
  FX.mirror();
}

function drawSeg(bt, seg, top, bottom) {
  const W = canvas.width, k = Math.min(W, canvas.height) / 1080;
  const alpha = fade(bt, seg.start, seg.end) || (bt < seg.start + 0.01 ? 1 : 0);
  const avail = bottom - top;
  const fam = `"${$('font').value}", "Amiri", serif`;
  const text = seg.text + (seg.label ? ` ﴿${arDigits(seg.label)}﴾` : '');
  // الكلام في النص أو في عمود جنب صورة الشيخ
  const side = state.fx.textSide, colW = side === 'center' ? W * 0.86 : W * 0.54, cx = side === 'right' ? W * 0.72 : side === 'left' ? W * 0.28 : W / 2;
  const main = fitText(text, fam, +$('fontSize').value * k, 30 * k, colW, avail * (seg.sub ? 0.55 : 0.9), 1.75);
  let subF = null;
  const pad = 26 * k;
  const subFam = `"${$('tafsirFont').value}", "Cairo", sans-serif`;
  const boxW = side === 'center' ? W * 0.8 : W * 0.54;
  if (seg.sub) subF = fitText(seg.sub, subFam, 34 * k, 21 * k, boxW - pad * 2, avail - main.h - 120 * k, 1.6);
  const labelH = subF && state.subName ? 40 * k : 0;
  const boxH = subF ? subF.h + pad * 2 + labelH : 0;
  const gap = subF ? 34 * k : 0;
  const blockH = main.h + gap + boxH;
  const pos = $('textPos').value;
  let y = pos === 'top' ? top + 20 * k : pos === 'bottom' ? bottom - blockH : top + (avail - blockH) / 2;

  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center'; ctx.direction = 'rtl';
  const layer = FX.layerOf({ lines: main.lines, font: main.font, lh: main.lh, color: $('textColor').value });
  FX.drawLayer(layer, cx - W / 2, y, seg.anim || state.fx.anim, bt - seg.start, seg.end - seg.start, bt + FX.clock());
  y += main.lines.length * main.lh;
  if (subF) {
    y += gap;
    const bx = cx - boxW / 2, bw = boxW;
    if ($('tafsirBox').checked) {
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = 'rgba(0,0,0,.42)';
      roundRect(bx, y, bw, boxH, 24 * k); ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,55,.45)'; ctx.lineWidth = 2 * k;
      roundRect(bx, y, bw, boxH, 24 * k); ctx.stroke();
    }
    let yy = y + pad;
    if (labelH) {
      ctx.fillStyle = $('accent').value;
      ctx.font = `700 ${Math.round(24 * k)}px "Cairo", sans-serif`;
      ctx.fillText(state.subName, cx, yy + labelH / 2 - 6 * k);
      yy += labelH;
    }
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = $('tafsirBox').checked ? 0 : 12 * k;
    ctx.font = subF.font;
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    for (const line of subF.lines) { ctx.fillText(line, cx, yy + subF.lh / 2); yy += subF.lh; }
  }
}

// النصوص الإضافية — مكانها (x, y) نسبة من الشاشة، وبتتسحب بالماوس
function drawTexts(bt) {
  const W = canvas.width, H = canvas.height, k = Math.min(W, H) / 1080;
  for (const tx of state.texts) {
    tx.bbox = null;
    if (!(tx.start <= bt && bt < tx.end) || !tx.text.trim()) continue;
    const size = tx.size * k;
    const font = `${tx.bold ? 700 : 400} ${size}px "${tx.font}", "Cairo", sans-serif`;
    const lines = wrap(tx.text, font, W * 0.88);
    const lh = size * 1.45;
    ctx.font = font;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const h = lines.length * lh;
    const cx = tx.x * W, cy = tx.y * H;
    const p = 18 * k;
    tx.bbox = { x: cx - w / 2 - p, y: cy - h / 2 - p, w: w + p * 2, h: h + p * 2 };
    ctx.globalAlpha = fade(bt, tx.start, tx.end);
    if (tx.box) {
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = tx.boxColor || 'rgba(0,0,0,.5)';
      roundRect(tx.bbox.x, tx.bbox.y, tx.bbox.w, tx.bbox.h, 18 * k); ctx.fill();
    }
    ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = tx.box ? 0 : 14 * k; ctx.shadowOffsetY = tx.box ? 0 : 2 * k;
    ctx.fillStyle = tx.color;
    ctx.textAlign = 'center'; ctx.direction = 'rtl';
    if (tx.anim && tx.anim !== 'none') FX.drawLayer(FX.layerOf({ lines, font, lh, color: tx.color }), cx - W / 2, cy - h / 2, tx.anim, bt - tx.start, tx.end - tx.start, bt + FX.clock());
    else lines.forEach((l, i) => ctx.fillText(l, cx, cy - h / 2 + lh * (i + 0.5)));
    if (!state.playing && window.Editor?.isSelected(tx)) {
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.setLineDash([10 * k, 8 * k]); ctx.strokeStyle = '#f0d47a'; ctx.lineWidth = 3 * k;
      ctx.strokeRect(tx.bbox.x, tx.bbox.y, tx.bbox.w, tx.bbox.h);
      ctx.setLineDash([]);
    }
  }
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawIdle(t) {
  if (state.playing) return;
  if (!state.segs.length) {
    drawDefaultBg(0);
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(80 * Math.min(canvas.width, canvas.height) / 1080)}px "Amiri Quran", "Amiri", serif`;
    ctx.fillText(BASMALA, canvas.width / 2, canvas.height / 2);
    return;
  }
  drawFrame(t ?? Editor.time());
}

async function loadFonts() {
  const fams = new Set([$('font').value, $('titleFont').value, $('tafsirFont').value, ...state.texts.map((t) => t.font)]);
  await Promise.all([...fams].map((f) => document.fonts.load(`40px "${f}"`, 'بسم الله')).concat(document.fonts.load('700 40px "Cairo"', 'تفسير'))).catch(() => {});
  FX.clearLayers(); // الطبقات اللي اترسمت قبل ما الخط يحمّل
}

// المعاينة بنص الدقة عشان تبقى ناعمة؛ والملف النهائي بس بالدقة الكاملة
function setRes(full) {
  const [w, h] = $('aspect').value.split('x').map(Number), s = full ? 1 : 0.5;
  if (canvas.width === w * s && canvas.height === h * s) return;
  canvas.width = w * s; canvas.height = h * s;
  FX.clearLayers();
}
function applyAspect() {
  setRes(false);
  mediaCache.clear();
  bgLoaded = false;
  if ($('results').isConnected) ensureBgLoaded();
  drawIdle();
}

// ---------- تشغيل / تسجيل ----------
function pickMime() {
  const opts = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return opts.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

// الصوت بكل تأثيراته — نفس التوصيل للسماعة وللتصدير السريع
function wireAudio(ac, startAt, from, dests) {
  const src = ac.createBufferSource();
  const buf = AFX.source();
  src.buffer = buf;
  const gain = ac.createGain();
  src.connect(gain);
  const out = AFX.chain(ac, gain, buf, state.audioIn, state.audioOut);
  for (const d of dests) out.connect(d);
  if (ac instanceof AudioContext) AFX.attachMeter(ac, out);
  const left = Math.max(0.05, D() - from);
  const rampIn = Math.min(from > 0 ? 0.08 : state.fx.aIn, left / 2), rampOut = Math.min(state.fx.aOut, left / 2);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(1, startAt + rampIn);
  gain.gain.setValueAtTime(1, startAt + Math.max(rampIn, left - rampOut));
  gain.gain.linearRampToValueAtTime(0, startAt + left);
  src.start(startAt, state.audioIn + from, left);
  return src;
}

function startAudio(from, extraDest) {
  const ac = audioCtx();
  const startAt = ac.currentTime + 0.1;
  const src = wireAudio(ac, startAt, from, extraDest ? [ac.destination, extraDest] : [ac.destination]);
  return { src, startAt: startAt - from };
}

// ---------- التصدير السريع ----------
// بيرسم كل فريم بالترتيب ويشفّره بكارت الشاشة: أسرع من مدة الفيديو، ومفيش فريمات بتقع
const FPS = 30;
const nextTick = () => new Promise((r) => { const m = new MessageChannel(); m.port1.onmessage = () => r(); m.port2.postMessage(0); });
async function fastSupport(W, H, sampleRate) {
  if (!window.VideoEncoder || !window.AudioEncoder || !window.Mp4Muxer || !window.MP4Box) return null;
  const base = { codec: 'avc1.640028', width: W, height: H, bitrate: state.fx.quality * 1e6, framerate: FPS };
  const audio = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 192000 };
  if (!(await AudioEncoder.isConfigSupported(audio)).supported) return null;
  const hw = { ...base, hardwareAcceleration: 'prefer-hardware' };
  if ((await VideoEncoder.isConfigSupported(hw)).supported) return { video: hw, audio };
  return (await VideoEncoder.isConfigSupported(base)).supported ? { video: base, audio } : null;
}
// بيرجع true لو خلص (أو اتلغى)، و false لو المتصفح مش بيدعمه فنرجع للتسجيل العادي
async function renderFast() {
  const sr = state.buf.sampleRate;
  const [W, H] = $('aspect').value.split('x').map(Number);
  const cfg = await fastSupport(W, H, sr).catch(() => null);
  if (!cfg) return false;
  stop();
  setRes(true);
  const token = { fast: true };
  state.playing = token;
  refreshButtons();
  $('download').innerHTML = '';
  const t0 = performance.now();
  let ve, ae, failed = null;
  const readers = new Map();
  const cleanup = () => { for (const [b, r] of readers) { r.close(); delete b.frame; } setRes(false); };
  try {
    await Promise.all(state.bgs.map(prepareBg));
    await loadFonts();
    for (const b of state.bgs) if (b.el && b.type === 'video') b.el.pause();
    // فيديوهات الخلفية بتتفك بالترتيب؛ لو نوع الفيديو مش مدعوم هنرجع للتسجيل العادي
    setStatus('🎥 بجهز الخلفيات...', 0);
    for (const b of state.bgs) if (b.el && b.type === 'video' && !readers.has(b)) { const r = new FrameReader(b.src); readers.set(b, r); await r.open(); }
    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({
      target, fastStart: 'in-memory', firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: W, height: H }, audio: { codec: 'aac', numberOfChannels: 2, sampleRate: sr },
    });
    const onErr = (e) => { failed = e; };
    ve = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: onErr });
    ve.configure(cfg.video);
    ae = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: onErr });
    ae.configure(cfg.audio);

    // الصوت الأول (ثواني)
    setStatus('🎥 بجهز الصوت...', 1);
    await AFX.prepare();
    const total = D();
    const oac = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
    wireAudio(oac, 0, 0, [oac.destination]);
    const mixed = await oac.startRendering();
    const L = mixed.getChannelData(0), Rr = mixed.getChannelData(1), STEP = 4096;
    for (let off = 0; off < L.length && !failed; off += STEP) {
      const n = Math.min(STEP, L.length - off), data = new Float32Array(n * 2);
      data.set(L.subarray(off, off + n), 0);
      data.set(Rr.subarray(off, off + n), n);
      const au = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off / sr) * 1e6), data });
      ae.encode(au);
      au.close();
      if (ae.encodeQueueSize > 32) await nextTick();
    }
    await ae.flush();

    // الفريمات
    const N = Math.max(1, Math.round(total * FPS));
    for (let i = 0; i < N; i++) {
      if (state.playing !== token) { ve.close(); ae.close(); cleanup(); setStatus('اتلغى', 0); drawIdle(); return true; }
      if (failed) throw failed;
      const t = i / FPS, cur = bgAt(t);
      if (cur) {
        for (const l of cur.prev ? [cur.prev, cur] : [cur]) {
          if (l.bg.type === 'video') l.bg.frame = await readers.get(l.bg).frameAt(Math.min(l.local, (l.bg.el.duration || l.local + 1) - 0.05));
        }
      }
      drawFrame(t, false);
      const f = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      ve.encode(f, { keyFrame: i % (FPS * 2) === 0 });
      f.close();
      while (ve.encodeQueueSize > 4 && !failed) await new Promise((r) => { const to = setTimeout(r, 500); ve.addEventListener('dequeue', () => { clearTimeout(to); r(); }, { once: true }); });
      if (i % 5 === 0) {
        Editor.setTime(t, true);
        const pct = (i / N) * 100, spent = (performance.now() - t0) / 1000, left = (spent / Math.max(1, i)) * (N - i);
        setStatus(`🎥 بعمل ملف الفيديو... ${Math.round(pct)}%${i > 30 ? ` — فاضل حوالي ${Math.ceil(left)} ثانية` : ''}`, pct);
        await nextTick();
      }
    }
    await ve.flush();
    if (failed) throw failed;
    muxer.finalize();
    ve.close(); ae.close();
    cleanup();
    state.playing = null;
    refreshButtons();
    finishRecording([target.buffer], 'video/mp4');
    console.log(`التصدير: ${total.toFixed(1)}s فيديو في ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    return true;
  } catch (e) {
    console.warn('التصدير السريع فشل، هنسجّل بالطريقة العادية', e);
    try { ve?.close(); ae?.close(); } catch {}
    cleanup();
    if (state.playing === token) state.playing = null;
    refreshButtons();
    return false;
  }
}
async function exportVideo() {
  state.fx.bypass = false; // الملف دايمًا بالتعديلات، حتى لو كنت بتقارن بالأصلي
  FX.renderPanel();
  if (!(await renderFast())) play('record');
}

// mode: preview | record
async function play(mode, from = 0) {
  if (!state.buf) return;
  stop();
  const ac = audioCtx();
  await ac.resume();
  await Promise.all(state.bgs.map(prepareBg));
  await loadFonts();
  if (state.fx.denoise && !state.fx.bypass) setStatus('⏳ بنضّف الصوت...');
  await AFX.prepare();
  let recorder, mime, dest;
  const chunks = [];
  if (mode === 'record') {
    from = 0;
    setRes(true);
    mime = pickMime();
    if (!mime) { setRes(false); setStatus('المتصفح ده مش بيدعم تسجيل الفيديو — استخدم Chrome'); return; }
    dest = ac.createMediaStreamDestination();
  }
  if (from >= D() - 0.05) from = 0;
  const { src, startAt } = startAudio(from, dest);
  if (mode === 'record') {
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: state.fx.quality * 1_000_000, audioBitsPerSecond: 192_000 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => { setRes(false); finishRecording(chunks, mime); };
    $('download').innerHTML = '';
  }
  state.playing = { src, startAt, mode, recorder };
  src.onended = () => stop(true);
  if (recorder) { drawFrame(0, true); recorder.start(1000); }
  refreshButtons();
  const label = mode === 'record' ? '🎥 بعمل ملف الفيديو...' : '▶️';
  const tick = () => {
    if (!state.playing || state.playing.src !== src) return;
    const t = Math.min(D(), Math.max(0, ac.currentTime - startAt));
    drawFrame(t, true);
    Editor.setTime(t, true);
    setStatus(`${label} ${fmt(t)} / ${fmt(D())}`, (t / D()) * 100);
    if (document.hidden) setTimeout(tick, 33); else requestAnimationFrame(tick);
  };
  tick();
}

const isPlaying = () => !!state.playing;

function stop(ended) {
  const p = state.playing;
  if (!p) return;
  state.playing = null;
  try { p.src.onended = null; p.src.stop(); } catch {}
  if (p.recorder && p.recorder.state !== 'inactive') p.recorder.stop();
  for (const b of state.bgs) if (b.el && b.type === 'video') b.el.pause();
  if (ended && !p.recorder) Editor.setTime(0);
  refreshButtons();
  if (!p.recorder) { setStatus('', null); drawIdle(); }
}

function finishRecording(chunks, mime) {
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const url = URL.createObjectURL(blob);
  const nm = (($('title').value.trim() || state.surahTitle || 'reel') + (textMode() === 'ayat' ? `-${$('fromAyah').value}-${$('toAyah').value}` : ''))
    .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
  $('download').innerHTML = `<a class="btn gold huge" href="${url}" download="${esc(nm)}.${ext}">⬇️ نزّل الفيديو (${(blob.size / 1e6).toFixed(1)} MB)</a><video src="${url}" controls playsinline></video>`;
  setStatus('✅ الفيديو جاهز — دوس "نزّل الفيديو"', 100);
  drawIdle();
}

// ---------- تهيئة ----------
function setMode(m) {
  for (const b of $('mode').children) b.classList.toggle('on', b.dataset.m === m);
  $('ownBox').hidden = m !== 'own';
  syncOwnBoxes();
  // الصوت المرفوع مش بصوت الشيخ، فمانكتبش اسمه عليه
  if (m === 'own') { if ($('subtitle').value === SHEIKH_LINE) $('subtitle').value = ''; }
  else if (!$('subtitle').value.trim()) $('subtitle').value = SHEIKH_LINE;
  $('maxWords').value = textMode() === 'free' ? 20 : 12;
  $('progress').hidden = true;
  $('recInfo').hidden = true;
  $('matches').hidden = true;
  if (m === 'free') showDoaa();
  if (m === 'own') loadOwn();
  warmAsr();
}

// ---------- صوت من عندك ----------
const SHEIKH_LINE = 'بصوت الشيخ محمد عبده';
function syncOwnBoxes() {
  const t = textMode();
  $('ayatBox').hidden = t !== 'ayat';
  $('freeBox').hidden = t !== 'free';
  const isOwn = mode() === 'own';
  $('doaaSearch').hidden = isOwn;
  $('doaaList').hidden = isOwn;
}
function chooseOwn(x) {
  own.item = { ytId: x.id, title: x.name, surahs: [], own: true, type: 'tilawa' };
  state.chosen = null;
  renderOwn();
  if (own.kind === 'free') showPieces(own.item);
}
function renderOwn() {
  const box = $('ownList');
  box.replaceChildren();
  for (const x of own.list.slice(0, 8)) {
    const on = own.item?.ytId === x.id;
    const row = document.createElement('div');
    row.className = 'own-row' + (on ? ' on' : '');
    row.innerHTML = `<button type="button" class="own-pick">${on ? '✓ ' : '🎙 '}${esc(x.name)}</button><button type="button" class="own-del" aria-label="امسحه">✕</button>`;
    row.querySelector('.own-pick').onclick = () => chooseOwn(x);
    row.querySelector('.own-del').onclick = async () => {
      if (!confirm('تمسح الملف ده؟')) return;
      await vfetch('/api/own?id=' + x.id, { method: 'DELETE' });
      if (own.item?.ytId === x.id) own.item = null;
      await loadOwn();
    };
    box.append(row);
  }
}
async function loadOwn() {
  try { own.list = (await (await vfetch('/api/own')).json()).items || []; } catch { own.list = []; }
  renderOwn();
}
async function uploadOwn(e) {
  const f = e.target.files[0];
  if (!f) return;
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  $('ownMsg').textContent = '⏳ برفع الملف...';
  try {
    const r = await vfetch(`/api/own?ext=${encodeURIComponent(ext)}&name=${encodeURIComponent(f.name.replace(/\.[^.]+$/, ''))}`, { method: 'POST', body: f });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    $('ownMsg').textContent = '✅ اترفع. اختار الآيات ودوس "اعمل الفيديو".';
    $('progress').hidden = true;
    await loadOwn();
    chooseOwn(d);
  } catch (err) { $('ownMsg').textContent = '⚠️ ' + err.message; }
  e.target.value = '';
}
// موديل السمع بيتجهز أول ما تبدأ تختار، مش أول ما الصفحة تفتح (الصفحة تفتح أخف)
let warmed = false;
function warmAsr() {
  if (warmed) return;
  warmed = true;
  worker = worker || new Worker('tilawa-worker.js', { type: 'module' });
  worker.postMessage({ type: 'warm' });
}

function onSurahChange() {
  const s = state.surahs.find((x) => x.id === +$('surah').value);
  if (!s) return;
  $('fromAyah').max = $('toAyah').max = s.ayahs;
  $('fromAyah').value = 1;
  $('toAyah').value = Math.min(s.ayahs, 3);
}

async function init() {
  fillFontSelect($('font'), 'Amiri Quran');
  fillFontSelect($('titleFont'), 'Amiri');
  fillFontSelect($('tafsirFont'), 'Cairo');
  for (const b of $('mode').children) b.onclick = () => setMode(b.dataset.m);
  for (const b of $('tafsirSeg').children) b.onclick = () => {
    state.tafsir = b.dataset.v;
    for (const x of $('tafsirSeg').children) x.classList.toggle('on', x === b);
  };
  $('makeBtn').onclick = make;
  $('renderBtn').onclick = exportVideo;
  $('doaaSearch').oninput = showDoaa;
  for (const id of ['surah', 'fromAyah', 'toAyah']) $(id).addEventListener('change', () => { state.chosen = null; $('matches').hidden = true; });

  for (const [label, q] of [['الكل', '__all'], ['📌 بنترست', '__pin'], ['⬛ شاشة سودا', '__black'], ...BG_CHIPS]) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset.q = q;
    b.onclick = () => searchMedia(q);
    $('chips').append(b);
  }
  const up = document.createElement('button');
  up.type = 'button'; up.textContent = '📁 من جهازك';
  up.onclick = () => $('bgUpload').click();
  $('chips').append(up);
  $('bgUpload').onchange = onBgUpload;

  setRes(false);
  $('aspect').onchange = applyAspect;
  for (const id of ['font', 'titleFont', 'tafsirFont', 'fontSize', 'overlay', 'textColor', 'accent', 'textPos', 'title', 'subtitle', 'watermark', 'showDisclaimer', 'tafsirBox']) {
    $(id).addEventListener('input', () => { if (/Font$|^font$/.test(id)) loadFonts().then(() => drawIdle()); else drawIdle(); });
  }
  $('watermark').value = store.get('watermark');
  $('watermark').addEventListener('change', () => store.set('watermark', $('watermark').value.trim()));

  Editor.init();
  $('ownFile').onchange = uploadOwn;
  for (const b of $('ownKind').children) b.onclick = () => {
    own.kind = b.dataset.k;
    for (const x of $('ownKind').children) x.classList.toggle('on', x === b);
    syncOwnBoxes();
    if (own.kind === 'free' && own.item) showPieces(own.item);
  };
  for (const id of ['surah', 'fromAyah', 'toAyah']) $(id).addEventListener('focus', warmAsr, { once: true });

  try {
    state.surahs = await getSurahs();
    for (const s of state.surahs) $('surah').add(new Option(`${arDigits(s.id)}. سورة ${s.name} (${arDigits(s.ayahs)} آية)`, s.id));
    $('surah').value = 1;
    $('surah').onchange = onSurahChange;
    onSurahChange();
  } catch {
    progress('⚠️ مش قادر أجيب قائمة السور — اتأكد من النت', 0);
  }

  try {
    const [d, al] = await Promise.all([fetch('/api/library').then((r) => r.json()), fetch('/api/aligned').then((r) => r.json())]);
    lib.items = d.items.filter((x) => !x.hidden && x.ytId);
    lib.aligned = new Set(al.ids);
    lib.ready = new Set(al.ready || []);
  } catch {}
  const from = new URLSearchParams(location.search).get('from');
  const it = from && lib.items.find((x) => x.id === from);
  if (it?.type === 'doaa') { setMode('free'); showPieces(it); }
  else if (it) {
    if (it.surah) {
      $('surah').value = it.surah; onSurahChange();
      if (it.ayahs) { $('fromAyah').value = it.ayahs[0]; $('toAyah').value = Math.min(it.ayahs[1], it.ayahs[0] + 4); }
    }
    state.chosen = it;
    showRecInfo(it, 1);
  }

  fetch('/api/config').then((r) => r.json()).then((c) => {
    if (c.pixabay || c.pexels) mediaSource = c.pixabay ? 'pixabay' : 'pexels';
  }).catch(() => {});

  await document.fonts.ready;
  await loadFonts();
  drawIdle();
  refreshButtons();
}

init();

// تصنيف فيديوهات القناة: النوع (تلاوة/دعاء/ابتهال) + السنة + السورة والآيات + السلسلة
const fs = require('fs');
const path = require('path');

const QURAN_CACHE = path.join(__dirname, 'data', 'quran-clean.json');

// تطبيع الكلام العربي عشان المقارنة (من غير تشكيل ولا اختلاف الألف والياء والتاء المربوطة)
function norm(s) {
  return String(s || '')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ‏‎]/g, '')
    .replace(/[ٱأإآٲٳ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^ء-ي0-9a-z\s]/gi, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

const toLatinDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

// نص المصحف من غير تشكيل — إملائي وعثماني (العناوين بتتكتب بالاتنين) — بيتحمل مرة واحدة ويتحفظ
async function loadQuran() {
  let data;
  try { data = JSON.parse(fs.readFileSync(QURAN_CACHE, 'utf8')); } catch {
    const get = async (ed) => (await (await fetch('https://api.alquran.cloud/v1/quran/' + ed)).json()).data.surahs;
    const [clean, uth] = await Promise.all([get('quran-simple-clean'), get('quran-uthmani')]);
    data = clean.map((s, i) => ({ id: s.number, name: s.name, texts: [s.ayahs.map((a) => a.text), uth[i].ayahs.map((a) => a.text)] }));
    fs.writeFileSync(QURAN_CACHE, JSON.stringify(data));
  }
  // لكل سورة: نص واحد طويل + مكان بداية كل آية فيه
  return data.map((s) => ({
    id: s.id,
    name: norm(s.name).replace(/^سوره /, ''),
    texts: s.texts.map((ayahs) => {
      let text = ' ';
      const starts = [];
      ayahs.forEach((a, i) => {
        let t = norm(a);
        if (i === 0 && s.id !== 1 && t.startsWith('بسم الله الرحمن الرحيم ')) t = t.slice('بسم الله الرحمن الرحيم '.length);
        starts.push(text.length);
        text += t + ' ';
      });
      return { text, starts };
    }),
  }));
}

const ayahAt = (t, pos) => { let i = 0; while (i + 1 < t.starts.length && t.starts[i + 1] <= pos) i++; return i + 1; };

// يدوّر على نص الآية اللي في العنوان جوه المصحف
function findAyah(quran, title) {
  const words = norm(title.replace(/(القارئ|للقارئ|محمد عبده|MOHAMED).*$/, '')).replace(/^ما ?تيسر من /, '').split(' ').filter((w) => /[\u0621-\u064A]/.test(w));
  if (words.length < 2) return null;
  const max = Math.min(words.length, 10);
  for (let n = max; n >= 2; n--) {
    const q = ' ' + words.slice(0, n).join(' ') + ' ';
    const hits = new Map();
    for (const s of quran) {
      for (const t of s.texts) {
        const i = t.text.indexOf(q);
        if (i >= 0 && !hits.has(s.id)) hits.set(s.id, { surah: s.id, from: ayahAt(t, i + 1), to: ayahAt(t, i + q.length - 2) });
      }
      if (hits.size > 1) break;
    }
    if (hits.size === 1) return [...hits.values()][0];
    if (hits.size > 1) return null; // نفس الكلام في أكتر من سورة
    if (n === 2 && words.length > 2) return null;
  }
  return null;
}

// أسماء السور زي ما بتتكتب في العناوين
// بندوّر بس في الكلام اللي بعد كلمة "سورة" (عشان "محمد عبده" و"قرآن الفجر" مايتحسبوش سور)
function findSurahs(quran, title) {
  // "ما تيسر من القصص و العنكبوت" = أسماء سور من غير كلمة سورة
  const full = ' ' + norm(title).replace(/محمد ?عبده/g, ' ').replace(/ما ?تيسر من (سوره )?/, ' سوره ') + ' ';
  const at = full.indexOf(' سوره ');
  if (at < 0) return [];
  const t = full.slice(at);
  const found = [];
  for (const s of quran) {
    const base = s.name.replace(/^ال/, '');
    // اسم قصير زي "ق" أو "ص" لازم ييجي بعد كلمة سورة على طول
    const re = base.length <= 2 && !s.name.startsWith('ال')
      ? new RegExp(` سوره ${base} `)
      : new RegExp(`( |و)(ال)?${s.id === 3 ? 'ال عمران' : base} `);
    const m = t.match(re);
    if (m) found.push({ id: s.id, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((x) => x.id);
}

const DOAA = /دعاء|ادعيه|أدعية|ادعية|اللهم|رباه|ربااا|يارب|يا رب|ياقوي|سيدي ومولاي|من لنا سواك|لك الحمد|اسرتنا الذنوب|آسرتنا|ولولا الله|سبحانك يا|سبحان الحي|ازفت ازفة|تضرع/;
const IBTIHAL = /ابتهال|تواشيح|تكبيرات|تلبيات|لبيك|بارك الله لهما|انشودة|أنشودة|مدح|لا إله إلا الله ❤/;

function classify(v, { quran, playlistsOf }) {
  const title = v.title || '';
  const plain = norm(title);
  const lists = playlistsOf.get(v.id) || [];
  const listText = lists.join(' ');

  let type = 'tilawa';
  if (IBTIHAL.test(title)) type = 'ibtihal';
  else if (DOAA.test(title) || DOAA.test(plain) || /أدعية|ادعية/.test(listText)) type = 'doaa';

  // سنة التسجيل: لو مكتوبة في العنوان أو اسم القائمة أحسن من سنة الرفع
  const years = (s) => [...toLatinDigits(s).matchAll(/(?:^|\D)(20[12]\d)(?:\D|$)/g)].map((m) => +m[1]);
  const year = years(title)[0] || years(listText)[0] || (v.date ? +v.date.slice(0, 4) : null);

  let surah = null, ayahs = null, named = [];
  if (type === 'tilawa') {
    named = findSurahs(quran, title);
    if (named.length) surah = named[0];
    // لو اسم السورة مكتوب يبقى هو الصح؛ غير كده ندوّر على نص الآية نفسه
    else {
      const hit = findAyah(quran, title);
      if (hit) { surah = hit.surah; ayahs = [hit.from, hit.to]; }
    }
    const range = toLatinDigits(title).match(/الآيات\s*(\d+)\s*-\s*(\d+)/);
    if (range && surah && !ayahs) ayahs = [+range[1], +range[2]];
  }

  // نوع التسجيل
  const tags = [];
  if (/تراويح/.test(title + listText)) tags.push('tarawih');
  if (/تهجد/.test(title)) tags.push('tahajjud');
  if (/رمضان/.test(title + listText)) tags.push('ramadan');
  if (/نادر/.test(title + listText)) tags.push('rare');
  if (/شعبة/.test(title + listText)) tags.push('shuba');

  return {
    type, year, surah, ayahs,
    surahs: named.length ? named : surah ? [surah] : [],
    collections: lists,
    tags,
    format: v.kind,
  };
}

module.exports = { loadQuran, classify, norm };

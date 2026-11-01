// مرجع نصوص الأدعية الصحيحة (عشان نصحّح اللي الموديل سمعه):
// حصن المسلم كامل + القرآن بالتشكيل + التصحيحات اللي المستخدم بيعملها بإيده
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'duas-ref.json');
const CUSTOM = path.join(__dirname, 'data', 'duas-custom.json');

const getJson = async (url) => JSON.parse((await (await fetch(url)).text()).replace(/^﻿/, ''));

async function build() {
  const entries = [];
  // حصن المسلم
  const index = await getJson('https://www.hisnmuslim.com/api/ar/husn_ar.json');
  const chapters = Object.values(index)[0];
  for (const ch of chapters) {
    try {
      const d = await getJson(ch.TEXT.replace(/^http:/, 'https:'));
      for (const e of Object.values(d)[0]) entries.push({ src: 'حصن المسلم — ' + ch.TITLE, text: e.ARABIC_TEXT });
    } catch {}
  }
  // القرآن (إملائي بالتشكيل) — آيات الدعاء زي "ربنا آتنا في الدنيا حسنة"
  const q = await getJson('https://api.alquran.cloud/v1/quran/quran-simple');
  for (const s of q.data.surahs) {
    for (const a of s.ayahs) entries.push({ src: `${s.name} ${a.numberInSurah}`, text: a.text });
  }
  fs.writeFileSync(FILE, JSON.stringify(entries));
  return entries;
}

// دعاء القنوت بصيغة الجمع (زي ما الإمام بيقوله في الصلاة) — حصن المسلم كاتبه بصيغة المفرد
const QUNUT = [
  'اللَّهُمَّ اهْدِنَا فِيمَنْ هَدَيْتَ، وَعَافِنَا فِيمَنْ عَافَيْتَ، وَتَوَلَّنَا فِيمَنْ تَوَلَّيْتَ، وَبَارِكْ لَنَا فِيمَا أَعْطَيْتَ، وَقِنَا وَاصْرِفْ عَنَّا شَرَّ مَا قَضَيْتَ، فَإِنَّكَ تَقْضِي وَلَا يُقْضَى عَلَيْكَ، وَإِنَّهُ لَا يَذِلُّ مَنْ وَالَيْتَ، وَلَا يَعِزُّ مَنْ عَادَيْتَ، تَبَارَكْتَ رَبَّنَا وَتَعَالَيْتَ، لَكَ الْحَمْدُ عَلَى مَا قَضَيْتَ، وَلَكَ الشُّكْرُ عَلَى مَا أَنْعَمْتَ بِهِ وَأَوْلَيْتَ، نَسْتَغْفِرُكَ اللَّهُمَّ وَنَتُوبُ إِلَيْكَ',
  'اللَّهُمَّ إِنَّا نَعُوذُ بِرِضَاكَ مِنْ سَخَطِكَ، وَبِمُعَافَاتِكَ مِنْ عُقُوبَتِكَ، وَنَعُوذُ بِكَ مِنْكَ، لَا نُحْصِي ثَنَاءً عَلَيْكَ، أَنْتَ كَمَا أَثْنَيْتَ عَلَى نَفْسِكَ',
  'اللَّهُمَّ إِنَّا نَسْأَلُكَ رِضَاكَ وَالْجَنَّةَ، وَنَعُوذُ بِكَ مِنْ سَخَطِكَ وَالنَّارِ',
  'اللَّهُمَّ إِنَّكَ عَفُوٌّ كَرِيمٌ تُحِبُّ الْعَفْوَ فَاعْفُ عَنَّا',
  'اللَّهُمَّ بَلِّغْنَا لَيْلَةَ الْقَدْرِ',
  'وَصَلَّى اللَّهُ وَسَلَّمَ وَبَارَكَ عَلَى سَيِّدِنَا مُحَمَّدٍ وَعَلَى آلِهِ وَصَحْبِهِ أَجْمَعِينَ',
];

let cache = null;
async function load() {
  if (!cache) {
    try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = await build(); }
  }
  let custom = [];
  try { custom = JSON.parse(fs.readFileSync(CUSTOM, 'utf8')); } catch {}
  // التصحيحات بتاعتك الأول (ليها الأولوية)
  return [...custom.map((text) => ({ src: 'تصحيحاتك', text })), ...QUNUT.map((text) => ({ src: 'دعاء القنوت', text })), ...cache];
}

// سطر اتصحح بإيد المستخدم → بيتحفظ عشان المرة الجاية يتكتب صح لوحده
function addCustom(lines) {
  let custom = [];
  try { custom = JSON.parse(fs.readFileSync(CUSTOM, 'utf8')); } catch {}
  for (const l of lines) {
    const t = String(l || '').trim().slice(0, 500);
    if (t.split(/\s+/).length >= 2 && !custom.includes(t)) custom.push(t);
  }
  fs.writeFileSync(CUSTOM, JSON.stringify(custom.slice(-5000), null, 1));
  return custom.length;
}

module.exports = { load, addCustom };

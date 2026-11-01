// الخطوط العربية المتاحة (من Google Fonts) — بتتحمّل بس لما تتستخدم
const FONTS = [
  ['Amiri Quran', 'أميري قرآن (مصحف)'], ['Scheherazade New', 'شهرزاد'], ['Amiri', 'أميري'], ['Noto Naskh Arabic', 'نسخ'],
  ['Lateef', 'لطيف'], ['Harmattan', 'هرمتان'], ['Markazi Text', 'مركزي'], ['Aref Ruqaa', 'رقعة'], ['Aref Ruqaa Ink', 'رقعة حبر'],
  ['Reem Kufi', 'ريم كوفي'], ['Reem Kufi Fun', 'ريم كوفي ملون'], ['Noto Kufi Arabic', 'كوفي'], ['Kufam', 'كوفام'],
  ['El Messiri', 'المسيري'], ['Cairo', 'القاهرة'], ['Tajawal', 'تجوال'], ['Almarai', 'المراعي'], ['Changa', 'شنجا'],
  ['Mada', 'مدى'], ['IBM Plex Sans Arabic', 'آي بي إم'], ['Readex Pro', 'ريدكس'], ['Noto Sans Arabic', 'نوتو'], ['Zain', 'زين'],
  ['Lemonada', 'ليمونادة'], ['Lalezar', 'لاله زار'], ['Rakkas', 'رقاص'], ['Marhey', 'مرحي'], ['Katibeh', 'كاتبة'],
  ['Mirza', 'ميرزا'], ['Jomhuria', 'جمهورية'], ['Ruwudu', 'رودو'], ['Gulzar', 'گلزار'], ['Alkalami', 'القلمي'],
  ['Blaka', 'بلاكا'], ['Vibes', 'فايبز'], ['Qahiri', 'قاهري'], ['Badeen Display', 'بديع'], ['Handjet', 'هاندجت'],
];

// رابط واحد لكل الخطوط (المتصفح بيحمّل الخط الفعلي بس لما يتستخدم)
(function loadFontCss() {
  const fams = FONTS.map(([f]) => 'family=' + f.replace(/ /g, '+') + (/(Amiri$|Cairo|Tajawal|Almarai|El Messiri|Noto Naskh Arabic|Scheherazade New|Reem Kufi$)/.test(f) ? ':wght@400;700' : ''));
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?' + fams.join('&') + '&display=swap';
  document.head.append(link);
})();

function fillFontSelect(sel, value) {
  sel.innerHTML = '';
  for (const [f, label] of FONTS) {
    const o = new Option(`${label} — ${f}`, f);
    o.style.fontFamily = `"${f}"`;
    sel.add(o);
  }
  if (value) sel.value = value;
}

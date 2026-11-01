// استيراد/تحديث فيديوهات قناة الشيخ من يوتيوب للمكتبة
// من السطر: node import.js   (أو من زرار "تحديث من يوتيوب" في الموقع)
const fs = require('fs');
const path = require('path');
const { fetchChannel } = require('./youtube');
const { loadQuran, classify } = require('./classify');

const CHANNEL = '@mohamedabdo1354';
// الحاجات اللي الأدمن بيعدلها بإيده — التحديث مابيغيرهاش
const MANUAL = ['type', 'year', 'surah', 'surahs', 'ayahs', 'title', 'place', 'note'];

async function importYoutube({ library, log = () => {} }) {
  const byId = new Map(library.map((x) => [x.id, x]));
  const knownDates = new Map(library.filter((x) => x.ytId && x.date && !x.dateApprox).map((x) => [x.ytId, x.date]));
  const quran = await loadQuran();
  const { videos, playlists } = await fetchChannel(CHANNEL, { log, knownDates });

  const playlistsOf = new Map();
  for (const p of playlists) for (const id of p.videoIds) {
    if (!playlistsOf.has(id)) playlistsOf.set(id, []);
    playlistsOf.get(id).push(p.title.trim());
  }

  let added = 0, updated = 0;
  for (const v of videos) {
    const auto = classify(v, { quran, playlistsOf });
    const item = {
      id: 'yt:' + v.id,
      source: 'youtube',
      ytId: v.id,
      url: v.kind === 'short' ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
      title: v.title,
      date: v.date || '',
      dateApprox: !!v.dateApprox,
      length: v.length || '',
      place: '', note: '',
      ...auto,
    };
    const old = byId.get(item.id);
    if (!old) { item.added = new Date().toISOString(); byId.set(item.id, item); added++; continue; }
    const keep = old.edited ? Object.fromEntries(MANUAL.filter((k) => k in old).map((k) => [k, old[k]])) : { place: old.place, note: old.note };
    byId.set(item.id, { ...old, ...item, ...keep });
    updated++;
  }
  // الترتيب: الأحدث الأول
  const items = [...byId.values()].sort((a, b) => (b.date || b.added || '').localeCompare(a.date || a.added || ''));
  log(`✅ خلص: ${added} جديد، ${updated} اتحدث، الإجمالي ${items.length}`);
  return { items, added, updated, playlists: playlists.map((p) => ({ id: p.id, title: p.title, count: p.videoIds.length })) };
}

module.exports = { importYoutube };

if (require.main === module) {
  const LIB = path.join(__dirname, 'data', 'library.json');
  const library = JSON.parse(fs.readFileSync(LIB, 'utf8'));
  importYoutube({ library, log: (m) => console.log(m) }).then((r) => {
    fs.writeFileSync(LIB, JSON.stringify(r.items, null, 1));
    fs.writeFileSync(path.join(__dirname, 'data', 'playlists.json'), JSON.stringify(r.playlists, null, 1));
  });
}

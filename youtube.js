// بيجيب كل فيديوهات قناة يوتيوب (فيديوهات + شورتس + بث مباشر + قوائم التشغيل) من غير API key
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const HEADERS = { 'user-agent': UA, 'accept-language': 'ar,en;q=0.8', cookie: 'CONSENT=YES+1' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findAll(o, key, out = []) {
  if (Array.isArray(o)) o.forEach((x) => findAll(x, key, out));
  else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) { if (k === key) out.push(v); findAll(v, key, out); }
  }
  return out;
}

const text = (t) => t?.content ?? t?.simpleText ?? (t?.runs || []).map((r) => r.text).join('') ?? '';

// الشكل الجديد (lockupViewModel) والقديم (videoRenderer / playlistVideoRenderer / shorts)
function extractVideos(data, kind) {
  const out = [];
  for (const l of findAll(data, 'lockupViewModel')) {
    if (l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') continue;
    const meta = l.metadata?.lockupMetadataViewModel;
    const badge = findAll(l.contentImage, 'thumbnailBadgeViewModel').map((b) => b.text).find(Boolean);
    out.push({ id: l.contentId, title: text(meta?.title), length: badge || '', kind });
  }
  for (const key of ['videoRenderer', 'playlistVideoRenderer']) {
    for (const v of findAll(data, key)) out.push({ id: v.videoId, title: text(v.title), length: text(v.lengthText), kind });
  }
  for (const s of findAll(data, 'shortsLockupViewModel')) {
    const id = s.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId || (s.entityId || '').replace(/^shorts-shelf-item-/, '');
    out.push({ id, title: s.overlayMetadata?.primaryText?.content || '', length: '', kind: 'short' });
  }
  return out.filter((v) => v.id);
}

async function getHtml(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.status === 429) { await sleep(15000 * (attempt + 1)); continue; }
    if (!r.ok) return null;
    return r.text();
  }
  return null;
}

// صفحة فيها قايمة فيديوهات (تاب في القناة أو playlist) + كل الصفحات اللي بعدها
async function fetchList(url, kind, { tab, log } = {}) {
  const html = await getHtml(url);
  const m = html?.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return { videos: [], data: null };
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || '2.20240101.00.00';
  const data = JSON.parse(m[1]);
  let root = data;
  if (tab) {
    // لو التاب مش موجود يوتيوب بيرجع الصفحة الرئيسية
    root = findAll(data, 'tabRenderer').find((t) => t.selected);
    if (!root?.endpoint?.commandMetadata?.webCommandMetadata?.url?.endsWith('/' + tab)) return { videos: [], data };
    root = root.content;
  }
  const videos = extractVideos(root, kind);
  let token = findAll(root, 'continuationCommand')[0]?.token;
  for (let page = 0; token && page < 100; page++) {
    log?.(`${tab || 'قائمة'}: ${videos.length}`);
    const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}&prettyPrint=false`, {
      method: 'POST',
      headers: { ...HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion, hl: 'ar', gl: 'EG' } }, continuation: token }),
    });
    if (!res.ok) break;
    const more = findAll(await res.json(), 'onResponseReceivedActions').flat();
    videos.push(...extractVideos(more, kind));
    token = findAll(more, 'continuationCommand')[0]?.token;
  }
  return { videos, data: root };
}

async function fetchPlaylists(handle, log) {
  const { data } = await fetchList(`https://www.youtube.com/${handle}/playlists`, 'video', { tab: 'playlists', log });
  const lists = findAll(data, 'lockupViewModel')
    .filter((l) => l.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST')
    .map((l) => ({ id: l.contentId, title: text(l.metadata?.lockupMetadataViewModel?.title) }));
  for (const p of lists) {
    p.videoIds = (await fetchList(`https://www.youtube.com/playlist?list=${p.id}`, 'video', { log })).videos.map((v) => v.id);
    log?.(`قائمة "${p.title}": ${p.videoIds.length}`);
  }
  return lists;
}

// تاريخ الرفع من صفحة الفيديو (بهدوء عشان يوتيوب مايحظرش)
async function fetchDate(id) {
  const html = await getHtml(`https://www.youtube.com/watch?v=${id}&hl=ar`);
  if (!html) return '';
  const d = html.match(/"publishDate":"([^"]+)"/)?.[1] || html.match(/"uploadDate":"([^"]+)"/)?.[1]
    || html.match(/itemprop="datePublished" content="([^"]+)"/)?.[1];
  return d ? d.slice(0, 10) : '';
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

// knownDates: Map(id → date) عشان مانجيبش تاني اللي عندنا
async function fetchChannel(handle, { log, knownDates = new Map() } = {}) {
  const tabs = [];
  for (const [tab, kind] of [['videos', 'video'], ['shorts', 'short'], ['streams', 'live']]) {
    const { videos } = await fetchList(`https://www.youtube.com/${handle}/${tab}`, kind, { tab, log });
    log?.(`${tab}: ${videos.length}`);
    tabs.push(videos);
  }
  const seen = new Set();
  const all = tabs.flat().filter((v) => !seen.has(v.id) && seen.add(v.id));
  const playlists = await fetchPlaylists(handle, log);

  const missing = all.filter((v) => !(v.date = knownDates.get(v.id) || ''));
  let done = 0;
  await pool(missing, 2, async (v) => {
    v.date = await fetchDate(v.id);
    await sleep(400);
    if (++done % 10 === 0) log?.(`تواريخ: ${done}/${missing.length}`);
  });

  // اللي ماعرفناش تاريخه: نقدّره من اللي جنبه (القناة مترتبة من الأحدث للأقدم)
  for (const list of tabs) {
    list.forEach((v, i) => {
      if (v.date) return;
      const prev = list.slice(0, i).reverse().find((x) => x.date);
      const next = list.slice(i + 1).find((x) => x.date);
      const guess = next?.date || prev?.date;
      if (guess) { v.date = guess; v.dateApprox = true; }
    });
  }
  return { videos: all, playlists };
}

module.exports = { fetchChannel };

if (require.main === module) {
  fetchChannel(process.argv[2] || '@mohamedabdo1354', { log: (m) => process.stderr.write(m + '\n') })
    .then((r) => console.log(JSON.stringify(r, null, 1)));
}

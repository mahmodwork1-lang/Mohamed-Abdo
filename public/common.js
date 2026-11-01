// حاجات مشتركة بين صفحة المكتبة وصانع الريلز
const $ = (id) => document.getElementById(id);
const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// كل زائر ليه رقم عشوائي على جهازه، وملفاته اللي بيرفعها مابتظهرش لغيره
const visitorId = (() => {
  try {
    let v = localStorage.getItem('visitor');
    if (!v) { v = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem('visitor', v); }
    return v;
  } catch { return (window.__v = window.__v || crypto.randomUUID().replace(/-/g, '')); }
})();
const vfetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), 'x-visitor': visitorId } });
const TYPE_NAMES = { tilawa: 'تلاوة', doaa: 'دعاء', ibtihal: 'ابتهال' };

const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// قائمة السور (بتتحفظ عشان مانطلبهاش كل مرة)
async function getSurahs() {
  const cached = store.get('surahs_v1');
  if (cached) { try { return JSON.parse(cached); } catch {} }
  const r = await fetch('https://api.alquran.cloud/v1/surah');
  const d = await r.json();
  const list = d.data.map((s) => ({ id: s.number, name: s.name.replace(/^سُورَةُ\s*/, ''), ayahs: s.numberOfAyahs }));
  store.set('surahs_v1', JSON.stringify(list));
  return list;
}

// يحوّل أي لينك لطريقة عرض (يوتيوب / فيسبوك / صوت مباشر)
function parseMedia(url) {
  let u;
  try { u = new URL(url); } catch { return { kind: 'link', url }; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    const list = u.searchParams.get('list');
    let id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
    const m = u.pathname.match(/\/(?:shorts|live|embed)\/([\w-]{6,})/);
    if (m) id = m[1];
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    const start = t ? parseInt(String(t).replace(/s$/, ''), 10) || 0 : 0;
    if (id) {
      const embed = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&playsinline=1&origin=${encodeURIComponent(location.origin)}${start ? '&start=' + start : ''}${list ? '&list=' + list : ''}`;
      return { kind: 'youtube', id, embed, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url };
    }
    if (list) return { kind: 'youtube', embed: `https://www.youtube.com/embed/videoseries?list=${list}&origin=${encodeURIComponent(location.origin)}`, thumb: '', url, playlist: true };
  }
  if (host.endsWith('facebook.com') || host === 'fb.watch') {
    return { kind: 'facebook', embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`, url };
  }
  if (/\.(mp3|m4a|ogg|wav|aac)(\?|$)/i.test(u.pathname)) return { kind: 'audio', url };
  if (/\.(mp4|webm)(\?|$)/i.test(u.pathname)) return { kind: 'video', url };
  return { kind: 'link', url };
}

// iframe بتاع يوتيوب لازم يبعت اسم الموقع (Referer) وإلا يوتيوب بيطلع Error 153
function embedFrame(src) {
  return `<iframe src="${esc(src)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write" allowfullscreen></iframe>`;
}

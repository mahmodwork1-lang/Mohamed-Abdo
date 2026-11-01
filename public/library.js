// صفحة المكتبة: التلاوات والأدعية مقسّمة بالنوع والسنة والسورة + أدوات الإدارة
const PAGE = 36;
const lib = {
  items: [], playlists: [], canEdit: false, surahs: [], editing: null,
  tab: 'all', year: '', shown: PAGE, selecting: false, selected: new Set(), list: [],
};
const adminMode = new URLSearchParams(location.search).has('admin');
const adminPass = () => { try { return sessionStorage.getItem('adminPass') || ''; } catch { return ''; } };
const adminHeaders = (extra = {}) => ({ 'x-admin': adminPass(), ...extra });

async function loadLibrary() {
  const r = await fetch('/api/library', { headers: adminHeaders() });
  const d = await r.json();
  lib.items = d.items || [];
  lib.playlists = d.playlists || [];
  lib.canEdit = d.canEdit;
  // أدوات الإدارة بتظهر بس لما تفتح /?admin (عشان الصفحة تفضل بسيطة)
  lib.canEdit = lib.canEdit && adminMode;
  $('adminBar').hidden = !lib.canEdit;
  fillFilters();
  render();
}

const surahName = (id) => lib.surahs.find((s) => s.id === id)?.name || '';
const plain = (x) => String(x || '').replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();

function inTab(x, tab = lib.tab) {
  if (tab === 'all') return true;
  return x.type === tab;
}

function fillFilters() {
  // السور اللي ليها تسجيلات بس
  const counts = new Map();
  for (const x of lib.items) for (const s of x.surahs || (x.surah ? [x.surah] : [])) counts.set(s, (counts.get(s) || 0) + 1);
  const sf = $('surahFilter'), cur = sf.value;
  sf.length = 1;
  [...counts.keys()].sort((a, b) => a - b).forEach((id) => sf.add(new Option(`${arDigits(id)}. ${surahName(id)} (${arDigits(counts.get(id))})`, id)));
  sf.value = cur;
  const lf = $('listFilter'), curL = lf.value;
  lf.length = 1;
  const names = new Set(lib.items.flatMap((x) => x.collections || []));
  [...names].forEach((n) => lf.add(new Option(n, n)));
  lf.value = curL;
}

function filtered() {
  const q = plain($('q').value.trim());
  const surah = +$('surahFilter').value || 0;
  const coll = $('listFilter').value;
  const fmt = $('formatFilter').value;
  let list = lib.items.filter((x) => inTab(x)
    && (!surah || (x.surahs || [x.surah]).includes(surah))
    && (!coll || (x.collections || []).includes(coll))
    && (!fmt || (fmt === 'short' ? x.format === 'short' : x.format !== 'short'))
    && (!q || plain([x.title, x.place, x.note, ...(x.surahs || []).map(surahName), ...(x.collections || [])].join(' ')).includes(q)));
  // السنين بتتحسب قبل فلتر السنة
  const years = new Map();
  for (const x of list) { const y = x.year || 0; years.set(y, (years.get(y) || 0) + 1); }
  if (lib.year !== '') list = list.filter((x) => String(x.year || 0) === lib.year);

  const sort = $('sort').value;
  const byDate = (a, b) => (b.date || b.added || '').localeCompare(a.date || a.added || '');
  if (sort === 'old') list = [...list].sort((a, b) => byDate(b, a));
  else if (sort === 'surah') list = [...list].sort((a, b) => (a.surah || 999) - (b.surah || 999) || ((a.ayahs?.[0] || 0) - (b.ayahs?.[0] || 0)));
  else list = [...list].sort((a, b) => (b.year || 0) - (a.year || 0) || byDate(a, b));
  return { list, years };
}

function render() {
  const tabCounts = { all: 0, tilawa: 0, doaa: 0, ibtihal: 0 };
  for (const x of lib.items) for (const t of Object.keys(tabCounts)) if (inTab(x, t)) tabCounts[t]++;
  for (const b of $('tabs').children) b.querySelector('.n').textContent = arDigits(tabCounts[b.dataset.t]);

  const { list, years } = filtered();
  lib.list = list;

  // أزرار السنين
  const yb = $('years');
  yb.innerHTML = '';
  const mk = (val, label, n) => {
    const b = document.createElement('button');
    b.className = lib.year === val ? 'on' : '';
    b.innerHTML = `${label}${n != null ? ` <span class="n">${arDigits(n)}</span>` : ''}`;
    b.onclick = () => { lib.year = val; lib.shown = PAGE; render(); };
    yb.append(b);
  };
  const totalY = [...years.values()].reduce((a, b) => a + b, 0);
  mk('', 'كل السنين', totalY);
  [...years.keys()].sort((a, b) => b - a).forEach((y) => mk(String(y), y ? arDigits(y) : 'سنة غير معروفة', years.get(y)));

  $('resultCount').textContent = `${arDigits(list.length)} تسجيل`;
  const grid = $('grid');
  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${lib.items.length
      ? 'مفيش نتايج'
      : 'لسه مفيش تسجيلات'}</div>`;
  }
  // عناوين للسنين لما الترتيب بالأحدث/الأقدم
  const showYearHeads = $('sort').value !== 'surah' && lib.year === '';
  let lastYear = null;
  for (const it of list.slice(0, lib.shown)) {
    const y = it.year || 0;
    if (showYearHeads && y !== lastYear) {
      const h = document.createElement('h2');
      h.className = 'year-head';
      h.textContent = y ? 'تسجيلات ' + arDigits(y) : 'سنة غير معروفة';
      grid.append(h);
      lastYear = y;
    }
    grid.append(card(it));
  }
  $('moreBtn').hidden = list.length <= lib.shown;
  $('moreBtn').textContent = `عرض المزيد (${arDigits(list.length - lib.shown)} كمان)`;
  updateBulk();
}

function card(it) {
  const m = parseMedia(it.url);
  const el = document.createElement('article');
  el.className = 'card' + (lib.selected.has(it.id) ? ' sel' : '');
  let media;
  if (m.kind === 'youtube' || m.kind === 'facebook') {
    media = `<div class="media">${m.thumb ? `<img loading="lazy" src="${esc(m.thumb)}" alt="">` : ''}
      ${it.length ? `<span class="dur">${esc(it.length)}</span>` : ''}${it.format === 'short' ? '<span class="fmt">Shorts</span>' : ''}
      <button class="play" aria-label="تشغيل"><span>▶</span></button></div>`;
  } else if (m.kind === 'audio') {
    media = `<div class="media audio"><audio controls preload="none" src="${esc(m.url)}"></audio></div>`;
  } else if (m.kind === 'video') {
    media = `<div class="media"><video controls preload="metadata" src="${esc(m.url)}"></video></div>`;
  } else {
    media = `<div class="media link"><a href="${esc(m.url)}" target="_blank" rel="noopener">فتح التسجيل ↗</a></div>`;
  }
  const s = (it.surahs || []).map((id) => surahName(id)).filter(Boolean);
  const sTxt = s.length ? 'سورة ' + s.slice(0, 3).join(' و') + (s.length > 3 ? ' …' : '') + (it.ayahs && s.length === 1 ? ` (${arDigits(it.ayahs[0])}${it.ayahs[1] !== it.ayahs[0] ? '-' + arDigits(it.ayahs[1]) : ''})` : '') : '';
  const reelQs = new URLSearchParams({ from: it.id });
  el.innerHTML = `${lib.selecting ? `<input type="checkbox" class="pick" ${lib.selected.has(it.id) ? 'checked' : ''} aria-label="تحديد">` : ''}${media}
    <div class="body">
      <h3>${esc(it.title)}</h3>
      <div class="meta">
        <span class="badge">${TYPE_NAMES[it.type] || ''}</span>
        ${it.year ? `<span class="badge${it.dateApprox && !it.edited ? ' approx' : ''}" title="${it.dateApprox ? 'سنة تقريبية' : ''}">${arDigits(it.year)}</span>` : ''}
        ${sTxt ? `<span>${esc(sTxt)}</span>` : ''}
        ${it.place ? `<span>📍 ${esc(it.place)}</span>` : ''}
      </div>
      ${(it.collections || []).length ? `<p class="hint">📂 ${esc(it.collections.join(' · '))}</p>` : ''}
      ${it.note ? `<p class="hint">${esc(it.note)}</p>` : ''}
      <div class="actions">
        <a class="btn small" href="${esc(it.url)}" target="_blank" rel="noopener">المصدر ↗</a>
        ${it.type !== 'ibtihal' && it.ytId ? `<a class="btn small gold" href="/reels?${reelQs}">🎬 اعمل ريلز</a>` : ''}
        ${lib.canEdit && !lib.selecting ? '<button class="btn small" data-a="edit">تعديل</button><button class="btn small danger" data-a="del">حذف</button>' : ''}
      </div>
    </div>`;
  const play = el.querySelector('.play');
  if (play) play.onclick = () => {
    if (lib.selecting) return toggleSel(it.id, el);
    play.parentElement.innerHTML = embedFrame(m.embed);
    // لو المشغل ماشتغلش (متصفح جوه برنامج أو إضافة حظر) — لينك يفتحه في يوتيوب
    const tip = document.createElement('p');
    tip.className = 'hint';
    tip.innerHTML = `الفيديو مش شغال؟ <a href="${esc(it.url)}" target="_blank" rel="noopener">افتحه على يوتيوب ↗</a>`;
    el.querySelector('.body').prepend(tip);
  };
  el.querySelector('.pick')?.addEventListener('change', () => toggleSel(it.id, el));
  el.querySelector('[data-a=edit]')?.addEventListener('click', () => openForm(it));
  el.querySelector('[data-a=del]')?.addEventListener('click', async () => {
    if (!confirm(`حذف "${it.title}"؟`)) return;
    const r = await fetch('/api/library?id=' + encodeURIComponent(it.id), { method: 'DELETE', headers: adminHeaders() });
    if (r.ok) loadLibrary(); else alert((await r.json()).error);
  });
  return el;
}

// ---------- التحديد الجماعي ----------
function toggleSel(id, el) {
  if (lib.selected.has(id)) lib.selected.delete(id); else lib.selected.add(id);
  el.classList.toggle('sel', lib.selected.has(id));
  const box = el.querySelector('.pick');
  if (box) box.checked = lib.selected.has(id);
  updateBulk();
}

function updateBulk() {
  $('bulk').hidden = !lib.selecting;
  $('bulkCount').textContent = `${arDigits(lib.selected.size)} محدد`;
}

async function bulkSet(set) {
  if (!lib.selected.size) return alert('حدد تسجيلات الأول');
  const r = await fetch('/api/library/bulk', {
    method: 'POST', headers: adminHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ ids: [...lib.selected], set }),
  });
  if (!r.ok) return alert((await r.json()).error);
  lib.selected.clear();
  await loadLibrary();
}

// ---------- الإضافة والتعديل ----------
const FIELDS = ['type', 'url', 'title', 'surah', 'year', 'place', 'note'];

function openForm(item) {
  lib.editing = item || null;
  const f = $('form');
  f.reset();
  $('formErr').textContent = '';
  $('dlgTitle').textContent = item ? 'تعديل تسجيل' : 'إضافة تسجيل';
  if (item) {
    for (const k of FIELDS) f.elements[k].value = item[k] ?? '';
  }
  $('passRow').hidden = lib.canEdit;
  $('dlg').showModal();
}

async function submitForm(e) {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  const f = $('form');
  if (!f.reportValidity()) return;
  const body = Object.fromEntries(FIELDS.map((k) => [k, f.elements[k].value]));
  if (!lib.canEdit && f.elements.pass.value) { try { sessionStorage.setItem('adminPass', f.elements.pass.value); } catch {} }
  const ed = lib.editing;
  const r = await fetch('/api/library' + (ed ? '?id=' + encodeURIComponent(ed.id) : ''), {
    method: ed ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json', 'x-admin': adminPass() || f.elements.pass.value },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) { $('formErr').textContent = d.error; return; }
  $('dlg').close();
  loadLibrary();
}

// ---------- تحديث من يوتيوب ----------
async function pollImport(start) {
  const r = await fetch('/api/import', { method: start ? 'POST' : 'GET', headers: adminHeaders() });
  if (!r.ok) return;
  const j = await r.json();
  $('importBtn').disabled = j.running;
  $('importStatus').textContent = j.running ? '⏳ ' + (j.log[j.log.length - 1] || 'بيبدأ...')
    : j.result ? `✅ ${arDigits(j.result.added)} جديد · ${arDigits(j.result.updated)} اتحدث` : (j.log[j.log.length - 1] || '');
  // start=null يعني إحنا بنتابع تحديث شغال — لما يخلص نحمّل المكتبة من جديد
  if (j.running) setTimeout(() => pollImport(null), 2000);
  else if (start === null) loadLibrary();
}

async function init() {
  for (const b of $('tabs').children) b.onclick = () => {
    lib.tab = b.dataset.t; lib.year = ''; lib.shown = PAGE;
    for (const x of $('tabs').children) x.classList.toggle('on', x === b);
    render();
  };
  for (const id of ['q', 'surahFilter', 'listFilter', 'formatFilter', 'sort']) {
    $(id).addEventListener('input', () => { lib.shown = PAGE; render(); });
  }
  $('moreBtn').onclick = () => { lib.shown += PAGE; render(); };
  $('addBtn').onclick = () => openForm();
  $('form').addEventListener('submit', submitForm);
  $('importBtn').onclick = () => { if (confirm('هجيب كل فيديوهات القناة الجديدة — ممكن ياخد كام دقيقة. أكمل؟')) pollImport(true); };
  $('selectBtn').onclick = () => { lib.selecting = !lib.selecting; lib.selected.clear(); render(); };
  $('bulkClose').onclick = () => { lib.selecting = false; lib.selected.clear(); render(); };
  $('bulkAll').onclick = () => { lib.list.slice(0, lib.shown).forEach((x) => lib.selected.add(x.id)); render(); };
  for (const b of $('bulk').querySelectorAll('[data-set]')) b.onclick = () => bulkSet(JSON.parse(b.dataset.set));
  $('bulkType').onchange = (e) => { if (e.target.value) bulkSet({ type: e.target.value }); e.target.value = ''; };
  $('bulkYearBtn').onclick = () => { if ($('bulkYear').value) bulkSet({ year: $('bulkYear').value }); };

  // لما تكتب العنوان نخمن السورة
  $('form').elements.title.addEventListener('input', (e) => {
    const f = $('form');
    if (f.elements.surah.value) return;
    const title = plain(e.target.value);
    const hits = lib.surahs.filter((x) => plain(x.name).length > 2 && title.includes(plain(x.name)));
    hits.sort((a, b) => b.name.length - a.name.length);
    if (hits[0]) f.elements.surah.value = hits[0].id;
  });

  try {
    lib.surahs = await getSurahs();
    for (const s of lib.surahs) $('form').elements.surah.add(new Option(`${arDigits(s.id)}. ${s.name}`, s.id));
  } catch {}
  await loadLibrary();
  if (adminMode && !lib.canEdit) {
    $('passDlg').showModal();
    $('passDlg').addEventListener('close', async () => {
      if ($('passDlg').returnValue !== 'ok') return;
      try { sessionStorage.setItem('adminPass', $('passInput').value); } catch {}
      await loadLibrary();
      if (!lib.canEdit) alert('الباسورد غلط');
    }, { once: true });
  }
  if (lib.canEdit) pollImport(false);
}

init();

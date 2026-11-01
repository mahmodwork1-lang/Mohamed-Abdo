// محرر الفيديو: شريط زمني فيه الخلفيات + الكلام + النصوص الإضافية + الصوت
// كل حاجة بتتسحب (تتحرك) أو تتمط من أطرافها، والتعديلات ليها تراجع (Ctrl+Z)
// الشريط بالوقت "جوه ملف الصوت"؛ الفيديو نفسه من audioIn لـ audioOut
const Editor = (() => {
  let pps = 60;            // بكسل لكل ثانية
  let t = 0;               // وقت المؤشر (من أول الفيديو)
  let sel = null;          // {kind: 'seg'|'text'|'bg'|'audio', obj}
  const undo = [], redo = [];
  const el = (id) => document.getElementById(id);
  const LABEL_W = 92;

  // ---------- تراجع ----------
  function snapshot() {
    return JSON.stringify({
      segs: state.segs, audioIn: state.audioIn, audioOut: state.audioOut, fx: state.fx,
      texts: state.texts.map(({ bbox, ...r }) => r), bgs: state.bgs.map(({ el: _e, frame: _f, ...r }) => r),
    });
  }
  function restore(json) {
    const s = JSON.parse(json);
    const els = new Map(state.bgs.map((b) => [b.src, b.el]));
    state.segs = s.segs; state.audioIn = s.audioIn; state.audioOut = s.audioOut;
    state.texts = s.texts;
    state.fx = s.fx || state.fx;
    FX.save(); FX.clearLayers(); FX.renderPanel();
    state.bgs = s.bgs.map((b) => ({ ...b, el: els.get(b.src) }));
    sel = null;
    refresh(); drawIdle();
  }
  function commit() { undo.push(snapshot()); if (undo.length > 100) undo.shift(); redo.length = 0; }
  function doUndo() { if (undo.length) { redo.push(snapshot()); restore(undo.pop()); } }
  function doRedo() { if (redo.length) { undo.push(snapshot()); restore(redo.pop()); } }

  // ---------- أدوات ----------
  const bufDur = () => (state.buf ? state.buf.duration : 10);
  const x = (bt) => bt * pps;                       // وقت جوه الصوت → بكسل
  const vt = (bt) => bt - state.audioIn;            // وقت جوه الصوت → وقت الفيديو
  const fmtT = (s) => (s < 0 ? '-' : '') + `${Math.floor(Math.abs(s) / 60)}:${(Math.abs(s) % 60).toFixed(1).padStart(4, '0')}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isSelected = (o) => sel && sel.obj === o;

  // ---------- الشريط ----------
  function renderTracks() {
    if (!state.buf) return;
    const W = Math.max(x(bufDur()) + 40, el('edScroll').clientWidth - LABEL_W);
    const inner = el('edInner');
    inner.style.width = W + 'px';
    for (const lane of inner.querySelectorAll('.lane:not(.audio)')) lane.innerHTML = '';
    for (const h of inner.querySelectorAll('.audio-handle')) h.remove();

    // المسطرة
    const ruler = el('edRuler');
    ruler.innerHTML = '';
    const step = pps >= 80 ? 1 : pps >= 30 ? 2 : pps >= 12 ? 5 : 10;
    for (let s = Math.ceil(-state.audioIn / step) * step; state.audioIn + s <= bufDur(); s += step) {
      const m = document.createElement('span');
      m.className = 'tick';
      m.style.left = x(state.audioIn + s) + 'px';
      m.textContent = fmtT(s).replace(/\.0$/, '');
      ruler.append(m);
    }
    // المنطقة اللي برّه الفيديو باهتة
    el('edShade').innerHTML = '';
    for (const [a, b] of [[0, state.audioIn], [state.audioOut, bufDur()]]) {
      const sh = document.createElement('div');
      sh.className = 'outside';
      sh.style.left = x(a) + 'px'; sh.style.width = Math.max(0, x(b) - x(a)) + 'px';
      el('edShade').append(sh);
    }

    // الخلفيات: ورا بعض من أول الفيديو، ولو خلصت بتتكرر (التكرار باهت)
    const bgLane = el('laneBg');
    const bgs = state.bgs;
    const total = bgs.reduce((a, b) => a + (b.len || 0), 0);
    if (!bgs.length) bgLane.innerHTML = '<span class="lane-hint">مفيش خلفية — اختارها من قسم الخلفيات في المونتاج</span>';
    if (total > 0) {
      let at = state.audioIn, rep = 0;
      while (at < state.audioOut && rep < 50) {
        for (const [i, b] of bgs.entries()) {
          if (!b.len || at >= state.audioOut) continue;
          const blk = block(bgLane, at, at + b.len, b.type === 'video' ? '🎞' : '🖼', rep ? 'bg ghost' : 'bg', rep ? null : { kind: 'bg', obj: b, i });
          if (b.thumb) blk.style.backgroundImage = `url("${b.thumb}")`;
          at += b.len;
        }
        rep++;
      }
    }

    // الكلام
    for (const s of state.segs) block(el('laneSeg'), s.start, s.end, (s.label ? `﴿${arDigits(s.label)}﴾ ` : '') + s.text, 'seg' + (s.flag ? ' warn' : ''), { kind: 'seg', obj: s });

    // النصوص الإضافية (لو متداخلة بتنزل سطر)
    const rows = [];
    const lt = el('laneText');
    if (!state.texts.length) lt.innerHTML = '<span class="lane-hint">دوس "+ نص" عشان تضيف كلام في أي مكان</span>';
    for (const tx of [...state.texts].sort((a, b) => a.start - b.start)) {
      let r = rows.findIndex((end) => end <= tx.start);
      if (r < 0) { r = rows.length; rows.push(0); }
      rows[r] = tx.end;
      const b = block(lt, tx.start, tx.end, tx.text || '(نص فاضي)', 'text', { kind: 'text', obj: tx });
      b.style.top = 4 + r * 26 + 'px'; b.style.height = '22px';
    }

    // طبقات المؤثرات (كل واحدة ليها وقتها، ومن غير وقت = الفيديو كله)
    const lf = el('laneFx'), fxRows = [];
    if (!state.fx.layers.length) lf.innerHTML = '<span class="lane-hint">ضيف ذبذبات أو مؤثرات من اللوحة اللي تحت</span>';
    for (const l of state.fx.layers) {
      const a = l.start ?? state.audioIn, b2 = l.end ?? state.audioOut;
      let r = fxRows.findIndex((end) => end <= a);
      if (r < 0) { r = fxRows.length; fxRows.push(0); }
      fxRows[r] = b2;
      const b = block(lf, a, b2, l.name, 'fxl', { kind: 'fxl', obj: l });
      b.style.top = 4 + r * 26 + 'px'; b.style.height = '22px';
    }
    lf.style.height = Math.max(38, 8 + fxRows.length * 26) + 'px';
    el('lblFx').style.height = lf.style.height;
    lt.style.height = Math.max(38, 8 + rows.length * 26) + 'px';
    el('lblText').style.height = lt.style.height;

    // الصوت
    drawWave();
    for (const [which, at] of [['in', state.audioIn], ['out', state.audioOut]]) {
      const h = document.createElement('div');
      h.className = 'audio-handle ' + which;
      h.style.left = x(at) - 6 + 'px';
      h.title = which === 'in' ? 'اسحب: بداية الصوت' : 'اسحب: نهاية الصوت';
      h.onpointerdown = (e) => startDrag(e, { kind: 'audio', which });
      el('laneAudio').append(h);
    }
    placeHead();
  }

  function block(lane, a, b, label, cls, item) {
    const d = document.createElement('div');
    d.className = 'blk ' + cls + (item && sel && sel.obj === item.obj ? ' sel' : '');
    d.style.left = x(a) + 'px';
    d.style.width = Math.max(4, x(b) - x(a)) + 'px';
    d.innerHTML = `<span>${esc(label)}</span>`;
    if (item) {
      d.innerHTML += '<i class="edge l"></i><i class="edge r"></i>';
      d.onpointerdown = (e) => {
        const edge = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
        select(item);
        startDrag(e, { ...item, edge });
      };
    }
    lane.append(d);
    return d;
  }

  function drawWave() {
    const c = el('edWave');
    const W = Math.ceil(x(bufDur()));
    c.width = Math.min(32000, W); c.style.width = W + 'px';
    const g = c.getContext('2d'), H = c.height;
    g.clearRect(0, 0, c.width, H);
    const d = state.buf.getChannelData(0);
    const per = d.length / c.width;
    for (let px = 0; px < c.width; px++) {
      let m = 0;
      for (let j = Math.floor(px * per), e = Math.floor((px + 1) * per); j < e; j += 8) m = Math.max(m, Math.abs(d[j]));
      const bt = (px / c.width) * bufDur();
      g.fillStyle = bt >= state.audioIn && bt <= state.audioOut ? '#d4af37' : '#3d5c4f';
      const h = Math.max(1, m * H * 0.95);
      g.fillRect(px, (H - h) / 2, 1, h);
    }
  }

  function placeHead() {
    const h = el('edHead');
    h.style.left = x(state.audioIn + t) + 'px';
    el('edTime').textContent = `${fmtT(t)} / ${fmtT(D())}`;
  }

  // ---------- السحب ----------
  let drag = null;
  function startDrag(e, info) {
    if (e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    commit();
    if (info.kind === 'fxl') { info.obj.start ??= state.audioIn; info.obj.end ??= state.audioOut; }
    drag = { ...info, x0: e.clientX, moved: false, orig: info.obj ? { ...info.obj } : { audioIn: state.audioIn, audioOut: state.audioOut } };
    // الشاشات اللازقة في بعض بتتحرك مع بعض (عشان مايبقاش فيه فراغ)
    if (info.kind === 'seg') {
      const i = state.segs.indexOf(info.obj), prev = state.segs[i - 1], next = state.segs[i + 1];
      drag.linkPrev = prev && Math.abs(prev.end - info.obj.start) < 0.06;
      drag.linkNext = next && Math.abs(next.start - info.obj.end) < 0.06;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function onMove(e) {
    if (!drag) return;
    const dt = (e.clientX - drag.x0) / pps;
    if (Math.abs(e.clientX - drag.x0) > 2) drag.moved = true;
    const o = drag.obj, O = drag.orig;
    const snap = (v) => (e.shiftKey ? v : Math.round(v * 20) / 20); // كل ٠.٠٥ ثانية
    if (drag.kind === 'seg') {
      const segs = state.segs, i = segs.indexOf(o), prev = segs[i - 1], next = segs[i + 1];
      const lo = prev ? prev.start + 0.2 : 0, hi = next ? next.end - 0.2 : bufDur();
      if (drag.edge === 'l') {
        o.start = clamp(snap(O.start + dt), lo, o.end - 0.2);
        // الشاشة اللي قبلها لازقة فيها؟ نحرك نهايتها معاها
        if (drag.linkPrev) prev.end = o.start;
      } else if (drag.edge === 'r') {
        o.end = clamp(snap(O.end + dt), o.start + 0.2, hi);
        if (drag.linkNext) next.start = o.end;
      } else {
        const len = O.end - O.start;
        const minS = prev ? prev.end : 0, maxE = next ? next.start : bufDur();
        o.start = clamp(snap(O.start + dt), minS, maxE - len); o.end = o.start + len;
      }
    } else if (drag.kind === 'text' || drag.kind === 'fxl') {
      if (drag.edge === 'l') o.start = clamp(snap(O.start + dt), 0, o.end - 0.3);
      else if (drag.edge === 'r') o.end = clamp(snap(O.end + dt), o.start + 0.3, bufDur());
      else { const len = O.end - O.start; o.start = clamp(snap(O.start + dt), 0, bufDur() - len); o.end = o.start + len; }
    } else if (drag.kind === 'bg') {
      const maxLen = o.type === 'video' && o.el ? Math.max(0.5, o.el.duration - (o.trimIn || 0)) : 600;
      if (drag.edge === 'r') o.len = clamp(snap(O.len + dt), 0.5, maxLen);
      else if (drag.edge === 'l' && o.type === 'video') {
        // نقص من أول الفيديو
        const d = clamp(snap(dt), -(O.trimIn || 0), O.len - 0.5);
        o.trimIn = (O.trimIn || 0) + d; o.len = O.len - d;
      } else if (drag.edge === 'move') {
        // سحب لترتيب الخلفيات
        const i = state.bgs.indexOf(o);
        const j = clamp(i + Math.round(dt / Math.max(1, O.len)), 0, state.bgs.length - 1);
        if (j !== i) { state.bgs.splice(i, 1); state.bgs.splice(j, 0, o); drag.x0 = e.clientX; }
      }
    } else if (drag.kind === 'audio') {
      if (drag.which === 'in') state.audioIn = clamp(snap(O.audioIn + dt), 0, state.audioOut - 0.5);
      else state.audioOut = clamp(snap(O.audioOut + dt), state.audioIn + 0.5, bufDur());
      // أول/آخر شاشة تمشي مع الصوت
      const f = state.segs[0], l = state.segs[state.segs.length - 1];
      if (f && Math.abs(f.start - O.audioIn) < 0.3 && drag.which === 'in') f.start = Math.min(state.audioIn, f.end - 0.2);
      if (l && Math.abs(l.end - O.audioOut) < 0.3 && drag.which === 'out') l.end = Math.max(state.audioOut, l.start + 0.2);
    }
    renderTracks();
    // المعاينة تبيّن مكان التعديل
    const showAt = drag.kind === 'audio' ? (drag.which === 'in' ? 0 : D() - 0.05)
      : drag.kind === 'seg' || drag.kind === 'text' || drag.kind === 'fxl' ? vt(drag.edge === 'r' ? o.end - 0.05 : o.start + 0.05) : t;
    if (!isPlaying()) drawFrame(clamp(showAt, 0, D()));
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    if (drag && !drag.moved) undo.pop(); // مجرد ضغطة — مفيش تعديل
    drag = null;
    renderProps();
    drawIdle();
  }

  // ---------- الاختيار + الخصائص ----------
  function select(item) {
    sel = item;
    if (item?.kind === 'fxl') {
      const o = item.obj;
      if (o.start != null && (t < vt(o.start) || t >= vt(o.end))) setTime(clamp(vt(o.start) + 0.35, 0, D()));
    } else if (item?.kind === 'seg' || item?.kind === 'text') {
      const o = item.obj;
      const v = vt(o.start);
      if (t < v || t >= vt(o.end)) setTime(clamp(v + 0.05, 0, D()));
    }
    renderTracks(); renderProps(); drawIdle();
  }

  const nudger = (label, get, set) => `
    <div class="nudge" data-k="${label}"><span>${label}</span>
      <button data-d="-0.5">-٠.٥</button><button data-d="-0.1">-٠.١</button>
      <input type="number" step="0.1" value="${get().toFixed(2)}" dir="ltr">
      <button data-d="0.1">+٠.١</button><button data-d="0.5">+٠.٥</button></div>`;

  function bindNudge(box, label, get, set) {
    const n = box.querySelector(`.nudge[data-k="${label}"]`);
    const apply = (v) => { commit(); set(v); refresh(); drawIdle(); };
    n.querySelectorAll('button').forEach((b) => (b.onclick = () => apply(get() + +b.dataset.d)));
    n.querySelector('input').onchange = (e) => apply(+e.target.value);
  }

  // قائمة الحركة لشاشة واحدة أو نص واحد ('' = زي باقي الفيديو)
  const animSelect = (o, first) => `<label>حركة الكلام <select id="pAnim"><option value="">${first}</option>${FX_ANIMS.map(([v, n]) => `<option value="${v}" ${o.anim === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  function bindAnim(o) {
    el('pAnim').onchange = (e) => { commit(); o.anim = e.target.value; drawIdle(); FX.previewLoop(); };
  }

  // قص الشاشة عند المؤشر: الكلام بيتقسم بالكلمات على قد الوقت
  function splitSeg() {
    const bt = state.audioIn + t;
    const s = state.segs.find((x) => x.start < bt && bt < x.end);
    if (!s) return setStatus('حط المؤشر على شاشة كلام الأول');
    if (bt - s.start < 0.2 || s.end - bt < 0.2) return setStatus('المؤشر قريب أوي من طرف الشاشة');
    const f = (bt - s.start) / (s.end - s.start);
    const cut = (txt) => {
      const w = String(txt || '').split(/\s+/).filter(Boolean);
      if (w.length < 2) return [w.join(' '), ''];
      const n = clamp(Math.round(w.length * f), 1, w.length - 1);
      return [w.slice(0, n).join(' '), w.slice(n).join(' ')];
    };
    const [a, b] = cut(s.text);
    if (!b) return setStatus('الشاشة دي كلمة واحدة — مش هينفع تتقص');
    commit();
    const [sa, sb] = cut(s.sub);
    const s2 = { ...s, text: b, sub: sb, start: bt };
    Object.assign(s, { text: a, sub: sa, end: bt, label: '' });
    state.segs.splice(state.segs.indexOf(s) + 1, 0, s2);
    sel = { kind: 'seg', obj: s2 };
    refresh(); drawIdle();
  }

  function renderProps() {
    const box = el('edProps');
    if (!sel) {
      box.innerHTML = '<p class="hint">👆 دوس على أي حاجة في الشريط عشان تعدّلها — واسحبها عشان تحركها، أو اسحب طرفها عشان تطوّلها/تقصّرها.<br>⌨️ مسافة = تشغيل/إيقاف · S = قص الشاشة عند المؤشر · ← → = تحريك المختار ٠.١ ثانية · Ctrl+Z = تراجع</p>';
      return;
    }
    const o = sel.obj;
    if (sel.kind === 'seg') {
      box.innerHTML = `<h3>📖 الشاشة</h3>
        <label>الكلام <textarea rows="2" id="pText">${esc(o.text)}</textarea></label>
        <label>${state.subName || 'شرح'} تحت الكلام <textarea rows="3" id="pSub">${esc(o.sub || '')}</textarea></label>
        ${animSelect(o, 'زي باقي الفيديو')}
        ${nudger('بداية', () => vt(o.start))}${nudger('نهاية', () => vt(o.end))}
        <div class="btns"><button class="btn small" id="pPlay">▶ اسمع الشاشة دي</button><button class="btn small" id="pMerge" ${state.segs[state.segs.indexOf(o) + 1] ? '' : 'disabled'}>🔗 ادمجها مع اللي بعدها</button><button class="btn small danger" id="pDel">🗑 احذف الشاشة</button></div>`;
      bindAnim(o);
      el('pMerge').onclick = () => {
        const i = state.segs.indexOf(o), n = state.segs[i + 1];
        if (!n) return;
        commit();
        Object.assign(o, { text: o.text + ' ' + n.text, sub: [o.sub, n.sub].filter(Boolean).join(' '), end: n.end, label: n.label });
        state.segs.splice(i + 1, 1);
        refresh(); drawIdle();
      };
      bindNudge(box, 'بداية', () => vt(o.start), (v) => { o.start = clamp(v + state.audioIn, 0, o.end - 0.2); });
      bindNudge(box, 'نهاية', () => vt(o.end), (v) => { o.end = clamp(v + state.audioIn, o.start + 0.2, bufDur()); });
      el('pText').oninput = (e) => { o.text = e.target.value; o.flag = false; renderTracks(); drawIdle(); };
      el('pText').onfocus = el('pSub').onfocus = () => commit();
      el('pSub').oninput = (e) => { o.sub = e.target.value; drawIdle(); };
      el('pPlay').onclick = () => play('preview', Math.max(0, vt(o.start) - 0.2));
      el('pDel').onclick = () => { commit(); state.segs.splice(state.segs.indexOf(o), 1); sel = null; refresh(); drawIdle(); };
    } else if (sel.kind === 'text') {
      box.innerHTML = `<h3>✍️ نص إضافي <small class="hint">— اسحبه على الشاشة عشان تحرّك مكانه</small></h3>
        <label>الكلام <textarea rows="2" id="pText">${esc(o.text)}</textarea></label>
        <div class="row"><label>الخط <select id="pFont"></select></label><label>الحجم <input id="pSize" type="range" min="20" max="160" value="${o.size}"></label></div>
        <div class="row"><label>اللون <input id="pColor" type="color" value="${o.color}"></label>
          <label class="check"><input id="pBold" type="checkbox" ${o.bold ? 'checked' : ''}> عريض</label>
          <label class="check"><input id="pBox" type="checkbox" ${o.box ? 'checked' : ''}> خلفية للنص</label></div>
        ${animSelect(o, 'من غير حركة')}
        <div class="btns"><span class="hint">المكان:</span><button class="btn small" data-y="0.18">فوق</button><button class="btn small" data-y="0.5">النص</button><button class="btn small" data-y="0.82">تحت</button></div>
        ${nudger('بداية', () => vt(o.start))}${nudger('نهاية', () => vt(o.end))}
        <div class="btns"><button class="btn small" id="pAll">↔️ طول الفيديو كله</button><button class="btn small" id="pDup">📄 نسخة</button><button class="btn small danger" id="pDel">🗑 احذف النص</button></div>`;
      bindAnim(o);
      el('pDup').onclick = () => { commit(); const { bbox, ...r } = o; const c = { ...r, y: clamp(o.y + 0.07, 0.04, 0.96) }; state.texts.push(c); sel = { kind: 'text', obj: c }; refresh(); drawIdle(); };
      fillFontSelect(el('pFont'), o.font);
      bindNudge(box, 'بداية', () => vt(o.start), (v) => { o.start = clamp(v + state.audioIn, 0, o.end - 0.3); });
      bindNudge(box, 'نهاية', () => vt(o.end), (v) => { o.end = clamp(v + state.audioIn, o.start + 0.3, bufDur()); });
      const live = (k, fn) => { el(k).onfocus = () => commit(); el(k).oninput = (e) => { fn(e.target); renderTracks(); loadFonts().then(() => drawIdle()); }; };
      live('pText', (i) => { o.text = i.value; });
      live('pFont', (i) => { o.font = i.value; });
      live('pSize', (i) => { o.size = +i.value; });
      live('pColor', (i) => { o.color = i.value; });
      el('pBold').onchange = (e) => { commit(); o.bold = e.target.checked; drawIdle(); };
      el('pBox').onchange = (e) => { commit(); o.box = e.target.checked; drawIdle(); };
      box.querySelectorAll('[data-y]').forEach((b) => (b.onclick = () => { commit(); o.y = +b.dataset.y; o.x = 0.5; drawIdle(); }));
      el('pAll').onclick = () => { commit(); o.start = state.audioIn; o.end = state.audioOut; refresh(); drawIdle(); };
      el('pDel').onclick = () => { commit(); state.texts.splice(state.texts.indexOf(o), 1); sel = null; refresh(); drawIdle(); };
    } else if (sel.kind === 'bg') {
      box.innerHTML = `<h3>🖼 خلفية رقم ${arDigits(state.bgs.indexOf(o) + 1)}</h3>
        <p class="hint">${o.type === 'video' ? 'الفيديو بيشتغل بسرعته العادية. اسحب طرفه اليمين عشان تقصّره، واليسار عشان تبدأ من حتة متأخرة فيه.' : 'صورة'}</p>
        ${nudger('المدة', () => o.len)}${o.type === 'video' ? nudger('يبدأ من', () => o.trimIn || 0) : ''}
        <div class="btns"><button class="btn small" id="pLeft">⬅️ قبل</button><button class="btn small" id="pRight">بعد ➡️</button><button class="btn small danger" id="pDel">🗑 شيلها</button></div>`;
      const maxLen = () => (o.type === 'video' && o.el ? Math.max(0.5, o.el.duration - (o.trimIn || 0)) : 600);
      bindNudge(box, 'المدة', () => o.len, (v) => { o.len = clamp(v, 0.5, maxLen()); });
      if (o.type === 'video') bindNudge(box, 'يبدأ من', () => o.trimIn || 0, (v) => { o.trimIn = clamp(v, 0, (o.el?.duration || 60) - 0.5); o.len = Math.min(o.len, maxLen()); });
      const move = (d) => { const i = state.bgs.indexOf(o), j = i + d; if (j < 0 || j >= state.bgs.length) return; commit(); state.bgs.splice(i, 1); state.bgs.splice(j, 0, o); refresh(); drawIdle(); };
      el('pLeft').onclick = () => move(-1);
      el('pRight').onclick = () => move(1);
      el('pDel').onclick = () => { commit(); state.bgs.splice(state.bgs.indexOf(o), 1); sel = null; bgChanged(); refresh(); };
    } else if (sel.kind === 'fxl') {
      box.innerHTML = `<h3>${esc(o.name)} <small class="hint">— شكله وألوانه في اللوحة اللي تحت</small></h3>
        ${nudger('بداية', () => vt(o.start ?? state.audioIn))}${nudger('نهاية', () => vt(o.end ?? state.audioOut))}
        <div class="btns"><button class="btn small" id="pAll">↔️ طول الفيديو كله</button><button class="btn small" id="pOpen">🎨 عدّل شكله</button></div>`;
      el('pOpen').onclick = () => FX.openLayer(o);
      bindNudge(box, 'بداية', () => vt(o.start ?? state.audioIn), (v) => { o.end ??= state.audioOut; o.start = clamp(v + state.audioIn, 0, o.end - 0.3); });
      bindNudge(box, 'نهاية', () => vt(o.end ?? state.audioOut), (v) => { o.start ??= state.audioIn; o.end = clamp(v + state.audioIn, o.start + 0.3, bufDur()); });
      el('pAll').onclick = () => { commit(); o.start = null; o.end = null; refresh(); drawIdle(); };
    } else if (sel.kind === 'audio') {
      box.innerHTML = `<h3>🔊 الصوت</h3><p class="hint">لو الصوت بيبدأ متأخر أو بيتقطع بدري، حرّك البداية/النهاية (أو اسحب العلامات الصفرا في الشريط).</p>
        ${nudger('بداية الصوت', () => state.audioIn)}${nudger('نهاية الصوت', () => state.audioOut)}`;
      bindNudge(box, 'بداية الصوت', () => state.audioIn, (v) => { state.audioIn = clamp(v, 0, state.audioOut - 0.5); });
      bindNudge(box, 'نهاية الصوت', () => state.audioOut, (v) => { state.audioOut = clamp(v, state.audioIn + 0.5, bufDur()); });
    }
  }

  // ---------- المؤشر ----------
  function setTime(v, fromPlay) {
    t = clamp(v, 0, D());
    placeHead();
    if (fromPlay) {
      // نخلي المؤشر ظاهر وهو ماشي
      const sc = el('edScroll'), px = x(state.audioIn + t) + LABEL_W;
      if (px < sc.scrollLeft + LABEL_W || px > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = px - LABEL_W - 60;
    } else if (!isPlaying()) drawFrame(t);
  }

  function seekFromEvent(e) {
    const r = el('edInner').getBoundingClientRect();
    const bt = (e.clientX - r.left) / pps;
    const was = isPlaying();
    if (was) stop();
    setTime(bt - state.audioIn);
    if (was) play('preview', t);
  }

  // ---------- سحب النص على المعاينة ----------
  // بيشتغل على الشاشة الكبيرة وعلى المعاينة الصغيرة بتاعة المونتاج
  function onCanvasDown(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const pt = (ev) => ({ x: ((ev.clientX - r.left) / r.width) * canvas.width, y: ((ev.clientY - r.top) / r.height) * canvas.height });
    const p = pt(e);
    const txt = [...state.texts].reverse().find((tx) => tx.bbox && p.x >= tx.bbox.x && p.x <= tx.bbox.x + tx.bbox.w && p.y >= tx.bbox.y && p.y <= tx.bbox.y + tx.bbox.h);
    const grip = !txt && FX.handleAt(p.x, p.y);
    const hit = txt || grip || FX.hit(p.x, p.y);
    if (!hit) return;
    e.preventDefault();
    commit();
    if (!txt) FX.touchPhoto(hit);
    sel = { kind: txt ? 'text' : 'fxl', obj: hit };
    renderTracks(); renderProps();
    const o = hit, ox = hit.x, oy = hit.y, size0 = hit.size;
    const cx = o.x * canvas.width, cy = o.y * canvas.height, d0 = Math.max(10, Math.hypot(p.x - cx, p.y - cy));
    const move = (ev) => {
      const q = pt(ev);
      if (grip) o.size = Math.round(clamp((size0 * Math.hypot(q.x - cx, q.y - cy)) / d0, 5, 150) * 10) / 10;
      else {
        o.x = clamp(ox + (q.x - p.x) / canvas.width, 0.02, 0.98);
        o.y = clamp(oy + (q.y - p.y) / canvas.height, 0.02, 0.98);
      }
      if (!isPlaying()) drawFrame(t);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', move); if (!txt) FX.afterDrag(); }, { once: true });
  }

  // عجلة الماوس فوق الصورة بتكبرها وتصغرها
  function onCanvasWheel(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * canvas.width, y = ((e.clientY - r.top) / r.height) * canvas.height;
    if (FX.wheelResize(x, y, e.deltaY)) e.preventDefault();
  }

  function addText() {
    if (!state.buf) return;
    commit();
    const start = state.audioIn + t;
    const tx = { text: 'اكتب هنا', x: 0.5, y: 0.82, size: 56, font: 'Cairo', color: '#ffffff', bold: true, box: true, start, end: Math.min(bufDur(), start + 4) };
    state.texts.push(tx);
    sel = { kind: 'text', obj: tx };
    refresh(); drawIdle();
    el('pText')?.select();
  }

  // ---------- عام ----------
  function refresh() {
    if (el('editor').hidden) return;
    if (sel && sel.kind !== 'audio' && !(state.segs.includes(sel.obj) || state.texts.includes(sel.obj) || state.bgs.includes(sel.obj) || state.fx.layers.includes(sel.obj))) sel = null;
    renderTracks(); renderProps();
    el('edPlay').textContent = isPlaying() ? '⏸' : '▶';
    el('edUndo').disabled = !undo.length; el('edRedo').disabled = !redo.length;
    if (el('fxPlay')) {
      el('fxPlay').textContent = el('edPlay').textContent;
      el('fxUndo').disabled = !undo.length; el('fxRedo').disabled = !redo.length;
    }
  }

  function open() {
    el('editor').hidden = false;
    el('edFx').hidden = false;
    t = 0; sel = null; undo.length = 0; redo.length = 0;
    // نكبّر/نصغّر عشان الفيديو كله يبان
    const w = el('edScroll').clientWidth - LABEL_W - 30;
    pps = clamp(w / Math.max(5, D() + 2), 8, 200);
    el('edZoom').value = pps;
    refresh();
    FX.renderPanel();
    requestAnimationFrame(() => { el('edScroll').scrollLeft = x(state.audioIn) - 20; });
  }

  function init() {
    el('edPlay').onclick = () => (isPlaying() ? stop() : play('preview', t));
    el('edAddText').onclick = addText;
    el('edSplit').onclick = splitSeg;
    el('edUndo').onclick = doUndo; el('edRedo').onclick = doRedo;
    el('edZoom').oninput = (e) => {
      const sc = el('edScroll'), center = (sc.scrollLeft + sc.clientWidth / 2 - LABEL_W) / pps;
      pps = +e.target.value; renderTracks();
      sc.scrollLeft = center * pps - sc.clientWidth / 2 + LABEL_W;
    };
    el('edRuler').onpointerdown = seekFromEvent;
    for (const id of ['laneBg', 'laneSeg', 'laneText', 'laneFx']) el(id).addEventListener('pointerdown', (e) => { if (e.target.id === id) { sel = null; seekFromEvent(e); refresh(); } });
    el('laneAudio').addEventListener('pointerdown', (e) => { if (!e.target.classList.contains('audio-handle')) { select({ kind: 'audio', obj: null }); seekFromEvent(e); } });
    canvas.addEventListener('pointerdown', onCanvasDown);
    canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
    document.addEventListener('keydown', (e) => {
      if (el('editor').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); el('edPlay').click(); }
      else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); splitSeg(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && sel?.obj && sel.kind !== 'bg' && sel.kind !== 'fxl') {
        e.preventDefault();
        const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 0.1);
        commit(); sel.obj.start += d; sel.obj.end += d; refresh(); drawIdle();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.kind === 'text') {
        commit(); state.texts.splice(state.texts.indexOf(sel.obj), 1); sel = null; refresh(); drawIdle();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.kind === 'fxl') {
        commit(); state.fx.layers.splice(state.fx.layers.indexOf(sel.obj), 1); sel = null; refresh(); drawIdle(); FX.renderPanel();
      }
    });
  }

  return { init, open, refresh, commit, select, isSelected, setTime, canvasDown: onCanvasDown, canvasWheel: onCanvasWheel, time: () => t };
})();
window.Editor = Editor;

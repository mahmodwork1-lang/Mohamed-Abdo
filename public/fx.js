// تأثيرات المونتاج: حركة الكلام + طبقات الذبذبات والجو + الخلفية والكاميرا + الصوت + اللوحة
// الكلام بيترسم الأول على طبقة لوحده وبعدين الطبقة كلها بتتحرك — عشان الحروف العربي تفضل موصولة
const FX_DEFAULT = {
  anim: 'none', amp: 16, speed: 0.6, waveLen: 40, stroke: 0, strokeColor: '#000000', glow: 0, glowColor: '#f0d47a', textGrad: false, textColor2: '#f0d47a', preset: null, textSide: 'center',
  bright: 100, contrast: 100, sat: 100, blur: 0, vignette: 0, grade: 'none', tint: 0, tintColor: '#d4af37', camera: 'none', camAmt: 12, transition: 'fade', transDur: 0.8,
  ...AFX_DEFAULT,
  vIn: 0, vOut: 0, letterbox: 0, progress: false, frame: false, quality: 8, layers: [],
};
const FX_ANIMS = [
  ['none', 'بدون حركة'], ['wave', '🌊 موجة'], ['ripple', '💧 تموّج مية'], ['flag', '🎏 رفرفة'], ['float', '🎈 طفو هادي'], ['pulse', '💓 نبض'], ['voice', '🔊 يتنفس مع الصوت'], ['shine', '🌟 لمعة ماشية'],
  ['words', '💬 كلمة كلمة'], ['karaoke', '🎤 يتلوّن مع التلاوة'], ['reveal', '✍️ يتكتب مع التلاوة'], ['zoom', '🔍 يكبر وهو داخل'], ['bounce', '🏀 ينط وهو داخل'], ['rise', '⬆️ يطلع من تحت'],
];
const FX_LOOPING = new Set(['wave', 'ripple', 'flag', 'float', 'pulse', 'shine']);
const FX_GRADES = {
  warm: 'sepia(.25) saturate(1.15) hue-rotate(-8deg)', cool: 'saturate(.9) hue-rotate(12deg) brightness(1.02)', golden: 'sepia(.35) saturate(1.4) brightness(1.04)',
  teal: 'contrast(1.12) saturate(1.2) hue-rotate(-12deg)', vintage: 'sepia(.45) contrast(.92) brightness(1.05)', night: 'brightness(.75) saturate(.8) hue-rotate(20deg)',
  dream: 'brightness(1.1) saturate(1.25) contrast(.9)', bw: 'grayscale(1) contrast(1.1)',
};
const FX_TABS = [
  ['✨ الكلام', [
    { k: 'anim', label: 'حركة الكلام', type: 'select', opts: FX_ANIMS },
    { k: 'amp', label: 'قوة الحركة', type: 'range', min: 2, max: 60, show: (f) => FX_LOOPING.has(f.anim) && f.anim !== 'shine' },
    { k: 'speed', label: 'السرعة', type: 'range', min: 0.1, max: 2.5, step: 0.1, show: (f) => FX_LOOPING.has(f.anim) },
    { k: 'waveLen', label: 'عرض الموجة', type: 'range', min: 15, max: 100, show: (f) => ['wave', 'ripple', 'flag'].includes(f.anim) },
    { k: 'textGrad', label: 'لون متدرج للكلام', type: 'check' },
    { k: 'textColor2', label: 'اللون التاني', type: 'color', show: (f) => f.textGrad },
    { k: 'stroke', label: 'إطار حوالين الحروف', type: 'range', min: 0, max: 12 },
    { k: 'strokeColor', label: 'لون الإطار', type: 'color', show: (f) => f.stroke > 0 },
    { k: 'glow', label: 'توهج', type: 'range', min: 0, max: 80 },
    { k: 'glowColor', label: 'لون التوهج', type: 'color', show: (f) => f.glow > 0 },
  ]],
  ['🎵 ذبذبات الصوت', 'viz'],
  ['🌟 مؤثرات الجو', 'amb'],
  ['🖼 الخلفية والكاميرا', [
    { k: 'grade', label: 'لون الصورة', type: 'select', opts: [['none', 'طبيعي'], ['warm', 'دافي'], ['golden', 'ذهبي'], ['cool', 'بارد'], ['teal', 'سينمائي'], ['vintage', 'قديم'], ['night', 'ليل'], ['dream', 'حالم'], ['bw', 'أبيض وأسود']] },
    { k: 'camera', label: 'حركة الكاميرا', type: 'select', opts: [['none', 'ثابتة'], ['zoomIn', 'تقرّب بالراحة'], ['zoomOut', 'تبعد بالراحة'], ['panR', 'تمشي يمين'], ['panL', 'تمشي شمال'], ['breath', 'تتنفس'], ['voice', 'تنبض مع الصوت']] },
    { k: 'camAmt', label: 'قوة حركة الكاميرا', type: 'range', min: 2, max: 40, show: (f) => f.camera !== 'none' },
    { k: 'bright', label: 'الإضاءة', type: 'range', min: 40, max: 160 },
    { k: 'contrast', label: 'الحدة', type: 'range', min: 50, max: 160 },
    { k: 'sat', label: 'الألوان', type: 'range', min: 0, max: 200 },
    { k: 'blur', label: 'تغبيش', type: 'range', min: 0, max: 30 },
    { k: 'vignette', label: 'تغميق الأطراف', type: 'range', min: 0, max: 100 },
    { k: 'tint', label: 'صبغة لون', type: 'range', min: 0, max: 70 },
    { k: 'tintColor', label: 'لون الصبغة', type: 'color', show: (f) => f.tint > 0 },
    { k: 'transition', label: 'الانتقال بين الخلفيات', type: 'select', opts: [['none', 'قطع مباشر'], ['fade', 'تداخل ناعم'], ['slide', 'تنزلق من الجنب'], ['zoom', 'زووم'], ['black', 'يغمق ويفتح'], ['white', 'فلاش أبيض']] },
    { k: 'transDur', label: 'مدة الانتقال (ثانية)', type: 'range', min: 0.2, max: 2.5, step: 0.1, show: (f) => f.transition !== 'none' },
  ]],
  ['🎬 الفيديو', [
    { k: 'vIn', label: 'يفتح من الأسود (ثانية)', type: 'range', min: 0, max: 3, step: 0.1 },
    { k: 'vOut', label: 'يقفل على الأسود (ثانية)', type: 'range', min: 0, max: 3, step: 0.1 },
    { k: 'letterbox', label: 'شرايط سينما سودة', type: 'range', min: 0, max: 20 },
    { k: 'progress', label: 'شريط تقدم الفيديو', type: 'check' },
    { k: 'frame', label: 'إطار زخرفي ثابت', type: 'check' },
    { k: 'quality', label: 'جودة الملف', type: 'select', num: true, opts: [[5, 'خفيفة (حجم أصغر)'], [8, 'عالية'], [16, 'ممتازة (حجم أكبر)']] },
  ]],
];
// خصائص كل طبقة: اللي بيظهر في اللوحة لما تختارها
const FX_CTRL = {
  shape: { label: 'الشكل', type: 'select', opts: () => Object.entries(FXLIB.SHAPES).map(([k, v]) => [k, v[0]]) },
  style: { label: 'النوع', type: 'select', opts: () => [['bars', 'أعمدة'], ['double', 'أعمدة لجوه ولبرّه'], ['line', 'خط'], ['fill', 'خط مليان'], ['dots', 'نقط']] },
  bars: { label: 'العدد', type: 'range', min: 16, max: 220 }, count: { label: 'العدد', type: 'range', min: 1, max: 8 },
  amount: { label: 'الكمية', type: 'range', min: 10, max: 300 }, size: { label: 'الحجم', type: 'range', min: 15, max: 150 },
  height: { label: 'طول الذبذبة', type: 'range', min: 15, max: 250 }, thick: { label: 'السُمك', type: 'range', min: 1, max: 24 },
  sens: { label: 'حساسية الصوت', type: 'range', min: 0.2, max: 2.5, step: 0.1 }, rot: { label: 'اللف', type: 'range', min: -10, max: 10, step: 0.5 },
  speed: { label: 'السرعة', type: 'range', min: 0.1, max: 5, step: 0.1 }, inset: { label: 'البعد عن الحافة', type: 'range', min: 0, max: 140 },
  color: { label: 'اللون', type: 'color' }, color2: { label: 'اللون التاني', type: 'color' },
  glow: { label: 'توهج', type: 'range', min: 0, max: 70 }, opacity: { label: 'الوضوح', type: 'range', min: 0.05, max: 1, step: 0.05 },
  base: { label: 'خط أساسي تحت الذبذبات', type: 'check' }, pulse: { label: 'ينبض مع الصوت', type: 'check' }, mirror: { label: 'متماثل فوق وتحت', type: 'check' },
  front: { label: 'فوق الكلام', type: 'check' },
};
const FX_KEYS = {
  shape: ['shape', 'style', 'bars', 'size', 'height', 'thick', 'sens', 'rot', 'pulse', 'base'], bars: ['bars', 'size', 'height', 'thick', 'sens', 'mirror'], blocks: ['bars', 'size', 'height', 'sens'],
  line: ['size', 'height', 'thick', 'sens'], siri: ['size', 'height', 'sens'], ribbons: ['height', 'speed', 'sens'], timeline: ['size', 'height', 'thick', 'sens'], runner: ['size', 'height', 'thick', 'sens'],
  frameRun: ['inset', 'thick', 'count', 'speed', 'sens', 'base'], frameFill: ['inset', 'thick'], frameBars: ['inset', 'bars', 'height', 'thick', 'sens'], frameNeon: ['inset', 'thick', 'sens'],
  ripples: ['size', 'count', 'thick', 'speed', 'sens'], orbit: ['size', 'bars', 'thick', 'rot', 'height', 'sens'], spiral: ['size', 'bars', 'thick', 'rot', 'height', 'sens'], sunburst: ['size', 'bars', 'height', 'rot', 'sens'], dotgrid: ['size', 'thick', 'sens'],
  rays: ['size', 'speed'], leak: ['size', 'speed', 'color2'], grain: [],
};
const FX_NOGLOW = new Set(['blocks', 'siri', 'ribbons', 'orbit', 'spiral', 'dotgrid']);
const FX_PALETTES = [['#f0d47a', '#ffffff'], ['#d4af37', '#fff3c4'], ['#ff5d7e', '#ffc4d0'], ['#7fe0ff', '#b18cff'], ['#4ee08a', '#c8ff8a'], ['#ff9a4d', '#ff5da8'], ['#ffffff', '#9fb4c8']];

const FX = (() => {
  const KEY = 'reelFx', SAVED = 'reelFxSaved';
  const fresh = (o = {}) => ({ ...FX_DEFAULT, layers: [], ...o });
  // كل فتحة للصفحة بتبدأ من غير تأثيرات (مفيش حاجة بترجع لوحدها) — بنفتكر جودة الملف بس
  const load = () => {
    try { return fresh({ quality: +JSON.parse(localStorage.getItem(KEY) || '{}').quality || FX_DEFAULT.quality }); } catch { return fresh(); }
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ quality: state.fx.quality })); } catch {} };

  // ---------- طبقة الكلام ----------
  const layers = new Map();
  const clearLayers = () => layers.clear();
  // spec: {lines, font, lh, color}
  function layerOf(spec) {
    const W = canvas.width, k = Math.min(W, canvas.height) / 1080, f = state.fx;
    const key = [W, spec.font, spec.lh, spec.color, f.stroke, f.strokeColor, f.glow, f.glowColor, f.amp, f.textGrad, f.textColor2, spec.lines.join('\n')].join('|');
    let L = layers.get(key);
    if (L) return L;
    const m = Math.ceil((f.amp + f.glow + 50) * k);
    const c = document.createElement('canvas');
    c.width = W; c.height = Math.ceil(spec.lines.length * spec.lh + m * 2);
    const g = c.getContext('2d');
    g.font = spec.font; g.textAlign = 'center'; g.direction = 'rtl'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const widths = spec.lines.map((l) => g.measureText(l).width);
    // أماكن الكلمات (للحركة "كلمة كلمة") — الكلمة كلها قطعة واحدة فالحروف مابتتفصلش
    const words = [];
    const totalChars = spec.lines.join(' ').length || 1;
    let chars = 0;
    spec.lines.forEach((l, i) => {
      const right = (W + widths[i]) / 2;
      let prefix = '';
      for (const w of l.split(' ').filter(Boolean)) {
        const x0 = right - g.measureText(prefix ? prefix + ' ' : '').width, ww = g.measureText(w).width;
        words.push({ line: i, x: x0 - ww, w: ww, at: chars / totalChars });
        chars += w.length + 1;
        prefix = prefix ? prefix + ' ' + w : w;
      }
      const y = m + spec.lh * (i + 0.5);
      if (f.stroke > 0) {
        g.shadowBlur = 0; g.shadowOffsetY = 0;
        g.strokeStyle = f.strokeColor; g.lineWidth = f.stroke * 2 * k;
        g.strokeText(l, W / 2, y);
      }
      g.shadowColor = f.glow > 0 ? f.glowColor : 'rgba(0,0,0,.85)';
      g.shadowBlur = (f.glow > 0 ? f.glow : 18) * k; g.shadowOffsetY = f.glow > 0 ? 0 : 3 * k;
      if (f.textGrad) {
        const gr = g.createLinearGradient(0, y - spec.lh / 2, 0, y + spec.lh / 2);
        gr.addColorStop(0, spec.color); gr.addColorStop(1, f.textColor2);
        g.fillStyle = gr;
      } else g.fillStyle = spec.color;
      g.fillText(l, W / 2, y);
    });
    const maxW = Math.max(1, ...widths);
    L = { c, m, lh: spec.lh, widths, words, left: Math.max(0, Math.floor((W - maxW) / 2 - m)), right: Math.min(W, Math.ceil((W + maxW) / 2 + m)) };
    if (layers.size >= 8) layers.delete(layers.keys().next().value);
    layers.set(key, L);
    return L;
  }

  // dx: إزاحة أفقية للطبقة، y: أعلى السطر الأول، e: الوقت من أول الشاشة، dur: مدتها، clock: ساعة الموجة
  function drawLayer(L, dx, y, anim, e, dur, clock) {
    const W = canvas.width, k = Math.min(W, canvas.height) / 1080, f = state.fx;
    const c = L.c, top = y - L.m, a0 = ctx.globalAlpha;
    const sl = Math.max(2, Math.round(3 * k));
    const A = f.amp * k, w = (2 * Math.PI) / Math.max(40, (f.waveLen / 100) * W), ph = 2 * Math.PI * f.speed * clock;
    ctx.save();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (anim === 'wave' || anim === 'flag') {
      const span = Math.max(1, L.right - L.left);
      for (let x = L.left; x < L.right; x += sl) {
        // الموجة ماشية من اليمين للشمال زي اتجاه القراءة، والرفرفة ثابتة من ناحية اليمين
        const amp = anim === 'flag' ? A * ((L.right - x) / span) : A;
        ctx.drawImage(c, x, 0, sl, c.height, x + dx, top + amp * Math.sin(w * x + ph), sl, c.height);
      }
    } else if (anim === 'ripple') {
      for (let r = 0; r < c.height; r += sl) {
        ctx.drawImage(c, 0, r, W, sl, dx + A * 0.6 * Math.sin(w * 2.5 * r + ph), top + r, W, sl);
      }
    } else if (anim === 'shine') {
      ctx.drawImage(c, dx, top);
      // لمعة ماشية على الحروف بس (بتتكرر كل كام ثانية)
      const span = L.right - L.left, band = 170 * k, u = ((clock * f.speed * 0.45) % 1.4) / 1.0, hx = L.right + band - u * (span + band * 2);
      ctx.globalCompositeOperation = 'lighter';
      for (let x = Math.max(L.left, Math.floor(hx - band)); x < Math.min(L.right, hx + band); x += 6) {
        const d = 1 - Math.abs(x + 3 - hx) / band;
        ctx.globalAlpha = a0 * d * d * 0.85;
        ctx.drawImage(c, x, 0, 6, c.height, x + dx, top, 6, c.height);
      }
    } else if (anim === 'words') {
      const span = Math.max(0.3, dur * 0.92), now = Math.min(e, span);
      for (const wd of L.words) {
        const a = Math.min(1, Math.max(0, (now - wd.at * span) / 0.28));
        if (a <= 0) continue;
        const pad = 8 * k, sy = wd.line === 0 ? 0 : L.m + wd.line * L.lh;
        const sh = (wd.line === L.widths.length - 1 ? c.height : L.m + (wd.line + 1) * L.lh) - sy;
        const sx = Math.max(0, wd.x - pad), sw = Math.min(W - sx, wd.w + pad * 2);
        ctx.globalAlpha = a0 * a;
        ctx.drawImage(c, sx, sy, sw, sh, sx + dx, top + sy + (1 - a) * (1 - a) * 26 * k, sw, sh);
      }
    } else if (anim === 'karaoke' || anim === 'reveal') {
      if (anim === 'karaoke') { ctx.globalAlpha = a0 * 0.35; ctx.drawImage(c, dx, top); ctx.globalAlpha = a0; }
      const total = L.widths.reduce((s, v) => s + v, 0);
      let left = total * Math.min(1, e / Math.max(0.2, dur * 0.92));
      L.widths.forEach((lw, i) => {
        const rev = Math.min(left, lw);
        left -= rev;
        if (rev <= 0) return;
        const right = (W + lw) / 2 + L.m;
        const sy = i === 0 ? 0 : L.m + i * L.lh;
        const sh = (i === L.widths.length - 1 ? c.height : L.m + (i + 1) * L.lh) - sy;
        // السطر المكتمل بياخد الطرفين بالظل بتاعه
        const sx = rev >= lw ? 0 : right - L.m - rev, sw = rev >= lw ? W : L.m + rev;
        ctx.drawImage(c, sx, sy, sw, sh, sx + dx, top + sy, sw, sh);
      });
    } else {
      const u = Math.min(1, e / 0.5), ease = 1 - Math.pow(1 - u, 3);
      let s = 1, oy = 0;
      if (anim === 'float') oy = A * Math.sin(ph);
      if (anim === 'pulse') s = 1 + (A / (k * 800)) * Math.sin(ph);
      if (anim === 'zoom') s = 0.82 + 0.18 * ease;
      if (anim === 'rise') oy = (1 - ease) * 70 * k;
      if (anim === 'bounce') { const b = Math.min(1, e / 0.6); s = 1 + 0.35 * Math.exp(-6 * b) * Math.cos(b * 12) - 0.35 * (1 - b) * (1 - b) * (b < 0.15 ? 1 : 0); }
      if (anim === 'voice') s = 1 + FXLIB.audioAt(clock - clockExtra).bass * 0.035;
      const cy = y + (c.height - L.m * 2) / 2;
      ctx.translate(W / 2 + dx, cy + oy);
      ctx.scale(s, s);
      ctx.drawImage(c, -W / 2, -c.height / 2);
    }
    ctx.restore();
  }

  // ---------- الخلفية ----------
  const small = document.createElement('canvas');
  function filterOf() {
    const f = state.fx, parts = [];
    if (f.bright !== 100 || f.contrast !== 100 || f.sat !== 100) parts.push(`brightness(${f.bright}%) contrast(${f.contrast}%) saturate(${f.sat}%)`);
    if (FX_GRADES[f.grade]) parts.push(FX_GRADES[f.grade]);
    return parts.join(' ');
  }
  // التغبيش بيتحسب على نسخة صغيرة عشان مايهنجش
  function drawBg(el, scale) {
    const f = state.fx, W = canvas.width, H = canvas.height, flt = filterOf();
    if (!f.blur) {
      if (flt) ctx.filter = flt;
      const ok = drawCover(el, scale);
      ctx.filter = 'none';
      return ok;
    }
    const sw = Math.ceil(W / 6), sh = Math.ceil(H / 6);
    if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
    const g = small.getContext('2d', { alpha: false });
    g.filter = `${flt} blur(${f.blur / 3}px)`;
    const ok = drawCover(el, scale * 1.08, g, small.width, small.height);
    if (ok) ctx.drawImage(small, 0, 0, W, H);
    return ok;
  }
  // حركة الكاميرا على الخلفية بس (الكلام ثابت)
  function camera(t, bt) {
    const f = state.fx, W = canvas.width, H = canvas.height, a = f.camAmt / 100, p = Math.min(1, t / (D() || 1));
    if (f.camera === 'none') return;
    let s = 1, tx = 0;
    if (f.camera === 'zoomIn') s = 1 + a * p;
    else if (f.camera === 'zoomOut') s = 1 + a * (1 - p);
    else if (f.camera === 'panR' || f.camera === 'panL') { s = 1 + a; tx = (f.camera === 'panR' ? 1 : -1) * (p - 0.5) * a * W; }
    else if (f.camera === 'breath') s = 1 + a * 0.5 * (1 + Math.sin(t * 0.9));
    else if (f.camera === 'voice') s = 1 + a * FXLIB.audioAt(bt).bass * 0.6;
    ctx.translate(W / 2 + tx, H / 2);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H / 2);
  }

  const vig = { key: '', c: document.createElement('canvas') };
  function vignette() {
    const f = state.fx, W = canvas.width, H = canvas.height;
    if (f.tint > 0) { ctx.fillStyle = f.tintColor; ctx.globalAlpha = f.tint / 100; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (!f.vignette) return;
    // بتترسم مرة واحدة وتتحفظ (التدرّج على الشاشة كلها تقيل لو اتحسب كل فريم)
    const key = `${W}x${H}:${f.vignette}`;
    if (vig.key !== key) {
      vig.key = key;
      vig.c.width = Math.ceil(W / 4); vig.c.height = Math.ceil(H / 4);
      const g = vig.c.getContext('2d'), w = vig.c.width, h = vig.c.height;
      const r = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
      r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${f.vignette / 100})`);
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }
    ctx.drawImage(vig.c, 0, 0, W, H);
  }

  function frame() {
    if (!state.fx.frame) return;
    const W = canvas.width, H = canvas.height, k = Math.min(W, H) / 1080, gold = $('accent').value;
    ctx.save();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4 * k; ctx.strokeRect(34 * k, 34 * k, W - 68 * k, H - 68 * k);
    ctx.lineWidth = 1.5 * k; ctx.strokeRect(48 * k, 48 * k, W - 96 * k, H - 96 * k);
    ctx.fillStyle = gold;
    for (const [x, y] of [[41, 41], [W / k - 41, 41], [41, H / k - 41], [W / k - 41, H / k - 41]]) {
      ctx.save(); ctx.translate(x * k, y * k); ctx.rotate(Math.PI / 4); ctx.fillRect(-11 * k, -11 * k, 22 * k, 22 * k); ctx.restore();
    }
    ctx.restore();
  }

  // ---------- طبقات المؤثرات ----------
  const boxes = new WeakMap();
  const layerAlpha = (l, bt) => {
    if (l.start == null) return 1;
    return Math.max(0, Math.min(1, (bt - l.start) / 0.3, (l.end - bt) / 0.3));
  };
  function boxOf(l, W, H, k) {
    const cx = l.x * W, cy = l.y * H;
    if (l.type === 'photo') {
      const im = FXLIB.imgOf(l.src), w = W * (l.size / 100), h = w * ((im.naturalHeight || 1) / (im.naturalWidth || 1));
      if (l.frameShape === 'circle') { const d = Math.min(w, h); return { x: cx - d / 2, y: cy - d / 2, w: d, h: d }; }
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    }
    if (['bars', 'blocks', 'line', 'siri', 'timeline', 'runner'].includes(l.type)) { const w = W * (l.size / 100); return { x: cx - w / 2, y: cy - 90 * k, w, h: 180 * k }; }
    const r = ((l.size / 100) * Math.min(W, H)) / 2 * 1.2;
    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  }
  // front: اللي فوق الكلام ولا اللي تحته
  function drawLayers(bt, t, front) {
    const list = state.fx.layers;
    if (!list.length || !state.buf) return;
    const W = canvas.width, H = canvas.height, k = Math.min(W, H) / 1080;
    let A = null;
    for (const l of list) {
      if (!!l.front !== front) continue;
      const a = layerAlpha(l, bt);
      if (a <= 0) { boxes.delete(l); continue; }
      if (!A) { A = FXLIB.frameAudio(bt, t); A.clock = bt + clockExtra; }
      FXLIB.render(ctx, W, H, l, A, a);
      if (FXLIB.movable(l)) boxes.set(l, boxOf(l, W, H, k)); else boxes.delete(l);
      if (!state.playing && selL === l && boxes.has(l)) {
        const b = boxes.get(l);
        ctx.save();
        ctx.shadowBlur = 0; ctx.setLineDash([10 * k, 8 * k]); ctx.strokeStyle = '#f0d47a'; ctx.lineWidth = 3 * k;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        if (l.type === 'photo') {
          ctx.setLineDash([]); ctx.fillStyle = '#f0d47a';
          const hs = 22 * k;
          for (const [cx, cy] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
        }
        ctx.restore();
      }
    }
  }
  // السحب على المعاينة: الصور دايمًا، وباقي المؤثرات لما تكون بتعدّلها بس (عشان مفيش حاجة تتحدد بالغلط)
  const inside = (b, x, y) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  function hit(x, y) {
    if (selL && inside(boxes.get(selL), x, y)) return selL;
    return [...state.fx.layers].reverse().find((l) => l.type === 'photo' && inside(boxes.get(l), x, y)) || null;
  }
  const HANDLE = 44;
  // مقبض ركن الصورة المختارة
  function handleAt(x, y) {
    const k = Math.min(canvas.width, canvas.height) / 1080;
    if (!selL || selL.type !== 'photo') return null;
    const b = boxes.get(selL);
    if (!b) return null;
    for (const [cx, cy] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
      if (Math.abs(x - cx) < HANDLE * k && Math.abs(y - cy) < HANDLE * k) return selL;
    }
    return null;
  }
  // الضغط على صورة وإنت في قسم الصور بيفتح تعديلاتها (من غير ما ينقلك من قسم تاني)
  function touchPhoto(l) {
    if (section === 'photos' && l.type === 'photo' && selL !== l) { selL = l; renderBody(); }
  }
  function afterDrag() { if (section === 'photos' && selL) renderBody(); else save(); }
  function wheelResize(x, y, dy) {
    const l = hit(x, y);
    if (!l || l.type !== 'photo') return false;
    l.size = Math.round(Math.max(5, Math.min(150, l.size * (dy < 0 ? 1.05 : 0.95))) * 10) / 10;
    if (!state.playing) drawIdle();
    return true;
  }

  // لمسات فوق كل حاجة: شرايط السينما وشريط التقدم والفتح/القفل على الأسود
  function finish(t) {
    const f = state.fx, W = canvas.width, H = canvas.height, k = Math.min(W, H) / 1080;
    ctx.save();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.globalAlpha = 1;
    if (f.letterbox > 0) { const b = (H * f.letterbox) / 100; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); }
    if (f.progress) {
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(0, H - 10 * k, W, 10 * k);
      ctx.fillStyle = $('accent').value; ctx.fillRect(W - W * Math.min(1, t / D()), H - 10 * k, W * Math.min(1, t / D()), 10 * k);
    }
    const black = Math.max(f.vIn > 0 ? 1 - t / f.vIn : 0, f.vOut > 0 ? 1 - (D() - t) / f.vOut : 0);
    if (black > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, black)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  // ---------- لوحة التحكم ----------
  // قائمة جانبية: قسم واحد بس ظاهر في كل مرة، ومعاينة صغيرة ثابتة جنبك وإنت بتعدّل
  const SECTIONS = [
    { id: 'text', icon: '✍️', title: 'حركة الكلام', desc: 'اختار حركة واحدة لكلام الآيات، وظبط شكل الحروف.' },
    { id: 'viz', icon: '🎵', title: 'ذبذبات الصوت', desc: 'أشكال بتتحرك مع صوت الشيخ. دوس على أي شكل يتضاف، وتعديلاته هتظهر تحته على طول.' },
    { id: 'amb', icon: '🌟', title: 'مؤثرات الجو', desc: 'نجوم ومطر وأشعة نور فوق الخلفية. دوس على أي مؤثر يتضاف، وتعديلاته هتظهر تحته على طول.' },
    { id: 'photos', icon: '👤', title: 'صور الشيخ', desc: 'اختار صورة تتضاف جنب الكلام، أو ارفع صورك. اسحبها على المعاينة تنقلها، ومن الأركان تكبرها وتصغرها.' },
    { id: 'bgs', icon: '🖼', title: 'الخلفيات', desc: 'اختار خلفية أو أكتر: فيديو أو صورة أو شاشة سودا أو من بنترست أو من جهازك.' },
    { id: 'bg', icon: '🎨', title: 'شكل الخلفية', desc: 'لون الصورة وحركة الكاميرا والانتقال بين الخلفيات.' },
    { id: 'audio', icon: '🔊', title: 'الصوت', desc: 'نضّف صوت التسجيل وحسّنه. شغّل ▶ وعدّل، وهتسمع النتيجة على طول.' },
    { id: 'video', icon: '🎬', title: 'الفيديو', desc: 'البداية والنهاية على الأسود، وشريط التقدم، وجودة الملف، وأشكالك المحفوظة.' },
  ];
  const RESET_KEYS = {
    text: ['textSide', 'anim', 'amp', 'speed', 'waveLen', 'textGrad', 'textColor2', 'stroke', 'strokeColor', 'glow', 'glowColor'],
    bg: ['bright', 'contrast', 'sat', 'blur', 'vignette', 'grade', 'tint', 'tintColor', 'camera', 'camAmt', 'transition', 'transDur'],
    audio: Object.keys(AFX_DEFAULT),
    video: ['vIn', 'vOut', 'letterbox', 'progress', 'frame'],
  };
  const VIZ_GROUPS = [
    ['⭕ أشكال', ['circle', 'circleLine', 'circleDots', 'heart', 'heartLine', 'star', 'flower', 'crescent', 'arch', 'dome', 'hex', 'diamond']],
    ['➖ خطوط وأعمدة', ['timeline', 'runner', 'bars', 'barsUp', 'blocks', 'line', 'siri', 'ribbons']],
    ['🔲 حوالين الفيديو', ['frameRun', 'frameFill', 'frameBars', 'frameNeon']],
    ['🌌 حركات', ['ripples', 'orbit', 'spiral', 'sunburst', 'dotgrid']],
  ];
  const ANIM_GROUPS = [
    ['حركة مستمرة', ['none', 'wave', 'ripple', 'flag', 'float', 'pulse', 'voice', 'shine']],
    ['ماشية مع التلاوة', ['words', 'karaoke', 'reveal']],
    ['وهو داخل الشاشة', ['zoom', 'bounce', 'rise']],
  ];
  const GRADE_OPTS = [['none', 'طبيعي'], ['warm', 'دافي'], ['golden', 'ذهبي'], ['cool', 'بارد'], ['teal', 'سينمائي'], ['vintage', 'قديم'], ['night', 'ليل'], ['dream', 'حالم'], ['bw', 'أبيض وأسود']];
  const CAMERA_OPTS = [['none', 'ثابتة'], ['zoomIn', 'تقرّب بالراحة'], ['zoomOut', 'تبعد بالراحة'], ['panR', 'تمشي يمين'], ['panL', 'تمشي شمال'], ['breath', 'تتنفس'], ['voice', 'تنبض مع الصوت']];
  const TRANS_OPTS = [['none', 'قطع مباشر'], ['fade', 'تداخل ناعم'], ['slide', 'تنزلق من الجنب'], ['zoom', 'زووم'], ['black', 'يغمق ويفتح'], ['white', 'فلاش أبيض']];
  const TEXT_SIDES = [['center', 'في النص'], ['right', 'على اليمين'], ['left', 'على الشمال']];
  const BASIC_KEYS = new Set(['shape', 'style', 'size', 'amount', 'inset', 'thick', 'color', 'color2', 'opacity']);

  let section = 'text', vizGroup = 0, selL = null, thumbs = [], thumbOn = false;
  const root = () => document.getElementById('edFx');
  const bodyEl = () => root()?.querySelector('.fxp-body');
  const groupOf = (l) => (l.type === 'photo' ? 'photos' : FXLIB.isAmb(l) ? 'amb' : 'viz');
  const savedList = () => { try { return JSON.parse(localStorage.getItem(SAVED) || '[]'); } catch { return []; } };
  const preview = () => { if (!state.playing) { drawIdle(); previewLoop(); } };
  // أي تعديل يدوي يلغي علامة الشكل الجاهز
  const touched = () => { state.fx.preset = null; save(); renderMenu(); preview(); };
  function changed() { touched(); renderBody(); window.Editor?.refresh(); }
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // عنصر تحكم واحد — اللي بيتفعّل هو الأداة نفسها بس، مش المساحة الفاضية جنبها
  function control(c, target, onDone) {
    const row = h('div', c.type === 'check' ? 'fx-check' : 'fx-row');
    const v = target[c.k];
    const opts = typeof c.opts === 'function' ? c.opts() : c.opts;
    if (c.type === 'select') row.innerHTML = `<span>${c.label}</span><select>${opts.map(([o, n]) => `<option value="${o}" ${String(o) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    else if (c.type === 'range') row.innerHTML = `<span>${c.label} <b dir="ltr">${+(+v).toFixed(2)}</b></span><input type="range" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${v}">`;
    else if (c.type === 'color') row.innerHTML = `<span>${c.label}</span><input type="color" value="${v || '#ffffff'}">`;
    else row.innerHTML = `<label><input type="checkbox" ${v ? 'checked' : ''}> ${c.label}</label>`;
    const inp = row.querySelector('input,select');
    inp.addEventListener('pointerdown', () => Editor.commit());
    inp.addEventListener('keydown', () => Editor.commit());
    if (c.type === 'range') {
      // السحب بيحدّث المعاينة من غير ما يعيد بناء اللوحة (عشان السحب مايتقطعش)
      inp.oninput = () => { target[c.k] = +inp.value; row.querySelector('b').textContent = inp.value; touched(); };
      inp.onchange = () => onDone?.();
    } else if (c.type === 'color') inp.oninput = () => { target[c.k] = inp.value; touched(); };
    else if (c.type === 'check') inp.onchange = () => { target[c.k] = inp.checked; touched(); onDone?.(); };
    else inp.onchange = () => { target[c.k] = c.num ? +inp.value : inp.value; touched(); onDone?.(); };
    return row;
  }
  const ctrlOf = (k) => [...FX_TABS.flatMap((t) => (Array.isArray(t[1]) ? t[1] : [])), ...AFX_GROUPS.flatMap((g) => g[1])].find((c) => c.k === k);
  // مجموعة أزرار تختار منها واحد بس
  function choice(title, key, opts, labelOf = (o) => o[1]) {
    const box = h('div', 'fx-group', `<h4>${title}</h4>`);
    const grid = h('div', 'fx-choices');
    for (const o of opts) {
      const b = h('button', 'fx-choice' + (String(state.fx[key]) === String(o[0]) ? ' on' : ''), labelOf(o));
      b.type = 'button';
      b.onclick = () => { Editor.commit(); state.fx[key] = o[0]; changed(); };
      grid.append(b);
    }
    box.append(grid);
    return box;
  }
  function group(title, keys, advanced) {
    const shown = keys.map(ctrlOf).filter((c) => !c.show || c.show(state.fx));
    const grid = h('div', 'fx-grid');
    for (const c of shown) grid.append(control(c, state.fx, () => renderBody()));
    if (advanced) { const d = h('details', 'fx-more', `<summary>${title}</summary>`); d.append(grid); return d; }
    const box = h('div', 'fx-group', title ? `<h4>${title}</h4>` : '');
    box.append(grid);
    return box;
  }
  // إعدادات ثابتة في الصفحة (الخطوط والعناوين والخلفيات) بتتنقل جوه القسم بتاعها
  function stashed(title, id) {
    const box = h('div', 'fx-group', title ? `<h4>${title}</h4>` : '');
    box.append(document.getElementById(id));
    return box;
  }
  function resetBtn(id) {
    const b = h('button', 'btn small fx-reset', '↺ رجّع القسم ده زي الأول');
    b.type = 'button';
    b.onclick = () => {
      Editor.commit();
      if (id === 'viz' || id === 'amb' || id === 'photos') state.fx.layers = state.fx.layers.filter((l) => groupOf(l) !== id);
      else for (const k of RESET_KEYS[id]) state.fx[k] = FX_DEFAULT[k];
      selL = null;
      clearLayers();
      changed();
      if (id === 'audio') audioChanged();
    };
    return b;
  }

  // ---------- محتوى الأقسام ----------
  function savedStyles() {
    const apply = (name, o) => {
      Editor.commit();
      state.fx = fresh({ ...o, preset: name });
      selL = null;
      clearLayers();
      save(); renderMenu(); renderBody(); window.Editor?.refresh(); preview();
    };
    const mine = h('div', 'fx-group', '<h4>أشكالي المحفوظة</h4>');
    const row = h('div', 'fx-chips');
    savedList().forEach((s, i) => {
      const chip = h('span', 'fx-chip' + (state.fx.preset === s.name ? ' on' : ''), `<button type="button" class="fx-chip-main">⭐ ${esc(s.name)}</button><button type="button" class="fx-chip-x" aria-label="امسح">✕</button>`);
      chip.querySelector('.fx-chip-main').onclick = () => apply(s.name, JSON.parse(JSON.stringify(s.fx)));
      chip.querySelector('.fx-chip-x').onclick = () => { const a = savedList(); a.splice(i, 1); try { localStorage.setItem(SAVED, JSON.stringify(a)); } catch {} renderBody(); };
      row.append(chip);
    });
    const add = h('button', 'btn small', '💾 احفظ التأثيرات الحالية');
    add.type = 'button';
    add.onclick = () => {
      const name = prompt('اسم الشكل (هيفضل عندك تستخدمه في أي فيديو):');
      if (!name?.trim()) return;
      const a = savedList();
      a.push({ name: name.trim().slice(0, 30), fx: { ...state.fx, bypass: false } });
      try { localStorage.setItem(SAVED, JSON.stringify(a)); } catch {}
      state.fx.preset = name.trim().slice(0, 30);
      renderBody();
    };
    row.append(add);
    mine.append(row);
    return mine;
  }

  function bodyText(body) {
    body.append(choice('مكان الكلام', 'textSide', TEXT_SIDES));
    for (const [title, ids] of ANIM_GROUPS) body.append(choice(title, 'anim', FX_ANIMS.filter((a) => ids.includes(a[0]))));
    if (!FX_LOOPING.has(state.fx.anim) && state.fx.anim !== 'none' && state.fx.anim !== 'voice') body.append(h('p', 'hint', '👆 الحركة دي بتظهر وقت التشغيل — دوس ▶ جنب المعاينة عشان تشوفها.'));
    if (FX_LOOPING.has(state.fx.anim) && state.fx.anim !== 'shine') body.append(group('ظبط الحركة', ['amp', 'speed', 'waveLen']));
    body.append(stashed('الخط والألوان', 'stText'));
    body.append(group('شكل الحروف', ['textGrad', 'textColor2', 'stroke', 'strokeColor', 'glow', 'glowColor']));
    body.append(resetBtn('text'));
  }

  function addedBar(list) {
    const bar = h('div', 'fx-group fx-added', `<h4>المضاف للفيديو (${arDigits(list.length)})</h4>`);
    if (!list.length) { bar.append(h('p', 'hint', 'لسه ماضفتش حاجة.')); return bar; }
    const row = h('div', 'fx-chips');
    for (const l of list) {
      const chip = h('span', 'fx-chip' + (l === selL ? ' on' : ''), `<button type="button" class="fx-chip-main">${l.name}</button><button type="button" class="fx-chip-x" aria-label="شيله">✕</button>`);
      chip.querySelector('.fx-chip-main').onclick = () => pick(l);
      chip.querySelector('.fx-chip-x').onclick = () => removeLayer(l);
      row.append(chip);
    }
    bar.append(row);
    return bar;
  }
  function removeLayer(l) {
    Editor.commit();
    state.fx.layers.splice(state.fx.layers.indexOf(l), 1);
    if (selL === l) selL = null;
    changed();
  }
  // بيفتح تعديلات المؤثر، ولو في مجموعة تانية من الذبذبات بينقل لها
  function pick(l) {
    selL = l;
    const g = VIZ_GROUPS.findIndex((x) => x[1].includes(l.kind));
    if (g >= 0) vizGroup = g;
    renderBody();
    drawIdle();
  }
  // المعرض: دوس يتضاف وتعديلاته تظهر تحته. لو مضاف: دوس عليه تفتح/تقفل تعديلاته، و✕ بتشيله
  function gallery(body, id) {
    const list = state.fx.layers.filter((l) => groupOf(l) === id);
    body.append(addedBar(list));
    let items = FXLIB.GALLERY[id];
    if (id === 'viz') {
      const tabs = h('div', 'fx-chips fx-subtabs');
      VIZ_GROUPS.forEach(([name], i) => {
        const b = h('button', 'fx-choice' + (i === vizGroup ? ' on' : ''), name);
        b.type = 'button';
        b.onclick = () => { vizGroup = i; renderBody(); };
        tabs.append(b);
      });
      body.append(tabs);
      items = items.filter((x) => VIZ_GROUPS[vizGroup][1].includes(x[0]));
    }
    const gal = h('div', 'fx-gallery');
    thumbs = [];
    let selTile = null;
    for (const [kind, name] of items) {
      const on = list.filter((l) => l.kind === kind), isSel = selL && selL.kind === kind && on.includes(selL);
      const b = h('div', 'fx-item' + (on.length ? ' on' : '') + (isSel ? ' sel' : ''), `<canvas width="132" height="132"></canvas><span>${name}</span>${on.length ? '<i class="fx-tick">✓</i><button type="button" class="fx-x" title="شيله" aria-label="شيله">✕</button>' : ''}`);
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.onclick = (e) => {
        if (e.target.closest('.fx-x')) { Editor.commit(); state.fx.layers = state.fx.layers.filter((l) => l.kind !== kind); if (selL?.kind === kind) selL = null; changed(); return; }
        if (!on.length) { Editor.commit(); selL = FXLIB.make(kind); state.fx.layers.push(selL); changed(); return; }
        selL = isSel ? null : on[0];
        renderBody();
        drawIdle();
      };
      b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } };
      if (isSel) selTile = b;
      gal.append(b);
      thumbs.push({ c: b.querySelector('canvas'), l: FXLIB.make(kind) });
    }
    body.append(gal);
    // التعديلات بتتحط تحت الصف اللي فيه الشكل المختار على طول
    if (selTile) {
      const tiles = [...gal.children], top = selTile.offsetTop;
      const last = tiles.filter((t) => t.offsetTop === top).pop();
      last.after(layerEditor(selL));
    }
    if (list.length) body.append(resetBtn(id));
    startThumbs();
  }
  function layerEditor(l) {
    const box = h('div', 'fx-edit');
    const head = h('div', 'fx-edit-head', `<b>⚙️ تعديل: ${l.name}</b>`);
    const close = h('button', 'btn small', 'اقفل');
    close.type = 'button';
    close.onclick = () => { selL = null; renderBody(); drawIdle(); };
    head.append(close);
    box.append(head);
    if (FXLIB.movable(l)) box.append(h('p', 'hint', '👆 اسحبه بالماوس على المعاينة عشان تغيّر مكانه.'));
    const keys = [...(FX_KEYS[l.type] || (FXLIB.isAmb(l) ? ['amount', 'size', 'speed'] : []))];
    if (l.type !== 'grain') { keys.push('color'); if (!FXLIB.isAmb(l)) keys.push('color2'); if (!FXLIB.isAmb(l) && !FX_NOGLOW.has(l.type)) keys.push('glow'); }
    keys.push('opacity', 'front');
    const mk = (k) => control({ k, ...FX_CTRL[k] }, l);
    const basic = h('div', 'fx-grid');
    for (const k of keys) if (BASIC_KEYS.has(k)) basic.append(mk(k));
    box.append(basic);
    if (l.type !== 'grain') {
      const pal = h('div', 'fx-chips', '<span class="hint">ألوان جاهزة:</span>' + FX_PALETTES.map((p, i) => `<button type="button" class="fx-sw" data-c="${i}" style="background:linear-gradient(135deg,${p[0]},${p[1]})" aria-label="لون"></button>`).join(''));
      pal.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { Editor.commit(); [l.color, l.color2] = FX_PALETTES[+b.dataset.c]; touched(); renderBody(); }));
      box.append(pal);
    }
    const rest = keys.filter((k) => !BASIC_KEYS.has(k));
    if (rest.length) {
      const d = h('details', 'fx-more', '<summary>إعدادات أكتر</summary>');
      const grid = h('div', 'fx-grid');
      for (const k of rest) grid.append(mk(k));
      d.append(grid);
      box.append(d);
    }
    const foot = h('div', 'fx-chips');
    if (FXLIB.movable(l)) {
      foot.innerHTML = '<span class="hint">مكانه:</span><button type="button" class="btn small" data-y="0.18">فوق</button><button type="button" class="btn small" data-y="0.46">النص</button><button type="button" class="btn small" data-y="0.84">تحت</button>';
      foot.querySelectorAll('[data-y]').forEach((b) => (b.onclick = () => { Editor.commit(); l.y = +b.dataset.y; l.x = 0.5; touched(); }));
    }
    const dup = h('button', 'btn small', '📄 نسخة تانية'), del = h('button', 'btn small danger', '🗑 شيله');
    dup.type = del.type = 'button';
    dup.onclick = () => { Editor.commit(); const c = { ...l, id: Date.now().toString(36) + 'c' }; state.fx.layers.push(c); selL = c; changed(); };
    del.onclick = () => removeLayer(l);
    foot.append(dup, del);
    box.append(foot);
    box.append(h('p', 'hint', '⏱ وقت ظهوره بتظبطه من صف "مؤثرات" في الشريط اللي فوق.'));
    return box;
  }
  function bodyEffects(body, id) { gallery(body, id); }
  // ---------- صور الشيخ ----------
  let photoList = null, photoBusy = '';
  const PHOTO_LAYOUTS = [
    ['الصورة شمال والكلام يمين', { x: 0.25, y: 0.56, size: 48 }, 'right', 'center'],
    ['الصورة يمين والكلام شمال', { x: 0.75, y: 0.56, size: 48 }, 'left', 'center'],
    ['الصورة تحت والكلام فوق', { x: 0.5, y: 0.76, size: 58 }, 'center', 'top'],
    ['الصورة فوق والكلام تحت', { x: 0.5, y: 0.3, size: 52 }, 'center', 'bottom'],
  ];
  async function loadPhotos() {
    try { photoList = (await (await vfetch('/api/photos')).json()).photos || []; } catch { photoList = []; }
    if (section === 'photos') renderBody();
  }
  function makePhoto(p) {
    return { type: 'photo', kind: 'photo:' + p.name, name: '👤 صورة الشيخ', id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), src: p.url,
      x: 0.25, y: 0.56, size: 48, opacity: 1, frameShape: /\.png$/i.test(p.name) ? 'free' : 'round', border: 0, color: '#f0d47a', shadow: 30, rotate: 0, flip: false, voice: false, sens: 1, front: false, start: null, end: null };
  }
  async function uploadPhotos(files) {
    for (const f of files) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      photoBusy = '⏳ برفع الصورة...'; renderBody();
      const r = await vfetch('/api/photos?ext=' + encodeURIComponent(ext === 'jpeg' ? 'jpg' : ext), { method: 'POST', body: f });
      if (!r.ok) { photoBusy = '⚠️ ' + ((await r.json().catch(() => ({}))).error || 'الرفع فشل'); renderBody(); return; }
    }
    photoBusy = '';
    await loadPhotos();
  }
  let bgWorker = null;
  function removeBg(l) {
    photoBusy = '⏳ بشيل الخلفية... (أول مرة بينزل ملف صغير)'; renderBody();
    bgWorker = bgWorker || new Worker('bg-remove-worker.js', { type: 'module' });
    bgWorker.onmessage = async ({ data }) => {
      if (data.type === 'status') { const m = bodyEl()?.querySelector('.fx-photo-msg'); if (m) m.textContent = `⏳ بحمّل أداة إزالة الخلفية... ${data.pct}%`; return; }
      if (data.type === 'error') { photoBusy = '⚠️ ماقدرتش أشيل الخلفية: ' + data.message; renderBody(); return; }
      // لو الأداة مسحت تقريبًا كل الصورة (لوجو أو رسمة مش شخص) أو ماشالتش حاجة، مانغيّرش حاجة
      const bmp = await createImageBitmap(data.blob), cv = new OffscreenCanvas(64, 64), cg = cv.getContext('2d');
      cg.drawImage(bmp, 0, 0, 64, 64);
      const px = cg.getImageData(0, 0, 64, 64).data;
      let kept = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 128) kept++;
      const ratio = kept / (64 * 64);
      if (ratio < 0.05 || ratio > 0.97) { photoBusy = '⚠️ الأداة ماعرفتش تفصل شخص في الصورة دي، فسيبتها زي ما هي. جرّب صورة واضحة للشيخ.'; renderBody(); return; }
      const r = await vfetch('/api/photos?ext=png', { method: 'POST', body: data.blob });
      const j = await r.json();
      Editor.commit();
      l.src = j.url; l.kind = 'photo:' + j.name; l.frameShape = 'free';
      photoBusy = '✅ الخلفية اتشالت — لو النتيجة مش عاجباك دوس تراجع';
      touched();
      await loadPhotos();
    };
    bgWorker.postMessage({ url: new URL(l.src, location.href).href });
  }
  function photoEditor(l) {
    const box = h('div', 'fx-edit');
    const head = h('div', 'fx-edit-head', `<b>⚙️ تعديل الصورة</b>`);
    const close = h('button', 'btn small', 'اقفل');
    close.type = 'button';
    close.onclick = () => { selL = null; renderBody(); drawIdle(); };
    head.append(close);
    box.append(head);
    box.append(h('p', 'hint', '👆 على المعاينة: اسحب الصورة عشان تنقلها، واسحب المربعات اللي في أركانها أو لف عجلة الماوس عشان تكبرها وتصغرها.'));
    const lay = h('div', 'fx-group', '<h4>مكانها مع الكلام</h4>');
    const grid = h('div', 'fx-choices');
    for (const [title, pos, side, tpos] of PHOTO_LAYOUTS) {
      const b = h('button', 'fx-choice', title);
      b.type = 'button';
      b.onclick = () => { Editor.commit(); Object.assign(l, pos); state.fx.textSide = side; $('textPos').value = tpos; touched(); renderBody(); };
      grid.append(b);
    }
    lay.append(grid);
    box.append(lay);
    const CTRL = [
      { k: 'size', label: 'الحجم', type: 'range', min: 5, max: 150 }, { k: 'opacity', label: 'الوضوح', type: 'range', min: 0.05, max: 1, step: 0.05 },
      { k: 'rotate', label: 'اللف (درجة)', type: 'range', min: -180, max: 180 }, { k: 'shadow', label: 'الظل', type: 'range', min: 0, max: 80 },
      { k: 'flip', label: 'اعكس الصورة', type: 'check' }, { k: 'voice', label: 'تنبض مع الصوت', type: 'check' }, { k: 'front', label: 'فوق الكلام', type: 'check' },
    ];
    const g2 = h('div', 'fx-grid');
    for (const c of CTRL) g2.append(control(c, l));
    box.append(g2);
    const shape = h('div', 'fx-group', '<h4>شكل الصورة</h4>');
    const sg = h('div', 'fx-choices');
    for (const [v, n] of [['free', 'زي ما هي'], ['round', 'أركان ناعمة'], ['circle', 'دايرة']]) {
      const b = h('button', 'fx-choice' + (l.frameShape === v ? ' on' : ''), n);
      b.type = 'button';
      b.onclick = () => { Editor.commit(); l.frameShape = v; touched(); renderBody(); };
      sg.append(b);
    }
    shape.append(sg);
    box.append(shape);
    if (l.frameShape !== 'free') {
      const g3 = h('div', 'fx-grid');
      g3.append(control({ k: 'border', label: 'سُمك الإطار', type: 'range', min: 0, max: 30 }, l));
      g3.append(control({ k: 'color', label: 'لون الإطار', type: 'color' }, l));
      box.append(g3);
    }
    const foot = h('div', 'fx-chips');
    const cut = h('button', 'btn small gold', '✂️ شيل خلفية الصورة'), del = h('button', 'btn small danger', '🗑 شيلها من الفيديو');
    cut.type = del.type = 'button';
    cut.onclick = () => removeBg(l);
    del.onclick = () => removeLayer(l);
    foot.append(cut, del);
    box.append(foot);
    box.append(h('p', 'hint', '⏱ وقت ظهورها بتظبطه من صف "مؤثرات" في الشريط اللي فوق.'));
    return box;
  }
  function bodyPhotos(body) {
    if (photoList === null) { body.append(h('p', 'hint', '⏳ بجيب الصور...')); loadPhotos(); return; }
    const list = state.fx.layers.filter((l) => groupOf(l) === 'photos');
    const up = h('label', 'btn gold fx-upload', '📁 ارفع صور من عندك<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>');
    up.querySelector('input').onchange = (e) => uploadPhotos([...e.target.files]);
    body.append(up);
    if (photoBusy) body.append(h('p', 'hint fx-photo-msg', esc(photoBusy)));
    if (!photoList.length) { body.append(h('p', 'hint', 'لسه مفيش صور. ارفع أول صورة 👆')); return; }
    const gal = h('div', 'fx-gallery fx-photos');
    let selTile = null;
    for (const p of photoList) {
      const on = list.filter((l) => l.src === p.url), isSel = selL && on.includes(selL);
      const b = h('div', 'fx-item' + (on.length ? ' on' : '') + (isSel ? ' sel' : ''), `<img src="${esc(p.url)}" alt="صورة الشيخ" loading="lazy">${on.length ? '<i class="fx-tick">✓</i>' : ''}${on.length || !p.builtin ? `<button type="button" class="fx-x" title="${on.length ? 'شيلها من الفيديو' : 'امسح الصورة'}" aria-label="شيل">✕</button>` : ''}`);
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.onclick = async (e) => {
        if (e.target.closest('.fx-x')) {
          if (on.length) { Editor.commit(); state.fx.layers = state.fx.layers.filter((l) => l.src !== p.url); if (on.includes(selL)) selL = null; changed(); return; }
          if (!confirm('تمسح الصورة دي من المعرض؟')) return;
          await vfetch('/api/photos?name=' + encodeURIComponent(p.name), { method: 'DELETE' });
          await loadPhotos();
          return;
        }
        if (!on.length) { Editor.commit(); selL = makePhoto(p); state.fx.layers.push(selL); FXLIB.imgOf(p.url); changed(); return; }
        selL = isSel ? null : on[0];
        renderBody(); drawIdle();
      };
      b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } };
      if (isSel) selTile = b;
      gal.append(b);
    }
    body.append(gal);
    if (selTile) { const top = selTile.offsetTop; [...gal.children].filter((t) => t.offsetTop === top).pop().after(photoEditor(selL)); }
    // صورة في الفيديو ملفها اتمسح أو نسخة من غير خلفية
    const orphan = selL && selL.type === 'photo' && !selTile ? selL : null;
    if (orphan) body.append(photoEditor(orphan));
    if (list.length) body.append(resetBtn('photos'));
  }

  function bodyBgs(body) {
    body.append(document.getElementById('bgPicker'));
    ensureBgLoaded();
  }
  function bodyBg(body) {
    body.append(stashed('', 'stBg'));
    body.append(choice('لون الصورة', 'grade', GRADE_OPTS));
    body.append(choice('حركة الكاميرا', 'camera', CAMERA_OPTS));
    if (state.fx.camera !== 'none') body.append(group('', ['camAmt']));
    body.append(choice('الانتقال بين الخلفيات <small class="hint">(لو مختار أكتر من خلفية)</small>', 'transition', TRANS_OPTS));
    if (state.fx.transition !== 'none') body.append(group('', ['transDur']));
    body.append(group('تعديلات يدوية (إضاءة، حدة، تغبيش...)', ['bright', 'contrast', 'sat', 'blur', 'vignette', 'tint', 'tintColor'], true));
    body.append(resetBtn('bg'));
  }
  // أي تعديل في الصوت يتسمع على طول لو شغال
  let audioTimer = null;
  function audioChanged() {
    clearTimeout(audioTimer);
    audioTimer = setTimeout(async () => {
      AFX.prepare();
      if (state.playing && !state.playing.fast && state.playing.mode === 'preview') play('preview', Editor.time());
    }, 180);
  }
  function bodyAudio(body) {
    const f = state.fx;
    const top = h('div', 'fx-audio-top');
    const auto = h('button', 'btn gold', '✨ حسّن الصوت تلقائيًا');
    auto.type = 'button';
    auto.title = 'بينضّف الوشيش ويوحّد العلو ويوضّح الصوت — وتقدر تعدّل كل حاجة بعده';
    auto.onclick = () => { Editor.commit(); Object.assign(state.fx, AFX_AUTO); changed(); audioChanged(); };
    const ab = h('button', 'btn' + (f.bypass ? ' fx-ab-off' : ''), f.bypass ? '🎧 بتسمع: الأصلي' : '🎧 بتسمع: بعد التعديل');
    ab.type = 'button';
    ab.title = 'قارن بين الصوت الأصلي وبعد التعديل';
    ab.onclick = () => { state.fx.bypass = !state.fx.bypass; renderBody(); audioChanged(); };
    top.append(auto, ab);
    body.append(top);
    const meter = h('div', 'fx-meter', '<span class="fx-meter-lbl">مستوى الصوت</span><div class="fx-meter-bar"><i></i></div><b dir="ltr">—</b>');
    body.append(meter);
    startMeter(meter);
    AFX_GROUPS.forEach(([title, ctrls]) => {
      const box = h('details', 'fx-more fx-audio-group');
      box.open = sectionOpen.has(title);
      box.ontoggle = () => { if (box.open) sectionOpen.add(title); else sectionOpen.delete(title); };
      const edited = ctrls.some((c) => f[c.k] !== AFX_DEFAULT[c.k]);
      box.innerHTML = `<summary>${title}${edited ? ' <small>• متعدّل</small>' : ''}</summary>`;
      const grid = h('div', 'fx-grid');
      for (const c of ctrls) {
        if (c.show && !c.show(f)) continue;
        grid.append(control(c, state.fx, () => { audioChanged(); renderMenu(); }));
      }
      box.append(grid);
      body.append(box);
    });
    body.append(resetBtn('audio'));
  }
  const sectionOpen = new Set(['النضافة', 'المعادل (الجهير والحدة)']);
  let meterOn = false;
  function startMeter(el) {
    const bar = el.querySelector('i'), lbl = el.querySelector('b');
    if (meterOn) return;
    meterOn = true;
    const step = () => {
      const cur = root()?.querySelector('.fx-meter');
      if (!cur) { meterOn = false; return; }
      const db = AFX.peakDb(), pct = Math.max(0, Math.min(100, ((db + 48) / 48) * 100));
      const i = cur.querySelector('i'), b = cur.querySelector('b');
      i.style.width = pct + '%';
      i.classList.toggle('hot', db > -1);
      b.textContent = Number.isFinite(db) && db > -90 ? db.toFixed(0) + ' dB' : '—';
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function bodyVideo(body) {
    body.append(stashed('المقاس والعناوين', 'stVideo'));
    body.append(group('البداية والنهاية', ['vIn', 'vOut']));
    body.append(group('إضافات', ['progress', 'frame', 'letterbox']));
    body.append(group('الملف', ['quality']));
    body.append(savedStyles());
    body.append(resetBtn('video'));
  }

  function statusOf(id) {
    const f = state.fx;
    const changedIn = (k) => RESET_KEYS[k].some((x) => f[x] !== FX_DEFAULT[x]);
    if (id === 'bgs') return state.bgs.length ? arDigits(state.bgs.length) + ' مختارة' : '';
    if (id === 'text') return f.anim !== 'none' ? (FX_ANIMS.find((a) => a[0] === f.anim)?.[1] || '') : changedIn('text') ? 'متعدّل' : '';
    if (id === 'viz' || id === 'amb' || id === 'photos') { const n = f.layers.filter((l) => groupOf(l) === id).length; return n ? arDigits(n) + ' مضاف' : ''; }
    return changedIn(id) ? 'متعدّل' : '';
  }
  function renderMenu() {
    const m = root()?.querySelector('.fxp-menu');
    if (!m) return;
    m.innerHTML = '';
    for (const s of SECTIONS) {
      const st = statusOf(s.id);
      const b = h('button', 'fxp-tab' + (s.id === section ? ' on' : ''), `<span class="fxp-ico">${s.icon}</span><span class="fxp-name">${s.title}${st ? `<small>${esc(st)}</small>` : ''}</span>`);
      b.type = 'button';
      b.onclick = () => { section = s.id; selL = null; renderMenu(); renderBody(); drawIdle(); };
      m.append(b);
    }
  }
  function renderBody() {
    const body = bodyEl();
    if (!body) return;
    const s = SECTIONS.find((x) => x.id === section);
    root().querySelector('.fxp-title').innerHTML = `<h3>${s.icon} ${s.title}</h3><p class="hint">${s.desc}</p>`;
    // الإعدادات الثابتة بترجع مكانها قبل ما القسم يتمسح (الرسم بيقرا منها طول الوقت)
    const stash = document.getElementById('fxStash');
    for (const id of ['bgPicker', 'stBg', 'stText', 'stVideo']) { const e = body.querySelector('#' + id); if (e) stash.append(e); }
    body.innerHTML = '';
    thumbs = [];
    if (section === 'text') bodyText(body);
    else if (section === 'viz' || section === 'amb') bodyEffects(body, section);
    else if (section === 'photos') bodyPhotos(body);
    else if (section === 'bgs') bodyBgs(body);
    else if (section === 'bg') bodyBg(body);
    else if (section === 'audio') bodyAudio(body);
    else bodyVideo(body);
  }
  function renderPanel() {
    const box = root();
    if (!box) return;
    if (selL && !state.fx.layers.includes(selL)) selL = null;
    if (!box.querySelector('.fxp')) {
      box.innerHTML = `<h2 class="fxp-head">🎨 المونتاج والتأثيرات</h2>
        <nav class="fxp-menu" aria-label="أقسام المونتاج"></nav>
        <div class="fxp">
          <div class="fxp-main"><div class="fxp-title"></div><div class="fxp-body"></div></div>
          <aside class="fxp-prev">
            <canvas id="fxMini" width="540" height="960"></canvas>
            <div class="fxp-ctrl">
              <button type="button" class="btn gold" id="fxPlay" title="تشغيل / إيقاف">▶</button>
              <button type="button" class="btn small" id="fxUndo">↶ تراجع</button>
              <button type="button" class="btn small" id="fxRedo">↷</button>
            </div>
          </aside>
        </div>`;
      document.getElementById('fxPlay').onclick = () => document.getElementById('edPlay').click();
      document.getElementById('fxUndo').onclick = () => document.getElementById('edUndo').click();
      document.getElementById('fxRedo').onclick = () => document.getElementById('edRedo').click();
      new IntersectionObserver((en) => { miniSeen = en[0].isIntersecting; if (miniSeen && !state.playing) drawIdle(); }).observe(document.getElementById('fxMini'));
      document.getElementById('fxMini').addEventListener('pointerdown', (e) => Editor.canvasDown(e));
      document.getElementById('fxMini').addEventListener('wheel', (e) => Editor.canvasWheel(e), { passive: false });
    }
    renderMenu();
    renderBody();
  }
  // المعاينة الصغيرة: نسخة من الفيديو، وبتترسم بس وهي ظاهرة على الشاشة
  let miniSeen = true;
  function mirror() {
    const m = document.getElementById('fxMini');
    if (!m || state.playing?.fast || !miniSeen) return;
    const w = canvas.width, hh = canvas.height;
    if (m.width !== w) m.width = w;
    if (m.height !== hh) m.height = hh;
    m.getContext('2d').drawImage(canvas, 0, 0, w, hh);
  }
  // من الشريط الزمني: "عدّل شكله" بيفتح القسم بتاعه
  function openLayer(l) {
    selL = l;
    section = groupOf(l);
    const g = VIZ_GROUPS.findIndex((x) => x[1].includes(l.kind));
    if (g >= 0) vizGroup = g;
    renderMenu(); renderBody(); drawIdle();
    root()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // الصور المصغرة ثابتة عشان الصفحة تفضل خفيفة، وبتتحرك لما الماوس يقف عليها بس
  const STILL = FXLIB.fakeAudio(1.3);
  let hoverThumb = null;
  const paintThumb = ({ c, l }, A) => { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); FXLIB.render(g, c.width, c.height, l, A); };
  function startThumbs() {
    for (const t of thumbs) {
      paintThumb(t, STILL);
      const tile = t.c.parentElement;
      tile.addEventListener('mouseenter', () => { hoverThumb = t; animateHover(); });
      tile.addEventListener('mouseleave', () => { if (hoverThumb === t) hoverThumb = null; paintThumb(t, STILL); });
    }
  }
  function animateHover() {
    if (thumbOn) return;
    thumbOn = true;
    let last = 0;
    const step = (now) => {
      if (!hoverThumb || !hoverThumb.c.isConnected) { thumbOn = false; return; }
      requestAnimationFrame(step);
      if (now - last < 40) return;
      last = now;
      paintThumb(hoverThumb, FXLIB.fakeAudio(now / 1000));
    };
    requestAnimationFrame(step);
  }

  // وإنت واقف: الحركة تشتغل شوية عشان تشوف شكلها وإنت بتظبطها
  let clockExtra = 0, previewUntil = 0, previewOn = false;
  function previewLoop() {
    if (!activeAnims()) return;
    previewUntil = performance.now() + 2500;
    if (previewOn) return;
    previewOn = true;
    let last = performance.now();
    const step = (now) => {
      if (state.playing || now > previewUntil) { previewOn = false; return; }
      clockExtra += (now - last) / 1000; last = now;
      drawIdle();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const activeAnims = () => state.fx.layers.length || FX_LOOPING.has(state.fx.anim) || state.segs.some((s) => FX_LOOPING.has(s.anim)) || state.texts.some((s) => FX_LOOPING.has(s.anim));

  return { load, save, layerOf, drawLayer, drawBg, camera, vignette, frame, refreshMenu: () => renderMenu(), drawLayers, hit, handleAt, touchPhoto, afterDrag, wheelResize, openLayer, mirror, finish, renderPanel, clearLayers, previewLoop, clock: () => clockExtra };
})();

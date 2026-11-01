// مكتبة المؤثرات: ذبذبات الصوت (محسوبة من ملف الصوت نفسه) ومؤثرات الجو
// كل مؤثر "طبقة" بترسم نفسها على أي canvas — نفس الكود بيرسم الفيديو والصور المصغرة في المعرض
const FXLIB = (() => {
  // ---------- طيف الصوت ----------
  const FFT = 2048, BANDS = 64;
  const hann = new Float32Array(FFT), re = new Float32Array(FFT), im = new Float32Array(FFT), rev = new Uint16Array(FFT);
  const cosT = new Float32Array(FFT / 2), sinT = new Float32Array(FFT / 2);
  for (let i = 0; i < FFT; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1));
    let r = 0;
    for (let b = 0, v = i; b < 11; b++, v >>= 1) r = (r << 1) | (v & 1);
    rev[i] = r;
  }
  for (let i = 0; i < FFT / 2; i++) { cosT[i] = Math.cos((2 * Math.PI * i) / FFT); sinT[i] = Math.sin((2 * Math.PI * i) / FFT); }
  function fft() {
    for (let i = 0; i < FFT; i++) { const j = rev[i]; if (j > i) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; } }
    for (let size = 2; size <= FFT; size *= 2) {
      const half = size / 2, step = FFT / size;
      for (let i = 0; i < FFT; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const l = i + j, m = l + half, tr = re[m] * cosT[k] + im[m] * sinT[k], ti = im[m] * cosT[k] - re[m] * sinT[k];
          re[m] = re[l] - tr; im[m] = im[l] - ti; re[l] += tr; im[l] += ti;
        }
      }
    }
  }
  const sp = { buf: null, ref: 1, edges: [], bands: new Float32Array(BANDS), last: -9, level: 0, bass: 0 };
  const tmp = new Float32Array(BANDS);
  function rawBands(buf, t) {
    const d = buf.getChannelData(0), i0 = Math.floor(t * buf.sampleRate) - FFT / 2;
    for (let i = 0; i < FFT; i++) { re[i] = (d[i0 + i] || 0) * hann[i]; im[i] = 0; }
    fft();
    for (let b = 0; b < BANDS; b++) {
      const [a, z] = sp.edges[b];
      let s = 0;
      for (let i = a; i <= z; i++) s += Math.hypot(re[i], im[i]);
      // الترددات العالية في الصوت البشري أضعف، فبنرفعها شوية عشان كل الأعمدة تتحرك
      tmp[b] = (s / (z - a + 1)) * (1 + (b / BANDS) * 4);
    }
    return tmp;
  }
  function setBuffer(buf) {
    sp.buf = buf; sp.last = -9; sp.bands.fill(0);
    const hz = buf.sampleRate / FFT;
    sp.edges = Array.from({ length: BANDS }, (_, b) => {
      const a = Math.max(1, Math.round((90 * Math.pow(5500 / 90, b / BANDS)) / hz));
      return [a, Math.max(a, Math.round((90 * Math.pow(5500 / 90, (b + 1) / BANDS)) / hz) - 1)];
    });
    const vals = [];
    for (let i = 1; i <= 40; i++) { const b = rawBands(buf, (buf.duration * i) / 41); for (let j = 0; j < BANDS; j += 3) vals.push(b[j]); }
    vals.sort((a, c) => a - c);
    sp.ref = vals[Math.floor(vals.length * 0.97)] || 1;
  }
  function audioAt(bt) {
    const buf = state.buf;
    if (!buf) return sp;
    if (sp.buf !== buf) setBuffer(buf);
    if (bt === sp.last) return sp;
    const b = rawBands(buf, bt), dt = bt - sp.last, jump = dt < 0 || dt > 0.4;
    const fall = jump ? 0 : Math.pow(0.82, dt * 60);
    let lv = 0, bs = 0;
    for (let i = 0; i < BANDS; i++) {
      const v = Math.min(1, Math.pow(b[i] / sp.ref, 0.75));
      sp.bands[i] = Math.max(v, sp.bands[i] * fall);
      lv += sp.bands[i];
      if (i < 12) bs += sp.bands[i];
    }
    sp.level = lv / BANDS; sp.bass = bs / 12; sp.last = bt;
    return sp;
  }

  // موجة الصوت كلها (لشريط "خط ماشي من أول الفيديو لآخره")
  const envs = new WeakMap();
  function envOf(buf) {
    let e = envs.get(buf);
    if (e) return e;
    const d = buf.getChannelData(0), hop = Math.floor(buf.sampleRate / 50);
    e = new Float32Array(Math.ceil(d.length / hop));
    let top = 0.001;
    for (let i = 0; i < e.length; i++) {
      let s = 0, n = 0;
      for (let j = i * hop, end = Math.min(d.length, j + hop); j < end; j += 8) { s += d[j] * d[j]; n++; }
      e[i] = Math.sqrt(s / Math.max(1, n));
      if (e[i] > top) top = e[i];
    }
    for (let i = 0; i < e.length; i++) e[i] = Math.min(1, (e[i] / top) * 1.25);
    envs.set(buf, e);
    return e;
  }

  // بيانات الصوت لفريم من الفيديو
  function frameAudio(bt, t) {
    const a = audioAt(bt), buf = state.buf, e = buf ? envOf(buf) : null, d = D() || 1;
    return {
      bands: a.bands, level: a.level, bass: a.bass, t, dur: d, prog: Math.min(1, t / d), clock: bt,
      wave: (u) => (e ? e[Math.min(e.length - 1, Math.max(0, Math.round((state.audioIn + u * d) * 50)))] : 0),
    };
  }
  // صوت وهمي للصور المصغرة في المعرض
  const fakeBands = new Float32Array(BANDS);
  function fakeAudio(clock) {
    let lv = 0;
    for (let i = 0; i < BANDS; i++) {
      fakeBands[i] = Math.max(0.05, 0.55 + 0.4 * Math.sin(i * 0.5 + clock * 5) * Math.sin(i * 0.17 - clock * 2.3));
      lv += fakeBands[i];
    }
    return {
      bands: fakeBands, level: lv / BANDS, bass: 0.55 + 0.35 * Math.sin(clock * 4), t: clock % 6, dur: 6, prog: (clock % 6) / 6, clock,
      wave: (u) => 0.45 + 0.4 * Math.sin(u * 34) * Math.sin(u * 9 + 1),
    };
  }

  // ---------- أدوات رسم ----------
  const hex2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, u) => { const A = hex2(a), B = hex2(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * u)).join(',')})`; };
  const rgba = (h, al) => { const c = hex2(h); return `rgba(${c[0]},${c[1]},${c[2]},${al})`; };
  // قيمة الطيف على مكان u من 0 لـ 1 (متماثلة يمين وشمال)
  const val = (A, l, u) => {
    const p = Math.abs(2 * u - 1) * (BANDS - 1), i = Math.floor(p), f = p - i;
    const v = A.bands[i] * (1 - f) + (A.bands[Math.min(BANDS - 1, i + 1)] || 0) * f;
    return Math.min(1.25, v * l.sens);
  };
  // توهج خفيف من غير shadowBlur (أسرع بكتير وقت التسجيل)
  function strokeGlow(g, l, k, lw) {
    if (l.glow > 0) {
      const a = g.globalAlpha, op = g.globalCompositeOperation;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a * 0.16; g.lineWidth = lw + l.glow * k * 1.1; g.stroke();
      g.globalAlpha = a * 0.3; g.lineWidth = lw + l.glow * k * 0.45; g.stroke();
      g.globalAlpha = a; g.globalCompositeOperation = op;
    }
    g.lineWidth = lw; g.stroke();
  }
  const gradAt = (g, l, x0, y0, x1, y1) => {
    const c = g.createLinearGradient(x0, y0, x1, y1);
    c.addColorStop(0, l.color); c.addColorStop(1, l.color2 || l.color);
    return c;
  };

  // ---------- الأشكال ----------
  const circlePts = () => Array.from({ length: 180 }, (_, i) => { const a = (i / 180) * 2 * Math.PI - Math.PI / 2; return [Math.cos(a), Math.sin(a)]; });
  const polar = (fn, n = 360) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; const r = fn(a); return [Math.sin(a) * r, -Math.cos(a) * r]; });
  const poly = (verts) => { const out = []; verts.forEach((p, i) => { const q = verts[(i + 1) % verts.length]; for (let s = 0; s < 24; s++) out.push([p[0] + ((q[0] - p[0]) * s) / 24, p[1] + ((q[1] - p[1]) * s) / 24]); }); return out; };
  const ngon = (n, r2 = 1) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI, r = i % 2 ? r2 : 1; return [Math.sin(a) * r, -Math.cos(a) * r]; });
  const SHAPES = {
    circle: ['⭕ دايرة', circlePts],
    heart: ['❤️ قلب', () => Array.from({ length: 300 }, (_, i) => {
      const a = (i / 300) * 2 * Math.PI;
      return [(16 * Math.sin(a) ** 3) / 17, (-(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) + 2) / 17];
    })],
    star: ['۞ نجمة إسلامية', () => poly(ngon(16, 0.76))],
    flower: ['🌸 وردة', () => polar((a) => 0.78 + 0.22 * Math.cos(8 * a))],
    hex: ['⬡ سداسي', () => poly(ngon(6))],
    diamond: ['◆ معين', () => poly(ngon(4))],
    square: ['⬜ مربع', () => poly([[0, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85], [-0.85, -0.85]])],
    crescent: ['🌙 هلال', () => {
      // قوس الدايرة الكبيرة من طرف الهلال للطرف التاني، والرجوع على الدايرة الصغيرة
      const R = 0.95, r = 0.72, d = 0.38, tx = (d * d + R * R - r * r) / (2 * d), ty = Math.sqrt(R * R - tx * tx);
      const a0 = Math.atan2(ty, tx), b0 = Math.atan2(ty, tx - d), out = [];
      for (let i = 0; i < 160; i++) { const a = a0 + (i / 159) * (2 * Math.PI - 2 * a0); out.push([Math.cos(a) * R, Math.sin(a) * R]); }
      for (let i = 1; i < 119; i++) { const a = 2 * Math.PI - b0 - (i / 119) * (2 * Math.PI - 2 * b0); out.push([d + Math.cos(a) * r, Math.sin(a) * r]); }
      return out;
    }],
    arch: ['🕌 محراب', () => {
      const out = [[0, -1]];
      for (let i = 1; i <= 80; i++) { const u = i / 80; out.push([0.72 * Math.sin((u * Math.PI) / 2), -1 + 1.0 * (1 - Math.cos((u * Math.PI) / 2))]); }
      for (let i = 1; i <= 70; i++) out.push([0.72, 0 + (i / 70)]);
      for (let i = 1; i <= 90; i++) out.push([0.72 - (1.44 * i) / 90, 1]);
      for (let i = 1; i <= 70; i++) out.push([-0.72, 1 - i / 70]);
      for (let i = 1; i < 80; i++) { const u = 1 - i / 80; out.push([-0.72 * Math.sin((u * Math.PI) / 2), -1 + 1.0 * (1 - Math.cos((u * Math.PI) / 2))]); }
      return out;
    }],
    dome: ['🕌 قبة', () => {
      const right = [];
      for (let i = 0; i <= 90; i++) { const a = (i / 90) * 1.75; right.push([0.82 * Math.sin(a) ** 1.3, -0.12 - 0.88 * Math.cos(a)]); }
      const [ex, ey] = right[right.length - 1];
      for (let i = 1; i <= 12; i++) right.push([ex + (0.7 - ex) * (i / 12), ey + (0.1 - ey) * (i / 12)]);
      for (let i = 1; i <= 40; i++) right.push([0.7, 0.1 + 0.7 * (i / 40)]);
      const bottom = [];
      for (let i = 1; i < 60; i++) bottom.push([0.7 - (1.4 * i) / 60, 0.8]);
      return [...right, ...bottom, ...right.slice(1).reverse().map(([x, y]) => [-x, y])];
    }],
  };
  // نقط متساوية البعد على الشكل + الاتجاه لبرّه
  const ptsCache = new Map();
  function shapePts(name, n) {
    const key = name + ':' + n;
    if (ptsCache.has(key)) return ptsCache.get(key);
    const raw = (SHAPES[name] || SHAPES.circle)[1]();
    const lens = [0];
    for (let i = 0; i < raw.length; i++) { const p = raw[i], q = raw[(i + 1) % raw.length]; lens.push(lens[i] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
    const total = lens[raw.length], out = [];
    let j = 0;
    let area = 0;
    for (let i = 0; i < raw.length; i++) { const p = raw[i], q = raw[(i + 1) % raw.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const sign = area > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const d = (i / n) * total;
      while (lens[j + 1] < d) j++;
      const p = raw[j], q = raw[(j + 1) % raw.length], u = (d - lens[j]) / Math.max(1e-6, lens[j + 1] - lens[j]);
      out.push({ x: p[0] + (q[0] - p[0]) * u, y: p[1] + (q[1] - p[1]) * u });
    }
    for (let i = 0; i < n; i++) {
      const a = out[(i - 3 + n) % n], b = out[(i + 3) % n];
      const dx = b.x - a.x, dy = b.y - a.y, h = Math.hypot(dx, dy) || 1;
      out[i].nx = (dy / h) * sign; out[i].ny = (-dx / h) * sign;
    }
    ptsCache.set(key, out);
    return out;
  }

  function drawShape(g, W, H, k, l, A) {
    const n = l.style === 'line' || l.style === 'fill' ? 240 : Math.round(l.bars || 96);
    const pts = shapePts(l.shape, n), r = ((l.size / 100) * Math.min(W, H)) / 2;
    const maxH = r * 0.55 * (l.height / 100);
    g.translate(l.x * W, l.y * H);
    g.rotate(A.clock * (l.rot / 10));
    const s = 1 + A.bass * 0.07 * l.sens * (l.pulse ? 1 : 0);
    g.scale(s, s);
    const lw = l.thick * k;
    g.strokeStyle = g.fillStyle = gradAt(g, l, -r, -r, r, r);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (l.base) {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x * r, p.y * r) : g.moveTo(p.x * r, p.y * r)));
      g.closePath();
      const a = g.globalAlpha; g.globalAlpha = a * 0.55; g.lineWidth = Math.max(1, lw * 0.5); g.stroke(); g.globalAlpha = a;
    }
    if (l.style === 'bars' || l.style === 'double') {
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pts[i], h = 2 * k + val(A, l, i / n) * maxH, x = p.x * r, y = p.y * r;
        g.moveTo(x + (l.style === 'double' ? -p.nx * h * 0.6 : 0), y + (l.style === 'double' ? -p.ny * h * 0.6 : 0));
        g.lineTo(x + p.nx * h, y + p.ny * h);
      }
      strokeGlow(g, l, k, lw);
    } else if (l.style === 'dots') {
      g.beginPath();
      const rd = lw * 0.7;
      for (let i = 0; i < n; i++) {
        const p = pts[i], h = val(A, l, i / n) * maxH, x = p.x * r + p.nx * h, y = p.y * r + p.ny * h;
        g.moveTo(x + rd, y); g.arc(x, y, rd, 0, 6.3);
      }
      g.fill();
    } else {
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const p = pts[i % n], h = val(A, l, (i % n) / n) * maxH, x = p.x * r + p.nx * h, y = p.y * r + p.ny * h;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      if (l.style === 'fill') { const a = g.globalAlpha; g.globalAlpha = a * 0.35; g.fill(); g.globalAlpha = a; }
      strokeGlow(g, l, k, lw);
    }
  }

  // مستطيل حوالين الفيديو: نقطة u من 0 لـ 1 بتبدأ من نص الضلع اللي فوق وتلف مع عقارب الساعة
  function perimeter(W, H, m) {
    const w = W - 2 * m, h = H - 2 * m, tot = 2 * (w + h);
    return (u) => {
      let d = (((u % 1) + 1) % 1) * tot + w / 2;
      if (d >= tot) d -= tot;
      if (d < w) return { x: m + d, y: m, nx: 0, ny: 1 };
      d -= w;
      if (d < h) return { x: W - m, y: m + d, nx: -1, ny: 0 };
      d -= h;
      if (d < w) return { x: W - m - d, y: H - m, nx: 0, ny: -1 };
      d -= w;
      return { x: m, y: H - m - d, nx: 1, ny: 0 };
    };
  }

  // ---------- مؤثرات الجو ----------
  const RND = Array.from({ length: 2048 }, (_, i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); });
  const rnd = (i) => RND[i & 2047];
  const sprites = new Map();
  function softDot(color) {
    let c = sprites.get(color);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, rgba(color, 1)); r.addColorStop(0.35, rgba(color, 0.5)); r.addColorStop(1, rgba(color, 0));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    sprites.set(color, c);
    return c;
  }
  function raysSprite(color) {
    const key = 'rays' + color;
    let c = sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 640;
    const g = c.getContext('2d');
    g.translate(320, 320);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * 2 * Math.PI + rnd(i) * 0.2, w = 0.05 + rnd(i + 40) * 0.09, r = 200 + rnd(i + 80) * 120;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, rgba(color, 0.55)); gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, a - w, a + w); g.closePath(); g.fill();
    }
    sprites.set(key, c);
    return c;
  }
  function noiseTile() {
    let c = sprites.get('noise');
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), im2 = g.createImageData(256, 256);
    for (let i = 0; i < im2.data.length; i += 4) { const v = Math.random() * 255; im2.data[i] = im2.data[i + 1] = im2.data[i + 2] = v; im2.data[i + 3] = 46; }
    g.putImageData(im2, 0, 0);
    sprites.set('noise', c);
    return c;
  }
  const particles = (l, base) => Math.max(1, Math.round((base * l.amount) / 100));
  const AMB = {
    stars(g, W, H, k, l, A) {
      const s = softDot(l.color);
      for (let i = 0; i < particles(l, 130); i++) {
        const x = rnd(i * 3) * W, y = rnd(i * 3 + 1) * H, ph = rnd(i * 3 + 2) * 6.3;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(A.clock * l.speed * (0.6 + rnd(i) * 1.6) + ph));
        const r = (3 + rnd(i + 900) * 9) * k * (l.size / 100) * (0.8 + A.level * 0.5);
        g.globalAlpha = l.opacity * tw;
        g.drawImage(s, x - r, y - r, r * 2, r * 2);
      }
    },
    dust(g, W, H, k, l, A) {
      const s = softDot(l.color);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < particles(l, 70); i++) {
        const sp1 = 0.03 + rnd(i * 2) * 0.07, y = 1.05 - (((rnd(i * 5) + A.clock * sp1 * l.speed) % 1.1));
        const x = rnd(i * 7) + Math.sin(A.clock * 0.5 * l.speed + i) * 0.02;
        const r = (4 + rnd(i * 11) * 12) * k * (l.size / 100);
        g.globalAlpha = l.opacity * (0.35 + 0.65 * Math.abs(Math.sin(A.clock * 1.5 + i))) * (0.6 + A.level * 0.7);
        g.drawImage(s, x * W - r, y * H - r, r * 2, r * 2);
      }
    },
    snow(g, W, H, k, l, A) {
      const s = softDot(l.color);
      for (let i = 0; i < particles(l, 90); i++) {
        const sp1 = 0.04 + rnd(i * 2) * 0.09, y = ((rnd(i * 5) + A.clock * sp1 * l.speed) % 1.1) - 0.05;
        const x = rnd(i * 7) + Math.sin(A.clock * 0.7 * l.speed + i * 2) * 0.03;
        const r = (3 + rnd(i * 11) * 8) * k * (l.size / 100);
        g.globalAlpha = l.opacity * (0.4 + rnd(i * 13) * 0.6);
        g.drawImage(s, x * W - r, y * H - r, r * 2, r * 2);
      }
    },
    rain(g, W, H, k, l, A) {
      g.strokeStyle = rgba(l.color, 0.55); g.lineWidth = 1.6 * k * (l.size / 100); g.lineCap = 'round';
      g.globalAlpha = l.opacity;
      g.beginPath();
      for (let i = 0; i < particles(l, 170); i++) {
        const sp1 = 0.7 + rnd(i * 2) * 0.7, y = ((rnd(i * 5) + A.clock * sp1 * l.speed) % 1.1) - 0.05;
        const x = (rnd(i * 7) + (1 - y) * 0.06) % 1, len = (24 + rnd(i * 9) * 34) * k;
        g.moveTo(x * W, y * H); g.lineTo(x * W - len * 0.14, y * H + len);
      }
      g.stroke();
    },
    bokeh(g, W, H, k, l, A) {
      const s = softDot(l.color);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < particles(l, 22); i++) {
        const x = rnd(i * 3) + Math.sin(A.clock * 0.15 * l.speed + i) * 0.05, y = rnd(i * 5) + Math.cos(A.clock * 0.12 * l.speed + i * 2) * 0.05;
        const r = (45 + rnd(i * 7) * 110) * k * (l.size / 100) * (1 + A.bass * 0.12);
        g.globalAlpha = l.opacity * (0.12 + rnd(i * 11) * 0.22);
        g.drawImage(s, x * W - r, y * H - r, r * 2, r * 2);
      }
    },
    fireflies(g, W, H, k, l, A) {
      const s = softDot(l.color);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < particles(l, 26); i++) {
        const c = A.clock * 0.25 * l.speed;
        const x = 0.5 + 0.48 * Math.sin(c * (0.7 + rnd(i) * 0.8) + rnd(i + 20) * 6.3), y = 0.5 + 0.48 * Math.sin(c * (0.5 + rnd(i + 40) * 0.9) + rnd(i + 60) * 6.3);
        const r = (9 + rnd(i + 80) * 11) * k * (l.size / 100);
        g.globalAlpha = l.opacity * Math.max(0, Math.sin(A.clock * (0.8 + rnd(i + 90)) + i));
        g.drawImage(s, x * W - r, y * H - r, r * 2, r * 2);
      }
    },
    sparkle(g, W, H, k, l, A) {
      g.fillStyle = l.color;
      for (let i = 0; i < particles(l, 34); i++) {
        const period = 1.6 + rnd(i * 3) * 2.2, tt = (A.clock * l.speed + rnd(i * 5) * 9) / period, cyc = Math.floor(tt), f = tt - cyc;
        const x = rnd(i * 7 + cyc * 13) * W, y = rnd(i * 11 + cyc * 17) * H, r = (8 + rnd(i * 13) * 20) * k * (l.size / 100) * Math.sin(f * Math.PI);
        g.globalAlpha = l.opacity * Math.sin(f * Math.PI);
        g.beginPath();
        g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r);
        g.fill();
      }
    },
    shooting(g, W, H, k, l, A) {
      g.lineCap = 'round';
      for (let i = 0; i < particles(l, 4); i++) {
        const period = 3.5 + rnd(i * 3) * 3, tt = (A.clock * l.speed + rnd(i * 5) * 9) / period, cyc = Math.floor(tt), f = (tt - cyc) * 3.5;
        if (f > 1) continue;
        const x0 = 0.25 + rnd(i * 7 + cyc) * 0.9, y0 = rnd(i * 11 + cyc) * 0.45, len = 0.32;
        const x = x0 - f * len, y = y0 + f * len * 0.55;
        const gr = g.createLinearGradient(x * W, y * H, (x + 0.2) * W, (y - 0.11) * H);
        gr.addColorStop(0, rgba(l.color, 1)); gr.addColorStop(1, rgba(l.color, 0));
        g.strokeStyle = gr; g.lineWidth = 3 * k * (l.size / 100); g.globalAlpha = l.opacity * Math.sin(f * Math.PI);
        g.beginPath(); g.moveTo(x * W, y * H); g.lineTo((x + 0.2) * W, (y - 0.11) * H); g.stroke();
      }
    },
    rays(g, W, H, k, l, A) {
      const r = (Math.max(W, H) * 0.95 * l.size) / 100 * (1 + A.bass * 0.08);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = l.opacity * (0.55 + A.level * 0.6);
      g.translate(l.x * W, l.y * H);
      g.rotate(A.clock * 0.05 * l.speed);
      g.drawImage(raysSprite(l.color), -r, -r, r * 2, r * 2);
    },
    leak(g, W, H, k, l, A) {
      const s = softDot(l.color), s2 = softDot(l.color2 || l.color), c = A.clock * 0.25 * l.speed;
      g.globalCompositeOperation = 'lighter';
      const r = Math.max(W, H) * 0.55 * (l.size / 100);
      g.globalAlpha = l.opacity * (0.28 + 0.2 * Math.sin(c * 1.7));
      g.drawImage(s, W * (0.1 + 0.25 * Math.sin(c)) - r, H * (0.2 + 0.2 * Math.cos(c * 0.8)) - r, r * 2, r * 2);
      g.globalAlpha = l.opacity * (0.22 + 0.16 * Math.sin(c * 1.2 + 2));
      g.drawImage(s2, W * (0.9 + 0.2 * Math.cos(c * 1.1)) - r, H * (0.8 + 0.2 * Math.sin(c * 0.7)) - r, r * 2, r * 2);
    },
    fog(g, W, H, k, l, A) {
      const s = softDot(l.color);
      for (let i = 0; i < particles(l, 12); i++) {
        const x = ((rnd(i * 3) + A.clock * (0.008 + rnd(i * 5) * 0.015) * l.speed) % 1.4) - 0.2, y = 0.55 + rnd(i * 7) * 0.5;
        const r = (240 + rnd(i * 9) * 280) * k * (l.size / 100);
        g.globalAlpha = l.opacity * 0.2;
        g.drawImage(s, x * W - r, y * H - r, r * 2, r * 2);
      }
    },
    grain(g, W, H, k, l, A) {
      const c = noiseTile(), f = Math.floor(A.clock * 18);
      g.globalAlpha = l.opacity;
      g.globalCompositeOperation = 'overlay';
      const ox = -Math.floor(rnd(f) * 256), oy = -Math.floor(rnd(f + 7) * 256);
      for (let x = ox; x < W; x += 256) for (let y = oy; y < H; y += 256) g.drawImage(c, x, y);
    },
  };

  // ---------- أنواع الذبذبات غير الأشكال ----------
  // الصور: بتتحمّل مرة وبعد كده تترسم على طول
  const imgs = new Map();
  function imgOf(src) {
    if (imgs.has(src)) return imgs.get(src);
    const im = new Image();
    im.onload = () => { if (!state.playing) drawIdle(); };
    im.src = src;
    imgs.set(src, im);
    return im;
  }
  const VIZ = {
    shape: drawShape,
    photo(g, W, H, k, l, A) {
      const im = imgOf(l.src);
      if (!im.naturalWidth) return;
      const w = W * (l.size / 100), h = w * (im.naturalHeight / im.naturalWidth);
      g.translate(l.x * W, l.y * H);
      if (l.rotate) g.rotate((l.rotate * Math.PI) / 180);
      const s = l.voice ? 1 + A.bass * 0.05 * l.sens : 1;
      g.scale(l.flip ? -s : s, s);
      const path = () => {
        g.beginPath();
        if (l.frameShape === 'circle') { const r = Math.min(w, h) / 2; g.arc(0, 0, r, 0, 6.3); }
        else { const r = l.frameShape === 'round' ? Math.min(w, h) * 0.08 : 0; g.roundRect(-w / 2, -h / 2, w, h, r); }
      };
      const cropped = l.frameShape && l.frameShape !== 'free';
      if (l.shadow > 0) { g.shadowColor = 'rgba(0,0,0,.75)'; g.shadowBlur = l.shadow * k; g.shadowOffsetY = l.shadow * k * 0.25; }
      if (cropped) {
        g.save();
        // الظل بيترسم من الشكل نفسه قبل القص
        if (l.shadow > 0) { path(); g.fillStyle = '#000'; g.fill(); }
        g.shadowBlur = 0; g.shadowOffsetY = 0;
        path(); g.clip();
        if (l.frameShape === 'circle') { const d = Math.min(w, h), c = Math.max(d / w, d / h); g.drawImage(im, (-w * c) / 2, (-h * c) / 2, w * c, h * c); } else g.drawImage(im, -w / 2, -h / 2, w, h);
        g.restore();
        if (l.border > 0) { path(); g.strokeStyle = l.color; g.lineWidth = l.border * k; g.stroke(); }
      } else g.drawImage(im, -w / 2, -h / 2, w, h);
    },
    bars(g, W, H, k, l, A) {
      const n = Math.round(l.bars || 49), span = W * (l.size / 100), x0 = l.x * W - span / 2, cy = l.y * H, maxH = 150 * k * (l.height / 100);
      g.strokeStyle = gradAt(g, l, x0, 0, x0 + span, 0); g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const x = x0 + (span * i) / (n - 1), h = 3 * k + val(A, l, i / (n - 1)) * maxH;
        g.moveTo(x, cy + (l.mirror ? -h : 0)); g.lineTo(x, l.mirror ? cy + h : cy - h);
      }
      strokeGlow(g, l, k, l.thick * k);
    },
    blocks(g, W, H, k, l, A) {
      const n = Math.round(l.bars || 25), span = W * (l.size / 100), x0 = l.x * W - span / 2, cy = l.y * H;
      const w = (span / n) * 0.72, step = 13 * k * (l.height / 100), rows = 11;
      for (let i = 0; i < n; i++) {
        const lit = Math.round(val(A, l, i / (n - 1)) * rows), x = x0 + (span * i) / n;
        for (let r = 0; r < Math.max(1, lit); r++) {
          g.fillStyle = mix(l.color, l.color2 || l.color, r / rows);
          g.fillRect(x, cy - r * step, w, step * 0.72);
        }
      }
    },
    line(g, W, H, k, l, A) {
      const span = W * (l.size / 100), x0 = l.x * W - span / 2, cy = l.y * H, amp = (6 + (A.level * 1.1 * l.sens) * 120) * k * (l.height / 100);
      g.strokeStyle = gradAt(g, l, x0, 0, x0 + span, 0); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i <= 110; i++) {
        const u = i / 110, y = cy + Math.sin(u * Math.PI) ** 1.4 * amp * Math.sin(u * 22 - A.clock * 7) * (0.5 + val(A, l, u) * 0.7);
        if (i) g.lineTo(x0 + span * u, y); else g.moveTo(x0 + span * u, y);
      }
      strokeGlow(g, l, k, l.thick * k);
    },
    siri(g, W, H, k, l, A) {
      const span = W * (l.size / 100), x0 = l.x * W - span / 2, cy = l.y * H;
      g.globalCompositeOperation = 'lighter';
      const a0 = g.globalAlpha;
      for (let w = 0; w < 4; w++) {
        const amp = (10 + A.level * 150 * l.sens) * k * (l.height / 100) * (1 - w * 0.2), f = 2.2 + w * 0.8;
        g.fillStyle = gradAt(g, l, x0, 0, x0 + span, 0);
        g.globalAlpha = a0 * (0.42 - w * 0.06);
        g.beginPath();
        g.moveTo(x0, cy);
        for (let i = 0; i <= 80; i++) { const u = i / 80; g.lineTo(x0 + span * u, cy + Math.sin(u * Math.PI) ** 2 * amp * Math.sin(u * Math.PI * f + A.clock * (3 + w))); }
        for (let i = 80; i >= 0; i--) { const u = i / 80; g.lineTo(x0 + span * u, cy - Math.sin(u * Math.PI) ** 2 * amp * Math.sin(u * Math.PI * f + A.clock * (3 + w))); }
        g.closePath(); g.fill();
      }
    },
    ribbons(g, W, H, k, l, A) {
      const cy = l.y * H, a0 = g.globalAlpha;
      g.globalCompositeOperation = 'lighter';
      for (let w = 0; w < 5; w++) {
        const amp = (30 + A.level * 170 * l.sens) * k * (l.height / 100), th = (16 + w * 9) * k;
        g.fillStyle = mix(l.color, l.color2 || l.color, w / 4);
        g.globalAlpha = a0 * 0.22;
        g.beginPath();
        const yy = (u) => cy + amp * Math.sin(u * (3 + w * 0.7) + A.clock * (0.7 + w * 0.17) * l.speed + w);
        for (let i = 0; i <= 50; i++) g[i ? 'lineTo' : 'moveTo']((W * i) / 50, yy(i / 50) - th);
        for (let i = 50; i >= 0; i--) g.lineTo((W * i) / 50, yy(i / 50) + th);
        g.closePath(); g.fill();
      }
    },
    // خط ماشي من أول الفيديو لآخره: موجة الصوت كلها والجزء اللي اتقال بيتلوّن
    timeline(g, W, H, k, l, A) {
      const n = 80, span = W * (l.size / 100), right = l.x * W + span / 2, cy = l.y * H, maxH = 58 * k * (l.height / 100);
      for (const played of [false, true]) {
        g.strokeStyle = played ? gradAt(g, l, right, 0, right - span, 0) : 'rgba(255,255,255,.28)';
        g.lineCap = 'round';
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), on = u <= A.prog;
          if (on !== played) continue;
          const x = right - span * u, h = 3 * k + Math.min(1, A.wave(u) * l.sens) * maxH;
          g.moveTo(x, cy - h); g.lineTo(x, cy + h);
        }
        if (played) strokeGlow(g, l, k, l.thick * k); else { g.lineWidth = l.thick * k; g.stroke(); }
      }
      const hx = right - span * A.prog;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(hx, cy, (5 + A.level * 7) * k + l.thick * k * 0.4, 0, 6.3); g.fill();
    },
    // خط بسيط بيتمد من أول الفيديو لآخره وراسه بتنور وبتترعش مع الصوت
    runner(g, W, H, k, l, A) {
      const span = W * (l.size / 100), right = l.x * W + span / 2, cy = l.y * H, hx = right - span * A.prog;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = Math.max(1, l.thick * k * 0.5);
      g.beginPath(); g.moveTo(right, cy); g.lineTo(right - span, cy); g.stroke();
      g.strokeStyle = gradAt(g, l, right, 0, hx - 1, 0);
      g.beginPath();
      g.moveTo(right, cy);
      for (let x = right; x > hx; x -= 6 * k) {
        const d = (x - hx) / (150 * k), env = Math.exp(-d * d);
        g.lineTo(x, cy + env * Math.sin((x - hx) / (9 * k) + A.clock * 12) * (4 + A.level * 62 * l.sens) * k * (l.height / 100));
      }
      g.lineTo(hx, cy);
      strokeGlow(g, l, k, l.thick * k);
      const r = (34 + A.bass * 34) * k;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(softDot(l.color), hx - r, cy - r, r * 2, r * 2);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(hx, cy, (l.thick * 0.9 + 3) * k, 0, 6.3); g.fill();
    },
    // مستطيل نور بيلف حوالين الفيديو
    frameRun(g, W, H, k, l, A) {
      const P = perimeter(W, H, l.inset * k);
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (l.base) {
        g.strokeStyle = rgba(l.color, 0.22); g.lineWidth = Math.max(1, l.thick * k * 0.4);
        g.strokeRect(l.inset * k, l.inset * k, W - 2 * l.inset * k, H - 2 * l.inset * k);
      }
      const a0 = g.globalAlpha, count = Math.round(l.count || 2), tail = 0.16 + A.level * 0.14 * l.sens, segs = 34;
      for (let c = 0; c < count; c++) {
        const head = A.clock * l.speed * 0.12 + c / count;
        for (let s = 0; s < segs; s++) {
          const u0 = s / segs, u1 = (s + 1) / segs, p = P(head - tail * (1 - u0)), q = P(head - tail * (1 - u1));
          if (Math.abs(p.x - q.x) > 0 && Math.abs(p.y - q.y) > 0) continue; // ركن: نتخطى القطعة المايلة
          g.strokeStyle = mix(l.color2 || l.color, l.color, u1);
          const lw = l.thick * k * (0.3 + u1 * (0.9 + A.level * 0.9 * l.sens));
          g.globalAlpha = a0 * u1 * u1;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
          if (l.glow > 0 && s > segs * 0.6) { const op = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; const a = g.globalAlpha; g.globalAlpha = a * 0.28; g.lineWidth = lw + l.glow * k * 0.7; g.stroke(); g.globalAlpha = a; g.globalCompositeOperation = op; }
          g.lineWidth = lw; g.stroke();
        }
        const h = P(head), r = (26 + A.bass * 24 * l.sens) * k;
        g.globalAlpha = a0;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(softDot(l.color), h.x - r, h.y - r, r * 2, r * 2);
        g.globalCompositeOperation = 'source-over';
      }
    },
    // إطار بيتملي من أول الفيديو لآخره
    frameFill(g, W, H, k, l, A) {
      const P = perimeter(W, H, l.inset * k), half = A.prog / 2;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = Math.max(1, l.thick * k * 0.5);
      g.strokeRect(l.inset * k, l.inset * k, W - 2 * l.inset * k, H - 2 * l.inset * k);
      g.strokeStyle = gradAt(g, l, 0, 0, W, H);
      g.beginPath();
      const steps = 200;
      let prev = null;
      for (let i = -steps; i <= steps; i++) {
        const p = P((i / steps) * half);
        if (prev) { g.lineTo(p.x, p.y); } else g.moveTo(p.x, p.y);
        prev = p;
      }
      strokeGlow(g, l, k, l.thick * k * (1 + A.level * 0.6));
      for (const u of [half, -half]) {
        const p = P(u), r = (22 + A.bass * 26) * k;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(softDot(l.color), p.x - r, p.y - r, r * 2, r * 2);
        g.globalCompositeOperation = 'source-over';
      }
    },
    // أعمدة الذبذبات على حواف الفيديو كلها
    frameBars(g, W, H, k, l, A) {
      const P = perimeter(W, H, l.inset * k), n = Math.round(l.bars || 150), maxH = 95 * k * (l.height / 100);
      g.strokeStyle = gradAt(g, l, 0, 0, W, H); g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const u = i / n, p = P(u), h = 2 * k + val(A, l, u) * maxH;
        g.moveTo(p.x, p.y); g.lineTo(p.x + p.nx * h, p.y + p.ny * h);
      }
      strokeGlow(g, l, k, l.thick * k);
    },
    // إطار نيون بيتنفس مع الصوت
    frameNeon(g, W, H, k, l, A) {
      const m = l.inset * k, w = W - 2 * m, h = H - 2 * m, r = 26 * k;
      const a0 = g.globalAlpha, lv = Math.min(1, A.level * 1.4 * l.sens);
      g.strokeStyle = gradAt(g, l, 0, 0, W, H);
      g.beginPath();
      g.moveTo(m + r, m); g.arcTo(m + w, m, m + w, m + h, r); g.arcTo(m + w, m + h, m, m + h, r); g.arcTo(m, m + h, m, m, r); g.arcTo(m, m, m + w, m, r); g.closePath();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a0 * (0.1 + lv * 0.3); g.lineWidth = (l.thick + l.glow * 1.1) * k; g.stroke();
      g.globalAlpha = a0 * (0.2 + lv * 0.5); g.lineWidth = (l.thick + l.glow * 0.4) * k; g.stroke();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = a0 * (0.75 + lv * 0.25); g.lineWidth = l.thick * k * (0.7 + lv * 0.5); g.stroke();
      g.globalAlpha = a0;
    },
    // دواير بتطلع من المركز زي موجة في مية
    ripples(g, W, H, k, l, A) {
      const cx = l.x * W, cy = l.y * H, R = ((l.size / 100) * Math.min(W, H)) / 2, n = Math.round(l.count || 5), a0 = g.globalAlpha;
      g.strokeStyle = gradAt(g, l, cx - R, cy - R, cx + R, cy + R);
      for (let i = 0; i < n; i++) {
        const u = (A.clock * l.speed * 0.25 + i / n) % 1;
        g.globalAlpha = a0 * (1 - u) * (0.3 + A.level * 0.9 * l.sens);
        g.beginPath(); g.arc(cx, cy, Math.max(1, R * u * (1 + A.bass * 0.12)), 0, 6.3);
        strokeGlow(g, l, k, l.thick * k);
      }
    },
    // نقط بتلف في مدارات
    orbit(g, W, H, k, l, A) {
      const cx = l.x * W, cy = l.y * H, R = ((l.size / 100) * Math.min(W, H)) / 2, n = Math.round(l.bars || 90);
      g.fillStyle = gradAt(g, l, cx - R, cy - R, cx + R, cy + R);
      g.beginPath();
      for (let ring = 0; ring < 3; ring++) {
        for (let i = 0; i < n; i++) {
          const u = i / n, a = u * 6.283 + A.clock * (l.rot / 10) * (ring % 2 ? -1 : 1);
          const r = R * (0.6 + ring * 0.2) + val(A, l, u) * R * 0.28 * (l.height / 100);
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, d = l.thick * k * (0.28 + ring * 0.1);
          g.moveTo(x + d, y); g.arc(x, y, d, 0, 6.3);
        }
      }
      g.fill();
    },
    // مجرّة دوّارة
    spiral(g, W, H, k, l, A) {
      const cx = l.x * W, cy = l.y * H, R = ((l.size / 100) * Math.min(W, H)) / 2, n = Math.round(l.bars || 150);
      g.fillStyle = gradAt(g, l, cx - R, cy - R, cx + R, cy + R);
      g.beginPath();
      for (let arm = 0; arm < 4; arm++) {
        for (let i = 0; i < n / 4; i++) {
          const u = i / (n / 4), a = u * 5.5 + (arm / 4) * 6.283 + A.clock * (l.rot / 10);
          const r = R * (0.08 + u * 0.92) * (1 + val(A, l, u) * 0.22 * (l.height / 100)), d = l.thick * k * (0.25 + u * 0.55);
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          g.moveTo(x + d, y); g.arc(x, y, d, 0, 6.3);
        }
      }
      g.fill();
    },
    // شمس: أشعة مدببة بتطول مع الصوت
    sunburst(g, W, H, k, l, A) {
      const cx = l.x * W, cy = l.y * H, R = ((l.size / 100) * Math.min(W, H)) / 2, n = Math.round(l.bars || 56);
      g.translate(cx, cy);
      g.rotate(A.clock * (l.rot / 10));
      g.fillStyle = gradAt(g, l, -R, -R, R, R);
      g.globalCompositeOperation = l.glow > 0 ? 'lighter' : 'source-over';
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const u = i / n, a = u * 6.283, w = (Math.PI / n) * 0.75, r0 = R * 0.42, r1 = r0 + 8 * k + val(A, l, u) * R * 0.62 * (l.height / 100);
        g.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0);
        g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        g.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0);
      }
      g.fill();
    },
    // نقط على شبكة بتكبر مع الصوت
    dotgrid(g, W, H, k, l, A) {
      const cx = l.x * W, cy = l.y * H, R = ((l.size / 100) * Math.min(W, H)) / 2, n = 11, s = (R * 2) / (n - 1);
      g.fillStyle = gradAt(g, l, cx - R, cy - R, cx + R, cy + R);
      g.beginPath();
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const dx = i - 5, dy = j - 5, d = Math.hypot(dx, dy) / 7.1;
        if (d > 1) continue;
        const v = A.bands[Math.floor(d * (BANDS - 1))] * l.sens, x = cx + dx * s, y = cy + dy * s, r = (1.5 + v * s * 0.42 * (l.thick / 6));
        g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.3);
      }
      g.fill();
    },
  };

  // ---------- المعرض ----------
  const base = { color: '#f0d47a', color2: '#ffffff', opacity: 1, glow: 18, sens: 1, thick: 5, height: 100, x: 0.5, y: 0.5, size: 60, rot: 0, speed: 1, front: false, start: null, end: null };
  const shapeBase = { type: 'shape', style: 'bars', base: true, pulse: true, bars: 96, size: 62, y: 0.46 };
  const ambBase = { speed: 1, size: 100, amount: 100, opacity: 0.9 };
  const GALLERY = {
    viz: [
      ['circle', '⭕ كورة', { ...shapeBase, shape: 'circle' }],
      ['circleLine', '⭕ كورة خط', { ...shapeBase, shape: 'circle', style: 'line', color2: '#7fe0ff' }],
      ['circleDots', '⭕ كورة نقط', { ...shapeBase, shape: 'circle', style: 'dots', bars: 110 }],
      ['heart', '❤️ قلب', { ...shapeBase, shape: 'heart', color: '#ff5d7e', color2: '#ffc4d0', bars: 110, size: 66 }],
      ['heartLine', '❤️ قلب خط', { ...shapeBase, shape: 'heart', style: 'fill', color: '#ff5d7e', color2: '#ffc4d0', size: 66 }],
      ['star', '۞ نجمة إسلامية', { ...shapeBase, shape: 'star', rot: 1.5, bars: 128 }],
      ['flower', '🌸 وردة', { ...shapeBase, shape: 'flower', style: 'fill', height: 45, color: '#ffb2d8', color2: '#ffe08a', rot: 1 }],
      ['crescent', '🌙 هلال', { ...shapeBase, shape: 'crescent', bars: 120 }],
      ['arch', '🕌 محراب', { ...shapeBase, shape: 'arch', bars: 130, size: 72 }],
      ['dome', '🕌 قبة', { ...shapeBase, shape: 'dome', bars: 130, size: 64, height: 70 }],
      ['hex', '⬡ سداسي', { ...shapeBase, shape: 'hex', rot: 1, color: '#7fe0ff', color2: '#b18cff' }],
      ['diamond', '◆ معين', { ...shapeBase, shape: 'diamond', style: 'double', color: '#b18cff', color2: '#7fe0ff' }],
      ['timeline', '📈 خط من الأول للآخر', { type: 'timeline', y: 0.8, size: 82, thick: 5, sens: 1, height: 100 }],
      ['runner', '➖ خط ماشي بنور', { type: 'runner', y: 0.84, size: 84, thick: 5 }],
      ['frameRun', '🔲 مستطيل بيلف', { type: 'frameRun', inset: 26, thick: 7, count: 2, base: true, speed: 1, glow: 22, color2: '#ffffff' }],
      ['frameFill', '🔳 إطار بيتملي مع الفيديو', { type: 'frameFill', inset: 26, thick: 7 }],
      ['frameBars', '📊 ذبذبات على الحواف', { type: 'frameBars', inset: 12, thick: 5, bars: 150 }],
      ['frameNeon', '💡 إطار نيون', { type: 'frameNeon', inset: 26, thick: 5, glow: 34, color: '#7fe0ff', color2: '#b18cff' }],
      ['bars', '📊 أعمدة', { type: 'bars', y: 0.82, size: 72, mirror: true, bars: 49, thick: 7, height: 55 }],
      ['barsUp', '📶 أعمدة لفوق', { type: 'bars', y: 0.9, size: 86, mirror: false, bars: 41, thick: 12, height: 100 }],
      ['blocks', '🟧 معادل LED', { type: 'blocks', y: 0.88, size: 78, bars: 21, height: 100, color: '#4ee08a', color2: '#ff5d5d' }],
      ['line', '〰️ خط متموّج', { type: 'line', y: 0.82, size: 76, thick: 4 }],
      ['siri', '🌈 موجة ناعمة', { type: 'siri', y: 0.82, size: 90, color: '#7fe0ff', color2: '#ff7fd0' }],
      ['ribbons', '🎀 شرايط نور', { type: 'ribbons', y: 0.8, color: '#7fe0ff', color2: '#b18cff', speed: 1 }],
      ['ripples', '💧 دواير مية', { type: 'ripples', y: 0.46, size: 90, count: 5, thick: 3, speed: 1 }],
      ['orbit', '🪐 مدارات', { type: 'orbit', y: 0.46, size: 70, thick: 5, rot: 2, bars: 80 }],
      ['spiral', '🌌 مجرة', { type: 'spiral', y: 0.46, size: 90, thick: 5, rot: 2, bars: 170, color: '#b18cff', color2: '#7fe0ff' }],
      ['sunburst', '☀️ شمس', { type: 'sunburst', y: 0.46, size: 76, rot: 1 }],
      ['dotgrid', '🔵 شبكة نقط', { type: 'dotgrid', y: 0.46, size: 62, thick: 6, color: '#7fe0ff', color2: '#b18cff' }],
    ],
    amb: [
      ['stars', '✨ نجوم', { ...ambBase, type: 'stars', color: '#ffffff' }],
      ['shooting', '☄️ شهب', { ...ambBase, type: 'shooting', color: '#ffffff' }],
      ['dust', '🌟 غبار ذهبي', { ...ambBase, type: 'dust', color: '#f0d47a' }],
      ['sparkle', '💫 لمعان', { ...ambBase, type: 'sparkle', color: '#fff3c4' }],
      ['bokeh', '🔮 دواير نور', { ...ambBase, type: 'bokeh', color: '#f0d47a' }],
      ['fireflies', '🪲 يراعات', { ...ambBase, type: 'fireflies', color: '#d4ff8a' }],
      ['snow', '❄️ نور نازل', { ...ambBase, type: 'snow', color: '#ffffff' }],
      ['rain', '🌧 مطر', { ...ambBase, type: 'rain', color: '#cfe6ff', front: true }],
      ['rays', '🌅 أشعة نور', { ...ambBase, type: 'rays', x: 0.5, y: 0.02, color: '#ffe9b0', opacity: 0.6 }],
      ['leak', '🌈 تسريب ضوء', { ...ambBase, type: 'leak', color: '#ff9a4d', color2: '#ff5da8', opacity: 0.8 }],
      ['fog', '🌫 ضباب', { ...ambBase, type: 'fog', color: '#ffffff', opacity: 0.7 }],
      ['grain', '🎞 حبيبات فيلم', { ...ambBase, type: 'grain', front: true, opacity: 0.8 }],
    ],
  };
  const byId = new Map([...GALLERY.viz, ...GALLERY.amb].map(([id, name, o]) => [id, { id, name, o }]));
  let uid = 1;
  function make(id, over = {}) {
    const d = byId.get(id);
    return { ...base, ...d.o, ...over, id: Date.now().toString(36) + (uid++), kind: id, name: d.name };
  }
  // الطبقات اللي ليها مكان بيتسحب على الشاشة
  const isAmb = (l) => !!AMB[l.type];
  const isFrame = (l) => /^frame/.test(l.type);
  const movable = (l) => (!isAmb(l) && !isFrame(l) && l.type !== 'ribbons') || l.type === 'rays';

  function render(g, W, H, l, A, alpha = 1) {
    const k = Math.min(W, H) / 1080;
    g.save();
    g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.globalAlpha = l.opacity * alpha;
    (VIZ[l.type] || AMB[l.type])?.(g, W, H, k, { ...l, opacity: l.opacity * alpha }, A);
    g.restore();
  }

  return { GALLERY, SHAPES, make, render, frameAudio, fakeAudio, isAmb, isFrame, movable, audioAt, imgOf };
})();

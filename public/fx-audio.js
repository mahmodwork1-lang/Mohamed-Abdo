// معمل الصوت: تنضيف + معادل + ضغط + صدى + توحيد العلو — نفس السلسلة للتشغيل وللتصدير
const AFX_DEFAULT = {
  volume: 100, normalize: false, limiter: true, aIn: 0.08, aOut: 0.25,
  denoise: 0, hp: 20, hum: false, deess: 0,
  eq80: 0, eq250: 0, eq1k: 0, eq3k: 0, eq8k: 0,
  comp: 0, warmth: 0,
  reverb: 0, reverbType: 'mosque', echo: 0, echoTime: 0.35, width: 0,
};
const AFX_GROUPS = [
  ['النضافة', [
    { k: 'denoise', label: 'إزالة الوشيش %', type: 'range', min: 0, max: 100, step: 5 },
    { k: 'hp', label: 'قص الصوت التقيل تحت (Hz)', type: 'range', min: 20, max: 250, step: 5 },
    { k: 'deess', label: 'تخفيف حرف السين %', type: 'range', min: 0, max: 100, step: 5 },
    { k: 'hum', label: 'إزالة زن الكهربا', type: 'check' },
  ]],
  ['المعادل (الجهير والحدة)', [
    { k: 'eq80', label: 'جهير عميق 80Hz', type: 'range', min: -12, max: 12 },
    { k: 'eq250', label: 'دفا 250Hz', type: 'range', min: -12, max: 12 },
    { k: 'eq1k', label: 'وسط 1kHz', type: 'range', min: -12, max: 12 },
    { k: 'eq3k', label: 'وضوح الصوت 3kHz', type: 'range', min: -12, max: 12 },
    { k: 'eq8k', label: 'لمعة 8kHz', type: 'range', min: -12, max: 12 },
  ]],
  ['القوة والعلو', [
    { k: 'volume', label: 'علو الصوت %', type: 'range', min: 20, max: 300, step: 5 },
    { k: 'comp', label: 'ضغط الصوت (يقرّب العالي من الواطي) %', type: 'range', min: 0, max: 100, step: 5 },
    { k: 'warmth', label: 'دفا وتشبّع %', type: 'range', min: 0, max: 100, step: 5 },
    { k: 'normalize', label: 'توحيد العلو تلقائيًا', type: 'check' },
    { k: 'limiter', label: 'حماية من التشويش (ليميتر)', type: 'check' },
  ]],
  ['المكان والصدى', [
    { k: 'reverbType', label: 'نوع المكان', type: 'select', opts: [['mosque', 'مسجد كبير'], ['hall', 'قاعة'], ['plate', 'صدى ناعم'], ['room', 'أوضة صغيرة']] },
    { k: 'reverb', label: 'قوة المكان %', type: 'range', min: 0, max: 100, step: 5 },
    { k: 'echo', label: 'تكرار (Echo) %', type: 'range', min: 0, max: 100, step: 5 },
    { k: 'echoTime', label: 'وقت التكرار (ثانية)', type: 'range', min: 0.1, max: 0.8, step: 0.05, show: (f) => f.echo > 0 },
    { k: 'width', label: 'اتساع الصوت (ستيريو) %', type: 'range', min: 0, max: 100, step: 5 },
  ]],
  ['الدخول والخروج', [
    { k: 'aIn', label: 'الصوت يعلى في أوله (ثانية)', type: 'range', min: 0.02, max: 3, step: 0.02 },
    { k: 'aOut', label: 'الصوت يوطى في آخره (ثانية)', type: 'range', min: 0.02, max: 4, step: 0.02 },
  ]],
];
const AFX_AUTO = { normalize: true, limiter: true, denoise: 35, hp: 80, deess: 20, eq3k: 2, comp: 30 };

const AFX = (() => {
  // ---------- إزالة الوشيش ----------
  const cleaned = new WeakMap(); // buf → Map(amount → AudioBuffer | Promise)
  let worker, seq = 0;
  const pending = new Map();
  function denoise(buf, amount) {
    let m = cleaned.get(buf);
    if (!m) { m = new Map(); cleaned.set(buf, m); }
    if (m.has(amount)) return m.get(amount);
    worker = worker || (() => {
      const w = new Worker('denoise-worker.js');
      w.onmessage = ({ data }) => { pending.get(data.id)?.(data.channels); pending.delete(data.id); };
      return w;
    })();
    const id = ++seq;
    const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice());
    const p = new Promise((resolve) => {
      pending.set(id, (out) => {
        const nb = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
        out.forEach((c, i) => nb.copyToChannel(c, i));
        m.set(amount, nb);
        resolve(nb);
      });
      worker.postMessage({ id, channels, amount }, channels.map((c) => c.buffer));
    });
    m.set(amount, p);
    return p;
  }
  // الصوت اللي هيتشغّل فعلاً (بعد التنضيف لو مطلوب)
  async function prepare() {
    const f = state.fx;
    if (!state.buf || f.bypass || !f.denoise) return state.buf;
    return denoise(state.buf, f.denoise);
  }
  function source() {
    const f = state.fx;
    if (!state.buf || f.bypass || !f.denoise) return state.buf;
    const c = cleaned.get(state.buf)?.get(f.denoise);
    return c instanceof AudioBuffer ? c : state.buf;
  }

  // ---------- توحيد العلو: متوسط علو أجزاء الكلام يبقى -16dB ----------
  const TARGET = Math.pow(10, -16 / 20);
  const normCache = new WeakMap();
  function normGain(buf, a, b) {
    const key = `${a.toFixed(2)}:${b.toFixed(2)}`;
    let m = normCache.get(buf);
    if (!m) { m = new Map(); normCache.set(buf, m); }
    if (m.has(key)) return m.get(key);
    const d = buf.getChannelData(0), sr = buf.sampleRate, hop = Math.floor(sr * 0.1), vals = [];
    for (let i = Math.floor(a * sr); i + hop <= Math.min(d.length, b * sr); i += hop) {
      let s = 0;
      for (let j = i; j < i + hop; j += 4) s += d[j] * d[j];
      vals.push(Math.sqrt(s / (hop / 4)));
    }
    const top = Math.max(...vals, 1e-6), loud = vals.filter((v) => v > top * 0.1);
    const avg = Math.sqrt(loud.reduce((s, v) => s + v * v, 0) / Math.max(1, loud.length)) || 1e-6;
    const g = Math.max(0.2, Math.min(8, TARGET / avg));
    m.set(key, g);
    return g;
  }

  // ---------- المكان ----------
  const IMPULSE = { mosque: [3.4, 0.03, 2.6, 0.55], hall: [2.2, 0.02, 3, 0.4], plate: [1.5, 0.005, 3.5, 0.15], room: [0.6, 0.002, 3, 0.3] };
  const impulses = new WeakMap();
  function impulse(ac, type) {
    let m = impulses.get(ac);
    if (!m) { m = new Map(); impulses.set(ac, m); }
    if (m.has(type)) return m.get(type);
    const [sec, pre, curve, dark] = IMPULSE[type] || IMPULSE.mosque, len = Math.floor(ac.sampleRate * sec), start = Math.floor(ac.sampleRate * pre);
    const b = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = start; i < len; i++) {
        const u = (i - start) / (len - start);
        // الترددات العالية بتموت أسرع زي الأماكن الحقيقية
        const k = 1 - dark * (0.4 + 0.6 * u);
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.pow(1 - u, curve);
      }
    }
    m.set(type, b);
    return b;
  }
  const biquad = (ac, type, freq, gain = 0, q = 1) => { const n = ac.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.gain.value = gain; n.Q.value = q; return n; };
  const saturate = (amount) => {
    // ميل 1 عند الصوت الواطي (مابيعليش الصوت)، والتشبّع بيبان على القمم بس
    const c = new Float32Array(2048), k = 1 + (amount / 100) * 2.5;
    for (let i = 0; i < 2048; i++) { const x = (i / 1023.5) - 1; c[i] = Math.tanh(k * x) / k; }
    return c;
  };

  const ceilingCurve = (() => {
    const c = new Float32Array(4096), top = Math.pow(10, -0.5 / 20), knee = 0.8;
    for (let i = 0; i < 4096; i++) {
      const x = (i / 2047.5) - 1, a = Math.abs(x);
      c[i] = Math.sign(x) * (a < knee ? a : knee + (top - knee) * Math.tanh((a - knee) / (top - knee)));
    }
    return c;
  })();

  // بيوصّل السلسلة كلها وبيرجع آخر نقطة
  function chain(ac, input, buf, from, to) {
    const f = state.fx;
    const out = ac.createGain();
    if (f.bypass) { out.gain.value = 1; input.connect(out); return out; }
    let node = input;
    const add = (n) => { node.connect(n); node = n; return n; };
    if (f.hp > 25) add(biquad(ac, 'highpass', f.hp, 0, 0.7));
    if (f.hum) { add(biquad(ac, 'notch', 50, 0, 12)); add(biquad(ac, 'notch', 100, 0, 12)); add(biquad(ac, 'notch', 150, 0, 12)); }
    if (f.deess > 0) add(biquad(ac, 'peaking', 6800, -(f.deess / 100) * 9, 1.2));
    if (f.eq80) add(biquad(ac, 'lowshelf', 80, f.eq80));
    if (f.eq250) add(biquad(ac, 'peaking', 250, f.eq250, 0.9));
    if (f.eq1k) add(biquad(ac, 'peaking', 1000, f.eq1k, 0.9));
    if (f.eq3k) add(biquad(ac, 'peaking', 3000, f.eq3k, 0.9));
    if (f.eq8k) add(biquad(ac, 'highshelf', 8000, f.eq8k));
    if (f.warmth > 0) { const w = ac.createWaveShaper(); w.curve = saturate(f.warmth); w.oversample = '2x'; add(w); }
    if (f.comp > 0) {
      const c = ac.createDynamicsCompressor(), u = f.comp / 100;
      c.threshold.value = -10 - u * 24; c.ratio.value = 1.5 + u * 4.5; c.knee.value = 12; c.attack.value = 0.006; c.release.value = 0.16;
      add(c);
    }
    // الفرع النظيف + فروع المكان والتكرار
    const mixBus = ac.createGain();
    node.connect(mixBus);
    if (f.reverb > 0) {
      const conv = ac.createConvolver(); conv.buffer = impulse(ac, f.reverbType);
      const wet = ac.createGain(); wet.gain.value = (f.reverb / 100) * 0.9;
      node.connect(conv); conv.connect(wet); wet.connect(mixBus);
    }
    if (f.echo > 0) {
      const dl = ac.createDelay(1.2); dl.delayTime.value = f.echoTime;
      const fb = ac.createGain(); fb.gain.value = 0.2 + (f.echo / 100) * 0.3;
      const tone = biquad(ac, 'lowpass', 3500, 0, 0.7);
      const wet = ac.createGain(); wet.gain.value = (f.echo / 100) * 0.55;
      node.connect(dl); dl.connect(tone); tone.connect(fb); fb.connect(dl); tone.connect(wet); wet.connect(mixBus);
    }
    node = mixBus;
    if (f.width > 0) {
      // بنحوّله ستيريو ونأخر قناة واحدة شوية
      const up = ac.createGain(); up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers';
      const sp = ac.createChannelSplitter(2), mg = ac.createChannelMerger(2), dl = ac.createDelay(0.05);
      dl.delayTime.value = (f.width / 100) * 0.016;
      node.connect(up); up.connect(sp);
      sp.connect(mg, 0, 0); sp.connect(dl, 1); dl.connect(mg, 0, 1);
      node = mg;
    }
    const vol = ac.createGain();
    vol.gain.value = (f.volume / 100) * (f.normalize ? normGain(buf, from, to) : 1);
    add(vol);
    if (f.limiter || f.normalize) {
      const lim = ac.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
      add(lim);
      // الكومبريسور في المتصفح بيعلّي الصوت شوية لوحده، فبنرجّعه لنفس المستوى
      const trim = ac.createGain(); trim.gain.value = Math.pow(10, -1.7 / 20);
      add(trim);
      // سقف أخير: مفيش قمة تعدي -0.5dB مهما حصل (القمم السريعة اللي الليميتر مالحقهاش)
      const ceil = ac.createWaveShaper(); ceil.curve = ceilingCurve; add(ceil);
    }
    node.connect(out);
    return out;
  }

  // ---------- مؤشر العلو ----------
  let analyser = null;
  function attachMeter(ac, node) {
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    node.connect(analyser);
  }
  const data = new Float32Array(2048);
  function peakDb() {
    if (!analyser || !state.playing) return -Infinity;
    analyser.getFloatTimeDomainData(data);
    let p = 0;
    for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > p) p = a; }
    return 20 * Math.log10(p + 1e-9);
  }
  return { prepare, source, chain, attachMeter, peakDb };
})();

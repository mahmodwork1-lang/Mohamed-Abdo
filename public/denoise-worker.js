// إزالة الوشيش: بنتعلم شكل الضوضاء الثابتة من أهدى لحظات التسجيل ونطرحها (Spectral Gating) — شغال في الخلفية
const N = 2048, HOP = 512;
const win = new Float32Array(N), re = new Float32Array(N), im = new Float32Array(N), rev = new Uint16Array(N);
const cosT = new Float32Array(N / 2), sinT = new Float32Array(N / 2);
for (let i = 0; i < N; i++) {
  win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  let r = 0;
  for (let b = 0, v = i; b < 11; b++, v >>= 1) r = (r << 1) | (v & 1);
  rev[i] = r;
}
for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos((2 * Math.PI * i) / N); sinT[i] = Math.sin((2 * Math.PI * i) / N); }
function fft(inverse) {
  for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let a = re[i]; re[i] = re[j]; re[j] = a; a = im[i]; im[i] = im[j]; im[j] = a; } }
  const sg = inverse ? -1 : 1;
  for (let size = 2; size <= N; size *= 2) {
    const half = size / 2, step = N / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const l = i + j, m = l + half, c = cosT[k], s = sg * sinT[k];
        const tr = re[m] * c + im[m] * s, ti = im[m] * c - re[m] * s;
        re[m] = re[l] - tr; im[m] = im[l] - ti; re[l] += tr; im[l] += ti;
      }
    }
  }
  if (inverse) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
}
function clean(x, amount) {
  const bins = N / 2 + 1, frames = Math.max(1, Math.floor((x.length - N) / HOP) + 1);
  // شكل الضوضاء: أهدى ١٥٪ من الفريمات لكل تردد
  const every = Math.max(1, Math.floor(frames / 500)), hist = [];
  for (let f = 0; f < frames; f += every) {
    for (let i = 0; i < N; i++) { re[i] = (x[f * HOP + i] || 0) * win[i]; im[i] = 0; }
    fft(false);
    const mag = new Float32Array(bins);
    for (let b = 0; b < bins; b++) mag[b] = Math.hypot(re[b], im[b]);
    hist.push(mag);
  }
  const noise = new Float32Array(bins), col = new Float32Array(hist.length);
  for (let b = 0; b < bins; b++) {
    for (let k = 0; k < hist.length; k++) col[k] = hist[k][b];
    const s = Float32Array.from(col).sort();
    noise[b] = s[Math.floor(s.length * 0.15)];
  }
  const over = 1 + (amount / 100) * 2.5, floor = 1 - (amount / 100) * 0.88;
  const out = new Float32Array(x.length), norm = new Float32Array(x.length), prev = new Float32Array(bins).fill(1);
  for (let f = 0; f < frames; f++) {
    const at = f * HOP;
    for (let i = 0; i < N; i++) { re[i] = (x[at + i] || 0) * win[i]; im[i] = 0; }
    fft(false);
    for (let b = 0; b < bins; b++) {
      const m = Math.hypot(re[b], im[b]) + 1e-12;
      let g = Math.max(floor, 1 - (over * noise[b]) / m);
      // تنعيم في الزمن عشان مايبقاش فيه "صوت معدني"
      g = g > prev[b] ? 0.55 * g + 0.45 * prev[b] : 0.3 * g + 0.7 * prev[b];
      prev[b] = g;
      re[b] *= g; im[b] *= g;
      if (b > 0 && b < N / 2) { re[N - b] = re[b]; im[N - b] = -im[b]; }
    }
    fft(true);
    for (let i = 0; i < N; i++) { out[at + i] += re[i] * win[i]; norm[at + i] += win[i] * win[i]; }
  }
  for (let i = 0; i < x.length; i++) out[i] = norm[i] > 1e-3 ? out[i] / norm[i] : x[i];
  return out;
}
self.onmessage = ({ data }) => {
  const channels = data.channels.map((c) => clean(c, data.amount));
  self.postMessage({ id: data.id, channels }, channels.map((c) => c.buffer));
};

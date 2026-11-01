// إزالة خلفية الصورة (بتتعمل على الجهاز نفسه) — الموديل بينزل مرة واحدة
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
let p;
self.onmessage = async ({ data }) => {
  try {
    p = p || pipeline('background-removal', 'Xenova/modnet', { device: 'wasm', dtype: 'fp32', progress_callback: (e) => { if (e.status === 'progress' && e.total) self.postMessage({ type: 'status', pct: Math.round((e.loaded / e.total) * 100) }); } });
    const remove = await p;
    const out = await remove(data.url);
    const img = Array.isArray(out) ? out[0] : out;
    const blob = await img.toBlob('image/png');
    self.postMessage({ type: 'done', blob });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};

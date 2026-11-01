// قارئ فريمات لفيديو الخلفية وقت التصدير: بيفك الفيديو بالترتيب بكارت الشاشة (أسرع بكتير من التنقّل فريم فريم)
class FrameReader {
  constructor(src) { this.src = src; this.samples = []; this.ready = []; this.cur = null; this.idx = 0; this.ended = false; this.waiters = []; }

  async open() {
    const buf = await (await fetch(this.src)).arrayBuffer();
    const file = MP4Box.createFile();
    const info = await new Promise((resolve, reject) => {
      file.onError = (e) => reject(new Error(String(e)));
      file.onReady = (i) => resolve(i);
      buf.fileStart = 0;
      file.appendBuffer(buf);
      file.flush();
      setTimeout(() => reject(new Error('مش فيديو MP4')), 4000);
    });
    const track = info.videoTracks[0];
    if (!track) throw new Error('مفيش فيديو');
    file.onSamples = (_, __, list) => {
      for (const s of list) this.samples.push({ data: s.data, key: s.is_sync, ts: (s.cts * 1e6) / s.timescale, dur: (s.duration * 1e6) / s.timescale });
    };
    file.setExtractionOptions(track.id, null, { nbSamples: Infinity });
    file.start();
    file.flush();
    if (!this.samples.length) throw new Error('الفيديو فاضي');
    let description;
    for (const e of file.getTrackById(track.id).mdia.minf.stbl.stsd.entries) {
      const box = e.avcC || e.hvcC || e.vpcC || e.av1C;
      if (box) { const st = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); box.write(st); description = new Uint8Array(st.buffer, 8); break; }
    }
    this.config = { codec: track.codec, codedWidth: track.video.width, codedHeight: track.video.height, description, hardwareAcceleration: 'prefer-hardware' };
    if (!(await VideoDecoder.isConfigSupported(this.config)).supported) {
      delete this.config.hardwareAcceleration;
      if (!(await VideoDecoder.isConfigSupported(this.config)).supported) throw new Error('نوع الفيديو مش مدعوم: ' + track.codec);
    }
    this.decoder = new VideoDecoder({
      output: (f) => { this.ready.push(f); this.wake(); },
      error: (e) => { this.error = e; this.wake(); },
    });
    this.decoder.addEventListener('dequeue', () => this.wake());
    this.decoder.configure(this.config);
  }

  wake() { const w = this.waiters; this.waiters = []; w.forEach((r) => r()); }
  // بنستنى نتيجة من الديكودر (ومهلة صغيرة احتياطي)
  wait() { return new Promise((r) => { const to = setTimeout(r, 300); this.waiters.push(() => { clearTimeout(to); r(); }); }); }

  jump(us) {
    let i = 0;
    for (let k = 0; k < this.samples.length; k++) if (this.samples[k].key && this.samples[k].ts <= us) i = k;
    for (const f of this.ready) f.close();
    this.ready = [];
    this.cur?.close();
    this.cur = null;
    this.idx = i;
    this.ended = false;
    this.decoder.reset();
    this.decoder.configure(this.config);
  }

  // الفريم اللي المفروض يتعرض في الثانية t
  async frameAt(t) {
    const us = t * 1e6;
    // رجوع لورا (الخلفية بتتكرر) أو قفزة كبيرة لقدّام → من أقرب keyframe
    if (!this.started || (this.cur && us < this.cur.timestamp - 1000) || (this.cur && us > this.cur.timestamp + 3e6)) { this.jump(us); this.started = true; }
    for (;;) {
      if (this.error) throw this.error;
      while (this.ready.length && this.ready[0].timestamp <= us + 1000) { this.cur?.close(); this.cur = this.ready.shift(); }
      if (this.ready.length || this.ended) return this.cur || this.ready[0] || null;
      if (this.idx < this.samples.length) {
        if (this.decoder.decodeQueueSize > 6) { await this.wait(); continue; }
        const s = this.samples[this.idx++];
        this.decoder.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.ts, duration: s.dur, data: s.data }));
        if (this.idx === this.samples.length) { this.decoder.flush().then(() => { this.ended = true; this.wake(); }).catch(() => {}); }
        // بنسيب فرصة للخرج كل كام عينة
        if (this.idx % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      } else await this.wait();
    }
  }

  close() {
    for (const f of this.ready) f.close();
    this.ready = [];
    this.cur?.close();
    this.cur = null;
    try { this.decoder?.close(); } catch {}
  }
}

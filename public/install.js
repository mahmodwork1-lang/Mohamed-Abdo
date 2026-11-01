// زرار "ثبّت التطبيق": أندرويد بيفتح نافذة التثبيت، والآيفون بيشرح الخطوتين
(() => {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let prompt = null;
  const nav = document.querySelector('.nav');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'install-btn';
  btn.textContent = '📲 ثبّت التطبيق';
  btn.hidden = !ios;
  nav?.append(btn);
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; btn.hidden = false; });
  addEventListener('appinstalled', () => { btn.hidden = true; });
  btn.onclick = async () => {
    if (prompt) { prompt.prompt(); await prompt.userChoice; prompt = null; btn.hidden = true; return; }
    const d = document.createElement('dialog');
    d.className = 'install-help';
    d.innerHTML = `<h3>📲 ثبّت التطبيق على الآيفون</h3>
      <ol><li>افتح الموقع من <b>Safari</b></li><li>دوس زرار <b>المشاركة</b> تحت (مربع فيه سهم لفوق)</li><li>اختار <b>إضافة إلى الشاشة الرئيسية</b> ثم <b>إضافة</b></li></ol>
      <button type="button" class="btn gold">تمام</button>`;
    d.querySelector('button').onclick = () => d.remove();
    document.body.append(d);
    d.showModal();
  };
})();

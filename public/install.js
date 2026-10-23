(() => {
  const $ = s => document.querySelector(s);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const DKEY = 'focus-install-dismissed';
  const dismissed = () => { try { return Date.now() - Number(localStorage.getItem(DKEY) || 0) < 14 * 864e5; } catch { return false; } };
  const phone = () => matchMedia('(max-width:760px)').matches;
  let ev = null, hadController = false;

  function bar(html, onAction, key) {
    const b = $('#installbar'); if (!b) return;
    b.innerHTML = html; b.hidden = false;
    const go = b.querySelector('[data-go]'), x = b.querySelector('.x');
    if (go) go.onclick = onAction;
    if (x) x.onclick = () => { b.hidden = true; if (key) { try { localStorage.setItem(DKEY, Date.now()); } catch {} } };
  }
  async function prompt() { if (!ev) return; const e = ev; ev = null; const b = $('#installbar'); if (b) b.hidden = true; e.prompt(); try { await e.userChoice; } catch {} }
  window.focusInstall = { ios, native: () => !!ev, prompt, can: () => !standalone() && (!!ev || ios || /android/i.test(navigator.userAgent)) };

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); ev = e;
    const old = $('#install'); if (old) { old.hidden = false; old.onclick = prompt; }
    if (phone() && !dismissed() && !standalone()) bar('<span>Install Focus on your phone. Opens full screen, works offline.</span><button class="lime" data-go>Install</button><button class="x" aria-label="Dismiss">×</button>', prompt, true);
  });
  window.addEventListener('appinstalled', () => { ev = null; const b = $('#installbar'); if (b) b.hidden = true; const old = $('#install'); if (old) old.hidden = true; });

  if (ios && phone() && !standalone() && !dismissed()) bar('<span>Install: tap <b>Share</b>, then <b>Add to Home Screen</b>.</span><button class="x" aria-label="Dismiss">×</button>', null, true);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'updated' && hadController) bar('<span>Focus updated. Reload to get the latest version.</span><button class="lime" data-go>Reload</button><button class="x" aria-label="Dismiss">×</button>', () => location.reload());
    });
  }
})();

// Full-screen cook mode: one recipe step per screen, timers, doneness box, wake lock.
import { esc, fmtClock, haptic, beep, primeAudio, isNum } from './util.js';
import { ICON } from './ui.js';

let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
}
function onVis() { if (document.visibilityState === 'visible' && document.querySelector('.cook')) keepAwake(); }

export function openCook(recipe) {
  const steps = recipe.steps;
  let i = 0;
  const timers = new Map(); // step -> { total, endAt|null, left, fired }
  const el = document.createElement('div');
  el.className = 'cook';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', `Cook mode: ${recipe.title}`);
  document.body.appendChild(el);
  document.body.classList.add('no-scroll');
  keepAwake();
  document.addEventListener('visibilitychange', onVis);

  const timerOf = (k) => {
    const st = steps[k];
    if (!isNum(st.timer_seconds) || st.timer_seconds <= 0) return null;
    if (!timers.has(k)) timers.set(k, { total: st.timer_seconds, endAt: null, left: st.timer_seconds, fired: false });
    return timers.get(k);
  };
  const leftOf = (t) => (t.endAt ? Math.max(0, (t.endAt - Date.now()) / 1000) : t.left);

  function render() {
    const st = steps[i];
    const t = timerOf(i);
    el.innerHTML = `
      <header class="cook__head">
        <div><p class="cook__recipe">${esc(recipe.title)}</p><p class="cook__count">Step <span class="num">${i + 1}</span> of <span class="num">${steps.length}</span></p></div>
        <button class="icon-btn icon-btn--lg" data-act="close" aria-label="Close cook mode">${ICON.close}</button>
      </header>
      <div class="cook__bar"><span style="width:${((i + 1) / steps.length) * 100}%"></span></div>
      <main class="cook__body">
        <p class="cook__text">${esc(st.text)}</p>
        ${t ? `<button class="cook__timer${t.endAt ? ' is-running' : ''}${t.fired ? ' is-done' : ''}" data-act="timer" aria-live="polite">
            ${ICON.timer}<span class="num" data-time>${fmtClock(leftOf(t))}</span>
            <small>${t.fired ? 'Done — tap to reset' : t.endAt ? 'Tap to pause' : t.left < t.total ? 'Tap to resume' : 'Start timer'}</small>
          </button>` : ''}
        ${st.doneness_test ? `<aside class="cook__test"><strong>Doneness test</strong><p>${esc(st.doneness_test)}</p></aside>` : ''}
      </main>
      <footer class="cook__nav">
        <button class="btn btn--ghost btn--lg" data-act="prev" ${i === 0 ? 'disabled' : ''}>${ICON.left} Previous</button>
        ${i < steps.length - 1 ? `<button class="btn btn--accent btn--lg" data-act="next">Next ${ICON.right}</button>` : `<button class="btn btn--green btn--lg" data-act="close">Finish</button>`}
      </footer>`;
  }

  const tickIv = setInterval(() => {
    for (const [k, t] of timers) {
      if (t.endAt && !t.fired && Date.now() >= t.endAt) {
        t.fired = true; t.endAt = null; t.left = 0;
        haptic([300, 150, 300, 150, 300]); beep();
        if (k !== i) { i = k; } // jump to the step whose timer finished
        render();
      }
    }
    const t = timers.get(i);
    const node = el.querySelector('[data-time]');
    if (t && node) node.textContent = fmtClock(leftOf(t));
  }, 250);

  function close() {
    clearInterval(tickIv);
    document.removeEventListener('visibilitychange', onVis);
    try { wakeLock?.release(); } catch { /* already released */ }
    wakeLock = null;
    document.body.classList.remove('no-scroll');
    el.remove();
  }
  function go(d) { const n = i + d; if (n >= 0 && n < steps.length) { i = n; haptic(8); render(); } }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') close();
    if (act === 'prev') go(-1);
    if (act === 'next') go(1);
    if (act === 'timer') {
      primeAudio();
      const t = timerOf(i);
      if (t.fired) { t.fired = false; t.left = t.total; t.endAt = null; }
      else if (t.endAt) { t.left = leftOf(t); t.endAt = null; }
      else { t.endAt = Date.now() + t.left * 1000; }
      haptic(10); render();
    }
  });
  let sx = null;
  el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
  });
  render();
}

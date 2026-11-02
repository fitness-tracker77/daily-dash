// Reusable UI pieces: thin rings, bottom sheets, toasts, a small gold confetti burst, icons.
import { esc, reducedMotion, fmtNum, isNum } from './util.js';

// ---------------------------------------------------------------- thin ring (a watch sub-dial)
const lastPct = new Map();
export function ringHTML({ id, value, target, dp = 0, unit, label, size = 150 }) {
  const r = size / 2 - 2, c = 2 * Math.PI * r;
  const hasT = isNum(target) && target > 0;
  const pct = hasT && isNum(value) ? Math.min(1, value / target) : 0;
  const from = lastPct.has(id) ? lastPct.get(id) : 0;
  return `
  <figure class="ring${hasT && isNum(value) && value >= target ? ' is-full' : ''}" data-ring="${id}" data-pct="${pct}" style="--size:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
      <circle class="ring__arc" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - from)}" data-c="${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <figcaption>
      <span class="ring__value figure" data-value="${id}">${isNum(value) ? fmtNum(value, dp) : '0'}</span>
      <span class="ring__of">${hasT ? `of ${fmtNum(target)} ${esc(unit)}` : 'no target in cycle.json'}</span>
    </figcaption>
    <span class="ring__label">${esc(label)}</span>
  </figure>`;
}
export function animateRings(root) {
  root.querySelectorAll('[data-ring]').forEach((fig) => {
    const id = fig.dataset.ring; const pct = Number(fig.dataset.pct);
    const arc = fig.querySelector('.ring__arc'); const c = Number(arc.dataset.c);
    lastPct.set(id, pct);
    if (reducedMotion()) { arc.style.strokeDashoffset = String(c * (1 - pct)); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = String(c * (1 - pct)); }));
  });
}

// ---------------------------------------------------------------- sheet (the "one tap deeper" level)
export function openSheet(html, { title = '', onClose, cls = '' } = {}) {
  closeSheet(true);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet__head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${ICON.close}</button></header>
      <div class="sheet__body">${html}</div>
    </section>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  wrap._onClose = onClose;
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKey);
  wrap._offKey = () => document.removeEventListener('keydown', onKey);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return wrap.querySelector('.sheet__body');
}
export function closeSheet(immediate = false) {
  document.querySelectorAll('.sheet-wrap').forEach((w) => {
    if (w._closing && !immediate) return;
    if (!w._closing) { w._closing = true; w._offKey?.(); w._onClose?.(); }
    // a sheet still animating closed is removed at once when another opens
    if (immediate || reducedMotion()) w.remove();
    else { w.classList.remove('open'); setTimeout(() => w.remove(), 200); }
  });
  if (!document.querySelector('.cook')) document.body.classList.remove('no-scroll');
}

// ---------------------------------------------------------------- toast
export function toast(msg, ms = 2400) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, ms);
}

// ---------------------------------------------------------------- confetti: a small gold burst (canvas, hand-rolled)
export function confetti(originEl) {
  window.__confettiCount = (window.__confettiCount || 0) + 1; // lets tests prove it fires once per date
  if (reducedMotion()) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const box = originEl?.getBoundingClientRect?.();
  const ox = box ? box.left + box.width / 2 : W / 2, oy = box ? box.top + box.height / 2 : H * 0.3;
  const golds = ['#C6A15B', '#D9BC82', '#A8853F', '#E8D5A8'];
  const parts = Array.from({ length: 46 }, () => {
    const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 4.5;
    return { x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.5, s: 2 + Math.random() * 3, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: golds[Math.floor(Math.random() * golds.length)] };
  });
  const t0 = performance.now(); const DUR = 1100;
  const frame = (now) => {
    const el = now - t0;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.16; p.vx *= 0.97; p.vy *= 0.97; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - el / DUR);
      ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (el < DUR) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- icons (inline SVG, 1.5px strokes, currentColor)
const sv = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const ICON = {
  today: sv('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 1.8"/>'),
  train: sv('<path d="M7 7v10M17 7v10M4 9.5v5M20 9.5v5M7 12h10"/>'),
  fuel: sv('<path d="M6 9h12l-1 10.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5z"/><path d="M9.5 9V7a2.5 2.5 0 0 1 5 0v2"/>'),
  insights: sv('<path d="M4 19.5h16"/><path d="M5 15l4.5-4.5 3.5 3L19 7"/>'),
  log: sv('<path d="M6.5 3.5h8l3 3v14h-11z"/><path d="M9.5 11h5M9.5 14.5h5M14.5 3.5v3h3"/>'),
  settings: sv('<circle cx="12" cy="12" r="2.6"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6"/>'),
  close: sv('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  check: sv('<path d="M5.5 12.5l4 4 9-9"/>'),
  left: sv('<path d="M14.5 6l-6 6 6 6"/>'),
  right: sv('<path d="M9.5 6l6 6-6 6"/>'),
  warn: sv('<path d="M12 4.5l8 14.5H4z"/><path d="M12 10v4M12 16.8v.2"/>'),
};

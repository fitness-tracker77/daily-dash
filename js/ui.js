// Reusable UI pieces: rings, sheets, toasts, confetti, SVG line charts.
import { esc, reducedMotion, fmtNum, isNum, daysBetween, fmtDate } from './util.js';

// ---------------------------------------------------------------- rings
const lastPct = new Map();
const R = 52, CIRC = 2 * Math.PI * R;

export function ringHTML({ id, value, target, unit, label, tone, dp = 0 }) {
  const hasT = isNum(target) && target > 0;
  const pct = hasT && isNum(value) ? Math.min(1, value / target) : 0;
  const from = lastPct.has(id) ? lastPct.get(id) : 0;
  const closed = hasT && value >= target;
  return `
  <figure class="ring ring--${tone}${closed ? ' is-closed' : ''}" data-ring="${id}" data-pct="${pct}">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="ring__track" cx="60" cy="60" r="${R}"/>
      <circle class="ring__arc" cx="60" cy="60" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - from)}" transform="rotate(-90 60 60)"/>
    </svg>
    <figcaption class="ring__label">
      <span class="ring__value num">${isNum(value) ? fmtNum(value, dp) : '—'}</span>
      <span class="ring__target num">${hasT ? `/ ${fmtNum(target, 0)} ${esc(unit)}` : 'target missing'}</span>
      <span class="ring__name">${esc(label)}</span>
    </figcaption>
  </figure>`;
}
// call after the ring HTML is in the DOM
export function animateRings(root) {
  root.querySelectorAll('[data-ring]').forEach((fig) => {
    const id = fig.dataset.ring; const pct = Number(fig.dataset.pct);
    const arc = fig.querySelector('.ring__arc');
    lastPct.set(id, pct);
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = String(CIRC * (1 - pct)); }));
  });
}
export function pulseRing(root, id) {
  const fig = root.querySelector(`[data-ring="${id}"]`);
  if (!fig) return;
  fig.classList.remove('pulse'); void fig.offsetWidth; fig.classList.add('pulse');
}

// small ring used in the calendar and week strip
export function miniRing(pct, size = 34, complete = false) {
  const r = size / 2 - 3, c = 2 * Math.PI * r;
  return `<svg class="mini-ring${complete ? ' is-complete' : ''}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle class="mini-ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
    ${pct > 0 ? `<circle class="mini-ring__arc" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, pct))}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}
  </svg>`;
}

// ---------------------------------------------------------------- sheet
export function openSheet(html, { title = '', onClose, cls = '' } = {}) {
  closeSheet(true);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet__grip" aria-hidden="true"></div>
      <header class="sheet__head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${ICON.close}</button></header>
      <div class="sheet__body">${html}</div>
    </section>`;
  document.body.appendChild(wrap);
  wrap._onClose = onClose;
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  requestAnimationFrame(() => wrap.classList.add('open'));
  return wrap.querySelector('.sheet__body');
}
export function closeSheet(immediate = false) {
  document.querySelectorAll('.sheet-wrap').forEach((w) => {
    w._onClose?.();
    if (immediate || reducedMotion()) { w.remove(); return; }
    w.classList.remove('open');
    setTimeout(() => w.remove(), 260);
  });
}

// ---------------------------------------------------------------- toast & banner
export function toast(msg, ms = 2200) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}
export function banner(title, sub) {
  const b = document.createElement('div');
  b.className = 'day-banner'; b.setAttribute('role', 'status');
  b.innerHTML = `<span class="day-banner__mark">${ICON.check}</span><div><strong>${esc(title)}</strong><span>${esc(sub)}</span></div>`;
  document.body.appendChild(b);
  requestAnimationFrame(() => b.classList.add('show'));
  setTimeout(() => { b.classList.remove('show'); setTimeout(() => b.remove(), 400); }, 3600);
}

// ---------------------------------------------------------------- confetti (canvas, hand-rolled)
export function confetti() {
  if (reducedMotion()) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--bronze', '--green', '--text'].map((v) => cs.getPropertyValue(v).trim() || '#fff');
  const parts = Array.from({ length: 130 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const sp = 7 + Math.random() * 9;
    return { x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.42, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)] };
  });
  const t0 = performance.now(); const DUR = 1800;
  const frame = (now) => {
    const el = now - t0;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - el / DUR);
      ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
      ctx.restore();
    }
    if (el < DUR) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- line chart (SVG)
// points: [{date, y, cls?}] ; target: {from:{date,y}, to:{date,y}} optional
export function lineChart(points, { target = null, unit = 'kg', height = 150, dp = 1, xRange = null } = {}) {
  const W = 320, H = height, P = { l: 36, r: 12, t: 12, b: 22 };
  const all = [...points.map((p) => ({ date: p.date, y: p.y }))];
  if (target) all.push(target.from, target.to);
  if (!all.length) return '';
  const dates = all.map((p) => p.date).sort();
  const d0 = xRange?.[0] || dates[0], d1 = xRange?.[1] || dates[dates.length - 1];
  const span = Math.max(1, daysBetween(d0, d1));
  let yMin = Math.min(...all.map((p) => p.y)), yMax = Math.max(...all.map((p) => p.y));
  if (yMax - yMin < 1) { yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.12; yMin -= pad; yMax += pad;
  const x = (d) => P.l + (W - P.l - P.r) * (daysBetween(d0, d) / span);
  const y = (v) => P.t + (H - P.t - P.b) * (1 - (v - yMin) / (yMax - yMin));
  const ticks = [yMin + pad, (yMin + yMax) / 2, yMax - pad];
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart">`;
  ticks.forEach((t) => { s += `<line class="chart__grid" x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}"/><text class="chart__ylab num" x="${P.l - 6}" y="${y(t) + 3}" text-anchor="end">${fmtNum(t, dp)}</text>`; });
  s += `<text class="chart__xlab num" x="${P.l}" y="${H - 5}">${fmtDate(d0)}</text><text class="chart__xlab num" x="${W - P.r}" y="${H - 5}" text-anchor="end">${fmtDate(d1)}</text>`;
  if (target) s += `<line class="chart__target" x1="${x(target.from.date)}" y1="${y(target.from.y)}" x2="${x(target.to.date)}" y2="${y(target.to.y)}"/>`;
  if (points.length > 1) s += `<polyline class="chart__line" points="${points.map((p) => `${x(p.date)},${y(p.y)}`).join(' ')}"/>`;
  points.forEach((p) => { s += `<circle class="chart__dot ${p.cls || ''}" cx="${x(p.date)}" cy="${y(p.y)}" r="4"><title>${fmtDate(p.date)}: ${fmtNum(p.y, dp)} ${unit}</title></circle>`; });
  return s + '</svg>';
}

// ---------------------------------------------------------------- icons (inline SVG, stroke = currentColor)
const sv = (p, vb = 24) => `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const ICON = {
  today: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  week: sv('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  training: sv('<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
  pantry: sv('<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  log: sv('<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9 11h6M9 15h6M14.5 3.5V7h4"/>'),
  close: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  left: sv('<path d="M14.5 6l-6 6 6 6"/>'),
  right: sv('<path d="M9.5 6l6 6-6 6"/>'),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>'),
  moon: sv('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>'),
  flame: sv('<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5 3.4-8.4 2.2 1.4 3 3.2 3 4.8 1-.6 1.6-1.8 1.8-3 1.8 1.6 3.8 3.8 3.8 6.6 0 3.2-2.4 5.6-6 5.6z"/>'),
  pot: sv('<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h2M20 10h2M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2"/>'),
  snow: sv('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>'),
  note: sv('<path d="M5 4.5h14v11l-4.5 4.5H5z"/><path d="M14.5 20v-4.5H19"/>'),
  meal: sv('<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M17 21V3c-2 1.5-3 4-3 7v4h3"/>'),
  timer: sv('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 1.5M9.5 2.5h5"/>'),
  copy: sv('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  offline: sv('<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-2.4-1.7M2 8.5a15 15 0 0 1 4.3-2.6M22 8.5A15 15 0 0 0 12 4.5"/><circle cx="12" cy="20" r=".8"/>'),
  settings: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  warn: sv('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.3"/>'),
};

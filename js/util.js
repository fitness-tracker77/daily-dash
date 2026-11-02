// Small shared helpers. No app data lives here.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- dates (always local calendar dates as YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, '0');
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function today() { return isoDate(new Date()); }
export function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // noon avoids DST edges
}
export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return isoDate(parseDate(s)) === s;
}
export function addDays(s, n) {
  const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d);
}
export function daysBetween(a, b) { // b - a in whole days
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
export function dateRange(a, b) {
  const out = []; if (!isValidDate(a) || !isValidDate(b)) return out;
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}
export function dow(s) { return parseDate(s).getDay(); } // 0 Sun
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtDow = (s, short = false) => (short ? DOW[dow(s)].slice(0, 3) : DOW[dow(s)]);
export const fmtMonth = (m, short = false) => (short ? MON[m].slice(0, 3) : MON[m]);
export function fmtDate(s, opts = {}) {
  if (!isValidDate(s)) return String(s ?? '');
  const d = parseDate(s);
  const base = `${d.getDate()} ${fmtMonth(d.getMonth(), true)}`;
  return opts.dow ? `${fmtDow(s, true)} ${base}` : opts.year ? `${base} ${d.getFullYear()}` : base;
}

// ---------- numbers ----------
export function fmtNum(v, dp = 0) {
  if (!isNum(v)) return '—';
  return v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function fmtKg(v) {
  if (!isNum(v)) return '—';
  return fmtNum(v, Number.isInteger(v) ? 0 : (Number.isInteger(v * 10) ? 1 : 2));
}
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
export const round1 = (v) => Math.round(v * 10) / 10;

export function slug(s) {
  return String(s ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------- device ----------
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function haptic(pattern = 12) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ }
}

let audioCtx;
export function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((off) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.25, t + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.18);
      o.start(t + off); o.stop(t + off + 0.2);
    });
  } catch { /* audio unavailable */ }
}
// iOS needs the audio context created inside a user gesture
export function primeAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* audio unavailable */ }
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${pad(s)}`;
}

// Count-up numbers the first time a stat appears on screen
const seenCount = new Set();
export function countUp(root) {
  const nodes = $$('[data-count]', root);
  if (!nodes.length) return;
  const run = (el) => {
    const key = el.dataset.countKey || '';
    const target = Number(el.dataset.count);
    const dp = Number(el.dataset.dp || 0);
    if (!Number.isFinite(target) || seenCount.has(key) || reducedMotion()) { seenCount.add(key); return; }
    seenCount.add(key);
    const t0 = performance.now(), dur = 900;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(target * e, dp);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmtNum(target, dp);
    };
    el.textContent = fmtNum(0, dp);
    requestAnimationFrame(step);
  };
  if (!('IntersectionObserver' in window)) { nodes.forEach(run); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); run(en.target); } });
  }, { threshold: 0.4 });
  nodes.forEach((n) => io.observe(n));
}

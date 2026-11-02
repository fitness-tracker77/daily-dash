// Small shared helpers. No app data lives here.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const num = (s) => { // parse a typed number ("62,5" works too); null if empty/invalid
  if (s == null) return null;
  const t = String(s).trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

// ---------- dates (always local calendar dates as YYYY-MM-DD) ----------
export const pad = (n) => String(n).padStart(2, '0');
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
export function addMonths(s, n) {
  const d = parseDate(s); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return isoDate(d);
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
export const weekStart = (s) => addDays(s, -((dow(s) + 6) % 7)); // Monday
export const monthKey = (s) => String(s).slice(0, 7);             // YYYY-MM
export const monthStart = (mk) => `${mk}-01`;
export function monthEnd(mk) { const [y, m] = mk.split('-').map(Number); return `${mk}-${pad(new Date(y, m, 0).getDate())}`; }
export function addMonthKey(mk, n) { return monthKey(addMonths(`${mk}-01`, n)); }

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtDow = (s, short = false) => (short ? DOW[dow(s)].slice(0, 3) : DOW[dow(s)]);
export const fmtMonth = (m, short = false) => (short ? MON[m].slice(0, 3) : MON[m]);
export function fmtDate(s, opts = {}) {
  if (!isValidDate(s)) return String(s ?? '');
  const d = parseDate(s);
  const base = `${d.getDate()} ${fmtMonth(d.getMonth(), !opts.long)}`;
  if (opts.dow) return `${fmtDow(s, !opts.long)} ${base}${opts.year ? ` ${d.getFullYear()}` : ''}`;
  return opts.year ? `${base} ${d.getFullYear()}` : base;
}
export function fmtMonthKey(mk, short = false) {
  const [y, m] = mk.split('-').map(Number);
  return `${fmtMonth(m - 1, short)} ${y}`;
}
export function daysAgoText(n) {
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}

// ---------- numbers ----------
export function fmtNum(v, dp = 0) {
  if (!isNum(v)) return '—';
  return v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
// kg / grams: up to 2 decimals, but no trailing zeros
export function fmtKg(v) {
  if (!isNum(v)) return '—';
  const r = Math.round(v * 100) / 100;
  return fmtNum(r, Number.isInteger(r) ? 0 : (Number.isInteger(r * 10) ? 1 : 2));
}
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
export const round1 = (v) => Math.round(v * 10) / 10;
export const round3 = (v) => Math.round(v * 1000) / 1000;

export function slug(s) {
  return String(s ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- clock / pace ----------
export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
// "25:30" or "1:02:03" -> seconds; null when it does not parse
export function parseClock(t) {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/.exec(String(t ?? ''));
  if (!m) return null;
  const [h, mm, ss] = [Number(m[1] || 0), Number(m[2]), Number(m[3])];
  if (ss > 59 || (m[1] && mm > 59)) return null;
  const v = h * 3600 + mm * 60 + ss;
  return v > 0 ? v : null;
}
export function fmtPace(secPerKm) {
  if (!isNum(secPerKm) || secPerKm <= 0) return '—';
  return `${fmtClock(secPerKm)} /km`;
}

// ---------- device ----------
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function haptic(pattern = 10) {
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
      g.gain.exponentialRampToValueAtTime(0.2, t + off + 0.02);
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

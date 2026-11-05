// The bodyweight block shared by Log and Insights: grey dots (every weigh-in), one gold line through the weekly
// averages, and a single "Last 4 weeks" line under the chart. Tap a weekly point or a dot to read it.
import * as M from '../model.js';
import { esc, fmtNum, fmtDate, fmtKg } from '../util.js';
import { bodyweightChart } from '../charts.js';
import { NL } from './common.js';

// big number: this week's average with the latest weigh-in under it; with no weigh-in this week, the latest
export function bodyweightTop(sm) {
  if (!sm) return { big: null, sub: '', tag: '' };
  const latest = `latest ${fmtKg(sm.latest.kg)} kg · ${fmtDate(sm.latest.date, { dow: true })}`;
  return sm.avg != null ? { big: fmtNum(sm.avg, 1), sub: latest, tag: "this week's average" } : { big: fmtKg(sm.latest.kg), sub: fmtDate(sm.latest.date, { dow: true }), tag: 'latest' };
}

export function bodyweightBlock({ compact = false } = {}) {
  const v = M.bodyweightView();
  if (!v.readings.length) return `<p class="quiet">${NL} yet.</p>`;
  if (v.readings.length < 2) return `<p class="fine"><strong>${fmtKg(v.readings[0].kg)} kg</strong> on ${fmtDate(v.readings[0].date)} · chart appears after 2 weigh-ins</p>`;
  return `
    <div class="bw" data-bwchart>
      <div class="bw__wrap">
        ${bodyweightChart({ readings: v.readings, weeks: v.weeks, x0: v.x0, x1: v.x1, height: compact ? 160 : 190 })}
        <p class="bw__tip" hidden></p>
      </div>
      <p class="bw__rate">${esc(M.bodyweightRateLine(v.summary))}</p>
    </div>`;
}

export function bindBodyweight(root) {
  const bw = root.querySelector('[data-bwchart]');
  const svg = bw?.querySelector('.bw__svg');
  if (!svg) return;
  const hit = svg.querySelector('.bw__hit'), tip = bw.querySelector('.bw__tip');
  const pts = JSON.parse(hit.dataset.pts);
  hit.addEventListener('click', (e) => {
    const r = svg.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * 340, vy = ((e.clientY - r.top) / r.height) * Number(svg.viewBox.baseVal.height);
    let best = null;
    for (const p of pts) { const d = Math.hypot(p.x - vx, p.y - vy) - (p.t === 'w' ? 3 : 0); if (d <= 14 && (!best || d < best.d)) best = { d, p }; } // weekly points win near ties
    if (!best) { tip.hidden = true; return; }
    tip.textContent = best.p.tip; tip.hidden = false;
  });
}

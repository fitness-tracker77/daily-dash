// The bodyweight chart block shared by Log (range chips, tall) and Insights (compact, always the last 12 weeks):
// chart, one-line caption and the "You vs plan" panel. All numbers come from weigh-ins and cycle.json.
import * as M from '../model.js';
import { esc, fmtNum, fmtDate, fmtKg, addDays } from '../util.js';
import { bodyweightChart, bodyweightTip } from '../charts.js';
import { NL } from './common.js';

export const bwState = { range: '3m' };
const CHIPS = [['4w', '4 weeks'], ['3m', '3 months'], ['all', 'All']];

// the big number block: the 7-day average, with the latest weigh-in under it (just the latest while there is no average)
export function bodyweightTop(sm) {
  if (!sm) return { big: null, sub: '', tag: '' };
  const latest = `latest ${fmtKg(sm.latest.kg)} kg · ${fmtDate(sm.latest.date, { dow: true })}`;
  return sm.avg != null ? { big: fmtNum(sm.avg, 1), sub: latest, tag: '7-day average' } : { big: fmtKg(sm.latest.kg), sub: fmtDate(sm.latest.date, { dow: true }), tag: 'latest' };
}

export function bodyweightBlock({ range, chips = false, compact = false }) {
  const v = M.bodyweightView(range);
  if (!v.readings.length) return `<p class="quiet">${NL} in this range.</p>`;
  const vp = M.bodyweightVsPlan(v.summary);
  const avgMap = Object.fromEntries(v.avgs.map((a) => [a.date, a.y])), kgMap = Object.fromEntries(v.readings.map((r) => [r.date, r.kg]));
  return `
    <div class="bw" data-bwchart data-kg="${esc(JSON.stringify(kgMap))}" data-avg="${esc(JSON.stringify(avgMap))}">
      ${chips ? `<nav class="range range--sm" aria-label="Chart range">${CHIPS.map(([id, t]) => `<button class="range__b${id === range ? ' is-on' : ''}" data-bw-range="${id}" aria-pressed="${id === range}">${t}</button>`).join('')}</nav>` : ''}
      <div class="bw__wrap">
        ${bodyweightChart({ readings: v.readings, avgs: v.avgs, plan: v.plan, x0: v.x0, x1: v.x1, height: compact ? 160 : 190, label: 'Bodyweight: 7-day average, daily weigh-ins and plan' })}
        <p class="bw__tip" hidden></p>
      </div>
      <p class="fine">Gold: 7-day average. Grey: daily weigh-ins.${v.plan ? ' Dashed: plan.' : ''}</p>
      <section class="vsplan" aria-label="You vs plan">
        <h3 class="h3">You vs plan</h3>
        <dl class="facts">
          <div><dt>Rate</dt><dd>${esc(vp.rate)}</dd></div>
          ${vp.today ? `<div><dt>Today</dt><dd>${esc(vp.today)}</dd></div>` : ''}
        </dl>
      </section>
    </div>`;
}

export function bindBodyweight(root, onRange) {
  root.querySelectorAll('[data-bw-range]').forEach((b) => b.addEventListener('click', () => { bwState.range = b.dataset.bwRange; onRange?.(); }));
  const bw = root.querySelector('[data-bwchart]');
  const svg = bw?.querySelector('.bw__svg');
  if (!svg) return;
  const kg = JSON.parse(bw.dataset.kg), avg = JSON.parse(bw.dataset.avg);
  const tip = bw.querySelector('.bw__tip'), cur = svg.querySelector('.bw__cursor');
  const x0 = svg.dataset.x0, span = Number(svg.dataset.span), L = Number(svg.dataset.l), R = Number(svg.dataset.r);
  svg.querySelector('.bw__hit').addEventListener('click', (e) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * 340;
    const day = Math.max(0, Math.min(span, Math.round(((vx - L) / (R - L)) * span)));
    const date = addDays(x0, day);
    const x = L + (R - L) * (day / span);
    cur.setAttribute('x1', x.toFixed(1)); cur.setAttribute('x2', x.toFixed(1)); cur.setAttribute('visibility', 'visible');
    tip.textContent = bodyweightTip(date, kg[date], avg[date]);
    tip.hidden = false;
  });
}

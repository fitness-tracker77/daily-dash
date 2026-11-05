// Charts drawn as SVG by hand, one visual language everywhere:
// gold line with a soft fill, faint guide lines, rounded bars, one highlighted value.
import { esc, fmtNum, isNum, daysBetween, fmtDate, addDays } from './util.js';

const W = 340;
let gid = 0;

// three round tick values covering [lo, hi]
function niceTicks(lo, hi) {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const start = Math.floor(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 0.001 && out.length < 6; v += step) out.push(+v.toFixed(6));
  if (out[out.length - 1] < hi) out.push(+(out[out.length - 1] + step).toFixed(6));
  return out;
}

// y-axis for a chart that must not exaggerate small changes: at least `minSpan` units tall, centred on the
// data (and target path), ticks every `tickStep`. Everything in `vals` is always inside [lo, hi].
// Place a value label beside a selected point without covering any dot: above, below, left, then right.
// Returns the rectangle { x, y } for a label of size w x h; `dots` are { x, y } centres (radius ~6).
export function placeLabel({ cx, cy, w, h = 19, dots = [], minX = 0, maxX = 340, minY = 2, maxY = 168, r = 8 }) {
  const cands = [[cx - w / 2, cy - h - 9], [cx - w / 2, cy + 9], [cx - w - 9, cy - h / 2], [cx + 9, cy - h / 2],
    [cx - w / 2, cy - h - 24], [cx - w - 9, cy - h - 12], [cx - w - 9, cy + 12], [cx - w / 2, cy + 26]];
  const clamp = (c) => [Math.min(maxX - w, Math.max(minX, c[0])), Math.min(maxY - h, Math.max(minY, c[1]))];
  const hits = ([x, y]) => [...dots, { x: cx, y: cy }].filter((d) => d.x > x - r && d.x < x + w + r && d.y > y - r && d.y < y + h + r).length;
  let best = null;
  for (const c of cands) { const p = clamp(c); const n = hits(p); if (n === 0) return { x: p[0], y: p[1] }; if (!best || n < best.n) best = { n, x: p[0], y: p[1] }; }
  return { x: best.x, y: best.y };
}

export function axisFor(vals, { minSpan, tickStep }) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < minSpan) { const c = (lo + hi) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
  else { const pad = (hi - lo) * 0.08; lo -= pad; hi += pad; }
  // every `tickStep`; a very wide axis (e.g. a far-away target path) doubles the spacing so labels stay readable
  let stride = 1;
  while ((hi - lo) / (tickStep * stride) > 9) stride *= 2;
  const ticks = [];
  for (let k = Math.ceil(lo / (tickStep * stride) - 1e-9); k * tickStep * stride <= hi + 1e-9; k++) ticks.push(+(k * tickStep * stride).toFixed(6));
  return { lo, hi, ticks };
}

// decimals needed to print every tick the same way (even steps only: 45 / 47.5 / 50, never 45 / 48 / 50)
export function tickDpFor(ticks) {
  let dp = 0;
  for (const t of ticks) { for (let d = 0; d <= 3; d++) if (Math.abs(t * 10 ** d - Math.round(t * 10 ** d)) < 1e-6) { dp = Math.max(dp, d); break; } }
  return dp;
}
// weekly x-axis dates: one label every 7 days from the start, at most `max` (stride in whole weeks)
export function weeklyLabels(d0, d1, max = 6) {
  const span = daysBetween(d0, d1);
  if (span < 7) return span > 0 ? [d0, d1] : [d0];
  const weeks = Math.floor(span / 7) + 1;
  const stride = Math.ceil(weeks / max);
  const out = [];
  for (let k = 0; k < weeks; k += stride) out.push(addDays(d0, k * 7));
  return out;
}
const segmentsOf = (pts) => { // split where a day has no value: never a line across a gap
  const out = []; let cur = [];
  for (const p of pts) { if (cur.length && daysBetween(cur[cur.length - 1].date, p.date) > 1) { out.push(cur); cur = []; } cur.push(p); }
  if (cur.length) out.push(cur);
  return out;
};

function frame(height, ticks, y, dp) {
  let s = '';
  for (const t of ticks) {
    s += `<line class="chart__grid" x1="34" x2="${W - 4}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`;
    s += `<text class="chart__tick" x="28" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${fmtNum(t, dp)}</text>`;
  }
  return s;
}

// points: [{date, y, mark?: 'pr' | 'above' | 'below' | 'on'}]; target: {from:{date,y}, to:{date,y}}; hLine: horizontal target
export function lineChart({ points, target = null, hLine = null, x0 = null, x1 = null, highlight = 'last', unit = '', dp = 1, height = 170, label = 'Chart', tickDp = null, minSpan = null, tickStep = null, avg = null, joinPoints = true }) {
  const pts = points.filter((p) => isNum(p.y));
  if (!pts.length && !target) return '';
  const id = `g${++gid}`;
  const dates = [...pts.map((p) => p.date), ...(target ? [target.from.date, target.to.date] : [])].sort();
  const d0 = x0 || dates[0], d1 = x1 || dates[dates.length - 1];
  const span = Math.max(1, daysBetween(d0, d1));
  const L = 40, R = W - 10, T = 22, B = height - 22;
  const x = (d) => L + (R - L) * (daysBetween(d0, d) / span);
  const vals = pts.map((p) => p.y);
  if (target) vals.push(target.from.y, target.to.y);
  if (isNum(hLine)) vals.push(hLine);
  const avgPts = (avg || []).filter((p) => isNum(p.y));
  for (const p of avgPts) vals.push(p.y);
  let lo = Math.min(...vals), hi = Math.max(...vals), ticks;
  if (minSpan && tickStep) ({ lo, hi, ticks } = axisFor(vals, { minSpan, tickStep }));
  else {
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    ticks = niceTicks(lo, hi).filter((t) => t >= lo && t <= hi);
  }
  const y = (v) => B - (B - T) * ((v - lo) / (hi - lo));
  const hiIdx = !pts.length ? -1 : highlight === 'max' ? pts.reduce((bi, p, i) => (p.y > pts[bi].y ? i : bi), 0) : pts.length - 1;
  const fmt = (v) => fmtNum(v, dp);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="chart__fill-top"/><stop offset="1" class="chart__fill-bottom"/></linearGradient></defs>`;
  s += frame(height, ticks, y, tickDp ?? tickDpFor(ticks));
  const xl = weeklyLabels(d0, d1);
  xl.forEach((d, i) => { s += `<text class="chart__tick" x="${x(d).toFixed(1)}" y="${height - 5}" text-anchor="${i === 0 ? 'start' : i === xl.length - 1 && xl.length > 1 && span - daysBetween(d0, d) < 4 ? 'end' : 'middle'}">${fmtDate(d)}</text>`; });
  if (target) s += `<line class="chart__target" x1="${x(target.from.date)}" y1="${y(target.from.y)}" x2="${x(target.to.date)}" y2="${y(target.to.y)}"/>`;
  if (isNum(hLine)) s += `<line class="chart__target" x1="${L}" y1="${y(hLine)}" x2="${R}" y2="${y(hLine)}"/>`;
  const segs = avg ? segmentsOf(avgPts) : joinPoints ? [pts] : [];
  for (const seg of segs) {
    if (seg.length === 1) { if (avg) s += `<circle class="chart__hi" cx="${x(seg[0].date).toFixed(1)}" cy="${y(seg[0].y).toFixed(1)}" r="3.4"/>`; continue; }
    const line = seg.map((p) => `${x(p.date).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
    s += `<polygon class="chart__area" fill="url(#${id})" points="${x(seg[0].date).toFixed(1)},${B} ${line} ${x(seg[seg.length - 1].date).toFixed(1)},${B}"/>`;
    s += `<polyline class="chart__line" points="${line}"/>`;
  }
  if (avg) s += '<g class="chart__faint">';
  pts.forEach((p, i) => {
    const cx = x(p.date).toFixed(1), cy = y(p.y).toFixed(1);
    if (p.mark === 'pr') s += `<circle class="chart__pr" cx="${cx}" cy="${cy}" r="6.5"/>`;
    if (p.mark === 'above' || p.mark === 'below' || p.mark === 'on') s += `<circle class="chart__mark is-${p.mark}" cx="${cx}" cy="${cy}" r="3.4"/>`;
    else if (i !== hiIdx && pts.length <= 40) s += `<circle class="chart__dot" cx="${cx}" cy="${cy}" r="2.6"/>`;
  });
  if (avg) s += '</g>';
  if (hiIdx >= 0) {
    const p = pts[hiIdx];
    const cx = x(p.date), cy = y(p.y);
    const label2 = `${fmt(p.y)}${unit && unit.length <= 4 ? ` ${unit}` : ''}`;
    const w = 12 + label2.length * 6.4;
    const dots = [...pts.filter((q, k) => k !== hiIdx).map((q) => ({ x: x(q.date), y: y(q.y) })), ...avgPts.map((q) => ({ x: x(q.date), y: y(q.y) }))];
    const { x: bx, y: by } = placeLabel({ cx, cy, w, dots, minX: L - 4, maxX: W - 2, minY: 2, maxY: height - 24 });
    s += `<circle class="chart__hi" cx="${cx}" cy="${cy}" r="5"><title>${fmtDate(p.date)}: ${fmt(p.y)} ${esc(unit)}</title></circle>`;
    s += `<g class="chart__bubble"><rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="19" rx="9.5"/><text x="${(bx + w / 2).toFixed(1)}" y="${(by + 13).toFixed(1)}" text-anchor="middle">${esc(label2)}</text></g>`;
  }
  return s + '</svg>';
}

// Bodyweight: gold line = 7-day average (a faint dotted bridge across days with no average, "no weigh-ins" over
// gaps wider than 14 days), one grey dot per weigh-in with no line joining them, a thin dashed plan line over the
// cycle's dates with an end label, no shaded area. Y axis: even 0.5 kg steps, at least 2.0 kg tall, every dot inside.
// Tap a point to see that day's weigh-in and average (bindBodyweightChart reads the data attributes).
export function bodyweightChart({ readings, avgs, plan = null, x0, x1, height = 190, label = 'Bodyweight', unit = 'kg' }) {
  const L = 40, R = W - 10, T = 20, B = height - 24;
  const span = Math.max(1, daysBetween(x0, x1));
  const x = (d) => L + (R - L) * (daysBetween(x0, d) / span);
  const vals = [...readings.map((r) => r.kg), ...avgs.map((a) => a.y)];
  if (plan) vals.push(plan.from.y, plan.to.y);
  if (!vals.length) return '';
  const lo0 = Math.min(...vals), hi0 = Math.max(...vals);
  const { lo, hi, ticks } = axisFor([lo0 - 0.1, hi0 + 0.1], { minSpan: 2, tickStep: 0.5 });
  const y = (v) => B - (B - T) * ((v - lo) / (hi - lo));
  let s = `<svg class="chart bw__svg" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}" data-x0="${x0}" data-span="${span}" data-l="${L}" data-r="${R}">`;
  s += frame(height, ticks, y, tickDpFor(ticks));
  weeklyLabels(x0, x1).forEach((d, i, a) => { s += `<text class="chart__tick" x="${x(d).toFixed(1)}" y="${height - 6}" text-anchor="${i === 0 ? 'start' : i === a.length - 1 && span - daysBetween(x0, d) < 4 ? 'end' : 'middle'}">${fmtDate(d)}</text>`; });
  if (plan) {
    s += `<line class="chart__target bw__plan" x1="${x(plan.from.date).toFixed(1)}" y1="${y(plan.from.y).toFixed(1)}" x2="${x(plan.to.date).toFixed(1)}" y2="${y(plan.to.y).toFixed(1)}"/>`;
    if (plan.endsInView) { // above the line's end, or below it when a dot is in the way
      const ex = Math.min(R, x(plan.to.date)), ey = y(plan.to.y), w = plan.label.length * 5.4;
      const clear = (ty) => !readings.some((r) => { const dx = x(r.date), dy = y(r.kg); return dx > ex - w - 4 && dx < ex + 4 && dy > ty - 11 && dy < ty + 4; });
      const ty = [ey - 7, ey + 15, ey - 21, ey + 29].find(clear) ?? ey - 7;
      s += `<text class="chart__tick bw__planlabel" x="${ex.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="end">${esc(plan.label)}</text>`;
    }
  }
  const segs = segmentsOf(avgs);
  segs.forEach((seg, i) => {
    if (i > 0) {
      const a = segs[i - 1][segs[i - 1].length - 1], b = seg[0];
      s += `<line class="bw__bridge" x1="${x(a.date).toFixed(1)}" y1="${y(a.y).toFixed(1)}" x2="${x(b.date).toFixed(1)}" y2="${y(b.y).toFixed(1)}"/>`;
      if (daysBetween(a.date, b.date) > 14) s += `<text class="chart__tick bw__gap" x="${((x(a.date) + x(b.date)) / 2).toFixed(1)}" y="${(((y(a.y) + y(b.y)) / 2) + 16).toFixed(1)}" text-anchor="middle">no weigh-ins</text>`;
    }
    if (seg.length === 1) s += `<circle class="bw__avgdot" cx="${x(seg[0].date).toFixed(1)}" cy="${y(seg[0].y).toFixed(1)}" r="3"/>`;
    else s += `<polyline class="chart__line bw__avg" points="${seg.map((p) => `${x(p.date).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}"/>`;
  });
  for (const r of readings) s += `<circle class="bw__dot" cx="${x(r.date).toFixed(1)}" cy="${y(r.kg).toFixed(1)}" r="2.6"/>`;
  s += `<line class="bw__cursor" x1="0" x2="0" y1="${T}" y2="${B}" visibility="hidden"/>`;
  s += `<rect class="bw__hit" x="${L}" y="0" width="${R - L}" height="${height}" fill="transparent"/>`;
  return s + '</svg>';
}
// the text a tap on `date` shows: that day's weigh-in (or "no weigh-in") and the 7-day average
export function bodyweightTip(date, kg, avg) {
  return `${fmtDate(date, { dow: true })}: ${isNum(kg) ? `${fmtNum(kg, 1)} kg` : 'no weigh-in'} · 7-day average ${isNum(avg) ? `${fmtNum(avg, 1)} kg` : 'not enough weigh-ins'}`;
}

// bars: [{key, label, stack: [{v, gold?, name?}]}]. tones: shade index per stack part. target: dashed horizontal line.
export function barChart({ bars, height = 170, dp = 0, label = 'Chart', highlight = 'last', tones = [], target = null, values = false, yMax = null }) {
  if (!bars.length) return '';
  const totals = bars.map((b) => b.stack.reduce((a, x) => a + (isNum(x.v) ? x.v : 0), 0));
  const max = Math.max(...totals, isNum(target) ? target : 0) || 1;
  const L = 40, R = W - 10, T = 22, B = height - 22;
  const ticks = yMax != null ? niceTicks(0, yMax) : niceTicks(0, max * 1.08);
  const top = ticks[ticks.length - 1];
  const y = (v) => B - (B - T) * (v / top);
  const slot = (R - L) / bars.length;
  const bw = Math.max(4, Math.min(26, slot * 0.62));
  const lastWithData = totals.reduce((li, t, i) => (t > 0 ? i : li), bars.length - 1);
  const hiIdx = typeof highlight === 'number' ? highlight : highlight === 'max' ? totals.indexOf(Math.max(...totals)) : lastWithData;
  const single = bars.every((b) => b.stack.length === 1);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">`;
  s += frame(height, ticks, y, tickDpFor(ticks));
  bars.forEach((b, i) => {
    const cx = L + slot * i + slot / 2;
    let acc = 0;
    const parts = b.stack.filter((part) => isNum(part.v) && part.v > 0);
    parts.forEach((part, k) => {
      const yTop = y(acc + part.v), yBot = y(acc);
      const isTop = k === parts.length - 1;
      const cls = part.gold || (single && i === hiIdx) ? 'chart__bar is-gold' : `chart__bar tone-${single ? 1 : (tones[b.stack.indexOf(part)] ?? k % 5)}`;
      const h = Math.max(1, yBot - yTop - (isTop ? 0 : 1.5));
      s += isTop
        ? `<path class="${cls}" d="M${(cx - bw / 2).toFixed(1)},${yBot.toFixed(1)} V${(yTop + Math.min(4, h / 2)).toFixed(1)} q0,-${Math.min(4, h / 2).toFixed(1)} ${Math.min(4, bw / 2).toFixed(1)},-${Math.min(4, h / 2).toFixed(1)} H${(cx + bw / 2 - Math.min(4, bw / 2)).toFixed(1)} q${Math.min(4, bw / 2).toFixed(1)},0 ${Math.min(4, bw / 2).toFixed(1)},${Math.min(4, h / 2).toFixed(1)} V${yBot.toFixed(1)} Z"><title>${esc(b.label)}: ${esc(part.name ?? '')} ${fmtNum(part.v, dp)}</title></path>`
        : `<rect class="${cls}" x="${(cx - bw / 2).toFixed(1)}" y="${(yTop + 1.5).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(b.label)}: ${esc(part.name ?? '')} ${fmtNum(part.v, dp)}</title></rect>`;
      acc += part.v;
    });
    if ((values || i === hiIdx) && totals[i] > 0) s += `<text class="chart__val${i === hiIdx ? ' is-hi' : ''}" x="${cx.toFixed(1)}" y="${(y(totals[i]) - 6).toFixed(1)}" text-anchor="middle">${fmtNum(totals[i], dp)}</text>`;
    if (bars.length <= 7 || i % Math.ceil(bars.length / 6) === 0) s += `<text class="chart__tick" x="${cx.toFixed(1)}" y="${height - 5}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  if (isNum(target)) s += `<line class="chart__target" x1="${L}" x2="${R}" y1="${y(target)}" y2="${y(target)}"/>`;
  return s + '</svg>';
}

// segments: [{label, v, gold?}] -> ring split with the total in the middle
export function donut({ segments, size = 150, center = '', sub = '', label = 'Split', tones = [] }) {
  const parts = segments.filter((x) => isNum(x.v) && x.v > 0);
  const total = parts.reduce((a, x) => a + x.v, 0);
  if (!total) return '';
  const r = size / 2 - 12, c = 2 * Math.PI * r, cx = size / 2;
  const gap = parts.length > 1 ? 3 : 0;
  let off = 0, s = `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">`;
  s += `<circle class="donut__track" cx="${cx}" cy="${cx}" r="${r}"/>`;
  parts.forEach((p, i) => {
    const len = Math.max(0, (p.v / total) * c - gap);
    s += `<circle class="donut__seg ${p.gold ? 'is-gold' : `tone-${tones[i] ?? i % 5}`}" cx="${cx}" cy="${cx}" r="${r}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cx})"><title>${esc(p.label)} ${Math.round((p.v / total) * 100)}%</title></circle>`;
    off += (p.v / total) * c;
  });
  s += `<text class="donut__c" x="${cx}" y="${cx + 2}" text-anchor="middle">${esc(center)}</text><text class="donut__s" x="${cx}" y="${cx + 20}" text-anchor="middle">${esc(sub)}</text>`;
  return s + '</svg>';
}

// tiny trend line for list rows
export function sparkline(values, { w = 84, h = 28, label = 'Trend' } = {}) {
  const v = values.filter(isNum);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((val, i) => [3 + (w - 6) * (i / (v.length - 1)), h - 4 - (h - 8) * ((val - lo) / span)]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}"><polyline points="${line}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.8"/></svg>`;
}

// segmented progress: done of total
export function progressBar(done, total, { label = 'Progress' } = {}) {
  if (!total) return '';
  const n = Math.min(total, 40);
  const filled = Math.round((done / total) * n);
  return `<div class="progress" role="img" aria-label="${esc(label)}: ${done} of ${total}">${Array.from({ length: n }, (_, i) => `<span class="${i < filled ? 'is-on' : ''}"></span>`).join('')}</div>`;
}

// have vs need bar (pantry)
export function haveNeed(have, need) {
  if (!isNum(need) || need <= 0 || !isNum(have)) return '';
  const pct = Math.max(0, Math.min(1, have / need));
  return `<span class="hn${have < need ? ' is-short' : ''}" aria-hidden="true"><span style="width:${(pct * 100).toFixed(1)}%"></span></span>`;
}

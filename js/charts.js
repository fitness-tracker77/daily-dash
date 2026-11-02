// One chart style for the whole app, drawn as SVG by hand:
// 1.5px lines, no gridlines, a few quiet tick labels, one gold highlighted point.
import { esc, fmtNum, isNum, daysBetween, fmtDate } from './util.js';

const W = 340;
const PAD = { l: 4, r: 4, t: 14, b: 20 };

function yScale(values, height, { includeZero = false, minSpan = 1 } = {}) {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (includeZero) lo = Math.min(0, lo);
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = includeZero ? Math.min(0, mid - minSpan / 2) : mid - minSpan / 2; hi = lo + minSpan; }
  const pad = (hi - lo) * 0.1;
  const y0 = includeZero && lo === 0 ? 0 : lo - pad, y1 = hi + pad;
  return { lo: y0, hi: y1, y: (v) => PAD.t + (height - PAD.t - PAD.b) * (1 - (v - y0) / (y1 - y0)) };
}

// points: [{date, y, mark?: 'pr' | 'above' | 'below' | 'on'}]
// target: {from: {date, y}, to: {date, y}} drawn dashed; hLine: a horizontal target value
// highlight: 'last' | 'max' (the one gold point)
export function lineChart({ points, target = null, hLine = null, x0 = null, x1 = null, highlight = 'last', unit = '', dp = 1, height = 150, label = 'Chart' }) {
  const pts = points.filter((p) => isNum(p.y));
  if (!pts.length && !target) return '';
  const dates = [...pts.map((p) => p.date), ...(target ? [target.from.date, target.to.date] : [])].sort();
  const d0 = x0 || dates[0], d1 = x1 || dates[dates.length - 1];
  const span = Math.max(1, daysBetween(d0, d1));
  const x = (d) => PAD.l + 30 + (W - PAD.l - PAD.r - 30) * (daysBetween(d0, d) / span);
  const vals = pts.map((p) => p.y);
  if (target) vals.push(target.from.y, target.to.y);
  if (isNum(hLine)) vals.push(hLine);
  const ys = yScale(vals, height, { minSpan: Math.max(1, Math.abs(Math.max(...vals)) * 0.02) });
  const y = ys.y;
  const hiIdx = !pts.length ? -1 : highlight === 'max' ? pts.reduce((bi, p, i) => (p.y > pts[bi].y ? i : bi), 0) : pts.length - 1;
  const fmt = (v) => fmtNum(v, dp);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">`;
  // quiet tick labels: min and max of the scale, first and last date
  const dataLo = Math.min(...vals), dataHi = Math.max(...vals);
  s += `<text class="chart__tick" x="${PAD.l}" y="${y(dataHi) + 3}">${fmt(dataHi)}</text>`;
  if (dataHi !== dataLo) s += `<text class="chart__tick" x="${PAD.l}" y="${y(dataLo) + 3}">${fmt(dataLo)}</text>`;
  s += `<text class="chart__tick" x="${x(d0)}" y="${height - 4}">${fmtDate(d0)}</text>`;
  if (d1 !== d0) s += `<text class="chart__tick" x="${x(d1)}" y="${height - 4}" text-anchor="end">${fmtDate(d1)}</text>`;
  if (target) s += `<line class="chart__target" x1="${x(target.from.date)}" y1="${y(target.from.y)}" x2="${x(target.to.date)}" y2="${y(target.to.y)}"/>`;
  if (isNum(hLine)) s += `<line class="chart__target" x1="${x(d0)}" y1="${y(hLine)}" x2="${x(d1)}" y2="${y(hLine)}"/>`;
  if (pts.length > 1) s += `<polyline class="chart__line" points="${pts.map((p) => `${x(p.date).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}"/>`;
  pts.forEach((p, i) => {
    if (p.mark === 'pr') s += `<circle class="chart__pr" cx="${x(p.date)}" cy="${y(p.y)}" r="5"/>`;
    if (p.mark === 'above' || p.mark === 'below' || p.mark === 'on') s += `<circle class="chart__mark is-${p.mark}" cx="${x(p.date)}" cy="${y(p.y)}" r="2.6"/>`;
    else if (pts.length === 1 || i !== hiIdx) s += `<circle class="chart__dot" cx="${x(p.date)}" cy="${y(p.y)}" r="${pts.length > 40 ? 0 : 1.6}"/>`;
  });
  if (hiIdx >= 0) {
    const p = pts[hiIdx];
    s += `<circle class="chart__hi" cx="${x(p.date)}" cy="${y(p.y)}" r="3.6"><title>${fmtDate(p.date)}: ${fmt(p.y)} ${esc(unit)}</title></circle>`;
  }
  return s + '</svg>';
}

// bars: [{key, label, stack: [{v, gold?}]}], one bar per week. Stacks use tones of the text colour; gold marks the priority group.
export function barChart({ bars, height = 150, dp = 0, label = 'Chart', highlight = 'last', tones = [] }) {
  if (!bars.length) return '';
  const totals = bars.map((b) => b.stack.reduce((a, x) => a + (isNum(x.v) ? x.v : 0), 0));
  const max = Math.max(...totals);
  const ys = yScale([0, max || 1], height, { includeZero: true });
  const y = ys.y;
  const left = PAD.l + 30, inner = W - left - PAD.r;
  const slot = inner / bars.length;
  const bw = Math.max(3, Math.min(22, slot * 0.55));
  const hiIdx = highlight === 'max' ? totals.indexOf(max) : bars.length - 1;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">`;
  s += `<text class="chart__tick" x="${PAD.l}" y="${y(max) + 3}">${fmtNum(max, dp)}</text>`;
  s += `<text class="chart__tick" x="${PAD.l}" y="${y(0) + 3}">0</text>`;
  s += `<line class="chart__base" x1="${left}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  bars.forEach((b, i) => {
    const cx = left + slot * i + slot / 2;
    let acc = 0;
    b.stack.forEach((part, k) => {
      if (!isNum(part.v) || part.v <= 0) return;
      const yTop = y(acc + part.v), yBot = y(acc);
      const cls = part.gold ? 'chart__bar is-gold' : `chart__bar tone-${tones[k] ?? k % 5}`;
      s += `<rect class="${cls}" x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.8, yBot - yTop - 0.8).toFixed(1)}"><title>${esc(b.label)}: ${esc(part.name ?? '')} ${fmtNum(part.v, dp)}</title></rect>`;
      acc += part.v;
    });
    if (i === hiIdx && totals[i] > 0) s += `<circle class="chart__hi" cx="${cx}" cy="${y(totals[i]) - 6}" r="2.4"/>`;
  });
  s += `<text class="chart__tick" x="${left}" y="${height - 4}">${esc(bars[0].label)}</text>`;
  if (bars.length > 1) s += `<text class="chart__tick" x="${W - PAD.r}" y="${height - 4}" text-anchor="end">${esc(bars[bars.length - 1].label)}</text>`;
  return s + '</svg>';
}

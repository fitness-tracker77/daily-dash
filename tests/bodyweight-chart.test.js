import test from 'node:test';
import assert from 'node:assert/strict';
import { axisFor, lineChart } from '../js/charts.js';

const BW = [66.1, 66.5, 66.7, 66.5];
const pts = BW.map((y, i) => ({ date: `2026-11-0${i + 1}`, y, mark: y > 66.4 ? 'above' : 'below' }));

test('axis spans at least 2 kg, centred on the data, with ticks every 0.5', () => {
  const a = axisFor(BW, { minSpan: 2, tickStep: 0.5 });
  assert.ok(a.hi - a.lo >= 2 - 1e-9);
  assert.ok(Math.abs((a.lo + a.hi) / 2 - 66.4) < 1e-9);
  assert.deepEqual(a.ticks, [65.5, 66, 66.5, 67]);
});

test('the target path is always fully visible and centred with the data', () => {
  const a = axisFor([...BW, 66.5, 65.0], { minSpan: 2, tickStep: 0.5 });
  assert.ok(a.lo <= 65.0 && a.hi >= 66.7);
  assert.ok(a.hi - a.lo >= 2 - 1e-9);
  const wide = axisFor([60, 70], { minSpan: 2, tickStep: 0.5 }); // span above minimum still contains everything
  assert.ok(wide.lo < 60 && wide.hi > 70);
});

test('chart keeps above/below dot styling, labels ticks, keeps target inside the plot', () => {
  const svg = lineChart({ points: pts, target: { from: { date: '2026-11-01', y: 66.5 }, to: { date: '2026-11-10', y: 65.0 } }, unit: 'kg', minSpan: 2, tickStep: 0.5, tickDp: 1, height: 170 });
  assert.match(svg, /chart__mark is-above/);
  assert.match(svg, /chart__mark is-below/);
  const labels = [...svg.matchAll(/class="chart__tick" x="28"[^>]*>([\d.]+)</g)].map((m) => m[1]);
  assert.deepEqual(labels, ['65.0', '65.5', '66.0', '66.5']);
  const t = svg.match(/class="chart__target" x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/);
  for (const v of [t[1], t[2]]) assert.ok(Number(v) >= 22 && Number(v) <= 148, `target y ${v} inside plot`);
});

test('a 0.2 kg move fills well under a quarter of the axis', () => {
  const a = axisFor([66.5, 66.7], { minSpan: 2, tickStep: 0.5 });
  assert.ok(0.2 / (a.hi - a.lo) <= 0.1 + 1e-9);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { model as M, reset, useCycle } from './helpers.js';
import { placeLabel, lineChart } from '../js/charts.js';

const e = (day, kg) => ({ date: `2026-10-${String(day).padStart(2, '0')}`, kg });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('7-day average: needs 3 readings in the window, windows are calendar days, gaps are not filled', () => {
  const list = [e(1, 66), e(2, 67), e(3, 68), e(4, 70), e(11, 65), e(12, 66), e(13, 67)];
  const a = M.bodyweightAverages(list);
  // 1st and 2nd: fewer than 3 readings. 3rd: 66,67,68. 4th: 66,67,68,70. 11th: window 5-11 holds only itself.
  assert.deepEqual(a.map((x) => x.date), ['2026-10-03', '2026-10-04', '2026-10-13']);
  near(a[0].y, 67); near(a[1].y, 67.75); assert.equal(a[1].n, 4);
  near(a[2].y, 66); assert.equal(a[2].n, 3); // 11th, 12th, 13th only: the readings from the 1st-4th are outside the window
  assert.deepEqual(M.bodyweightAverages([e(1, 66), e(2, 67)]), []);
  assert.deepEqual(M.bodyweightAverages([]), []);
});

test('window is the last 7 calendar days inclusive', () => {
  const a = M.bodyweightAverages([e(1, 60), e(5, 66), e(6, 67), e(7, 68)]);
  assert.equal(a.length, 2); // 7th: window 1-7 holds all 4; 6th: window 0-6 holds 1st, 5th, 6th
  assert.equal(a[0].n, 3); assert.equal(a[1].n, 4);
  const b = M.bodyweightAverages([e(1, 60), e(5, 66), e(6, 67), e(8, 68)]);
  assert.deepEqual(b.map((x) => x.n), [3, 3]); // 8th: window 2-8 drops the 1st
  near(b[1].y, (66 + 67 + 68) / 3);
});

test('label never covers a dot', () => {
  const dots = [{ x: 100, y: 80 }, { x: 150, y: 70 }, { x: 200, y: 82 }];
  const sel = { cx: 250, cy: 80 };
  for (const [dx, dy] of [[0, 0], [0, -20], [0, 25], [-50, 0]]) {
    const p = placeLabel({ cx: sel.cx + dx, cy: sel.cy + dy, w: 52, dots });
    for (const d of [...dots, { x: sel.cx + dx, y: sel.cy + dy }]) {
      const inside = d.x > p.x - 6 && d.x < p.x + 52 + 6 && d.y > p.y - 6 && d.y < p.y + 19 + 6;
      assert.equal(inside, false, `dot at ${d.x},${d.y} vs label at ${p.x},${p.y}`);
    }
  }
});

test('chart: average is the line, readings are faint dots with no joining line, axis keeps 2 kg span', () => {
  const pts = [66.1, 66.5, 66.7, 66.5].map((y, i) => ({ date: `2026-10-0${i + 1}`, y, mark: y > 66.4 ? 'above' : 'below' }));
  const avg = M.bodyweightAverages(pts.map((p) => ({ date: p.date, kg: p.y })));
  const svg = lineChart({ points: pts, avg, joinPoints: false, unit: 'kg', minSpan: 2, tickStep: 0.5, tickDp: 1 });
  assert.equal((svg.match(/<polyline/g) || []).length, 1, 'only the average line');
  assert.match(svg, /class="chart__faint"/);
  assert.match(svg, /chart__mark is-above/); assert.match(svg, /chart__mark is-below/);
  const noAvg = lineChart({ points: pts, avg: [], joinPoints: false, unit: 'kg', minSpan: 2, tickStep: 0.5, tickDp: 1 });
  assert.equal((noAvg.match(/<polyline/g) || []).length, 0, 'no line when there is no average');
  const labels = [...svg.matchAll(/class="chart__tick" x="28"[^>]*>([\d.]+)</g)].map((m) => m[1]);
  assert.ok(labels.length >= 4);
  const step = labels.map(Number); assert.ok(step[step.length - 1] - step[0] >= 1.5 - 1e-9);
  void reset; void useCycle;
});

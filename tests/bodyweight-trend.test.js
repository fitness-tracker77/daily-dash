import test from 'node:test';
import assert from 'node:assert/strict';
import { model as M, reset, useCycle } from './helpers.js';
import { placeLabel, lineChart, weeklyLabels, tickDpFor } from '../js/charts.js';

const e = (day, kg) => ({ date: `2026-10-${String(day).padStart(2, '0')}`, kg });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('7-day average: every calendar day with >= 3 readings in the 7 days up to it; gaps break it', () => {
  const list = [e(1, 66), e(2, 67), e(3, 68), e(4, 70), e(11, 65), e(12, 66), e(13, 67)];
  const a = M.bodyweightAverages(list);
  const days = a.map((x) => Number(x.date.slice(8)));
  // 3rd..7th have 3+ readings in the window (the 8th: window 2-8 holds 2nd, 3rd, 4th: still 3; the 9th: 3rd,4th only)
  assert.deepEqual(days, [3, 4, 5, 6, 7, 8, 13]);
  near(a[0].y, 67); near(a[1].y, 67.75); assert.equal(a[1].n, 4);
  near(a[6].y, 66); assert.equal(a[6].n, 3);
  assert.deepEqual(M.bodyweightAverages([e(1, 66), e(2, 67)]), []);
  assert.deepEqual(M.bodyweightAverages([]), []);
});

test('window is the last 7 calendar days inclusive', () => {
  const a = M.bodyweightAverages([e(1, 60), e(5, 66), e(6, 67), e(8, 68)]);
  const on = (d) => a.find((x) => x.date === `2026-10-0${d}`);
  assert.equal(on(6).n, 3); near(on(6).y, (60 + 66 + 67) / 3);
  assert.equal(on(7).n, 3); near(on(7).y, (60 + 66 + 67) / 3);
  assert.equal(on(8).n, 3); near(on(8).y, (66 + 67 + 68) / 3); // the 1st has dropped out of 2-8
  assert.equal(on(5), undefined); assert.equal(on(2), undefined);
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
  assert.equal((svg.match(/<polyline/g) || []).length, 1, 'only the average line (one unbroken stretch)');
  assert.match(svg, /class="chart__faint"/);
  assert.match(svg, /chart__mark is-above/); assert.match(svg, /chart__mark is-below/);
  const noAvg = lineChart({ points: pts, avg: [], joinPoints: false, unit: 'kg', minSpan: 2, tickStep: 0.5, tickDp: 1 });
  assert.equal((noAvg.match(/<polyline/g) || []).length, 0, 'no line when there is no average');
  const labels = [...svg.matchAll(/class="chart__tick" x="28"[^>]*>([\d.]+)</g)].map((m) => m[1]);
  assert.ok(labels.length >= 4);
  const step = labels.map(Number); assert.ok(step[step.length - 1] - step[0] >= 1.5 - 1e-9);
  void reset; void useCycle;
});

test('no line is drawn across a gap in the average', () => {
  const avg = [{ date: '2026-10-01', y: 66 }, { date: '2026-10-02', y: 66.1 }, { date: '2026-10-10', y: 66.4 }, { date: '2026-10-11', y: 66.5 }];
  const svg = lineChart({ points: avg.map((p) => ({ date: p.date, y: p.y })), avg, joinPoints: false, unit: 'kg', minSpan: 2, tickStep: 0.5 });
  assert.equal((svg.match(/<polyline/g) || []).length, 2);
});

test('x-axis: weekly labels, at most 6; y-axis ticks use even steps with one decimal rule', () => {
  assert.deepEqual(weeklyLabels('2026-11-01', '2026-11-30'), ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
  assert.ok(weeklyLabels('2026-01-01', '2026-12-31').length <= 6);
  assert.deepEqual(weeklyLabels('2026-11-02', '2026-11-08'), ['2026-11-02', '2026-11-08']);
  assert.equal(tickDpFor([45, 47.5, 50]), 1);
  assert.equal(tickDpFor([40, 50, 60]), 0);
  const svg = lineChart({ points: [{ date: '2026-11-01', y: 45 }, { date: '2026-11-20', y: 50 }] });
  const labels = [...svg.matchAll(/class="chart__tick" x="28"[^>]*>([\d.]+)</g)].map((m) => Number(m[1]));
  const steps = new Set(labels.slice(1).map((v, i) => +(v - labels[i]).toFixed(6)));
  assert.equal(steps.size, 1, `even steps: ${labels}`);
});

test('label avoids a crowded corner (dots left and above-left, no room right)', () => {
  const sel = { cx: 322, cy: 80 };
  const dots = [{ x: 316, y: 68 }, { x: 300, y: 82 }, { x: 290, y: 79 }, { x: 305, y: 90 }];
  const p = placeLabel({ cx: sel.cx, cy: sel.cy, w: 58, dots, minX: 36, maxX: 338, minY: 2, maxY: 146 });
  for (const d of [...dots, { x: sel.cx, y: sel.cy }]) assert.equal(d.x > p.x - 6 && d.x < p.x + 64 && d.y > p.y - 6 && d.y < p.y + 25, false, `${d.x},${d.y} vs ${p.x},${p.y}`);
});

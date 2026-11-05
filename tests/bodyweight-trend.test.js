import test from 'node:test';
import assert from 'node:assert/strict';
import { model as M, reset, useCycle } from './helpers.js';
import { placeLabel, lineChart, weeklyLabels, tickDpFor } from '../js/charts.js';

const e = (day, kg) => ({ date: `2026-10-${String(day).padStart(2, '0')}`, kg });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

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

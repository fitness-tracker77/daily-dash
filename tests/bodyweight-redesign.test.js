import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle, loadBackup, readJson, PRIVATE_BACKUP, PRIVATE_CYCLE, hasPrivate } from './helpers.js';
import { bodyweightChart, bodyweightTip, axisFor } from '../js/charts.js';
import { bodyweightTop } from '../js/views/bwchart.js';
import { today, addDays } from '../js/util.js';

const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 1e-9, `${m} ${a} vs ${b}`);
const cycle = (extra = {}) => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: '2026-09-01', end_date: '2026-12-01', bodyweight_start_kg: 66, bodyweight_target_kg: 70 }, days: [], sessions: {}, ...extra });
const day = (n, kg) => ({ date: addDays('2026-09-01', n), kg });

test('7-day average as of a date needs 3 readings; summary, rate and plan rate', () => {
  reset(); useCycle(cycle());
  const list = []; for (let n = 0; n <= 35; n++) list.push(day(n, 66 + n * 0.05)); // +0.05 kg/day, last reading 2026-10-06
  const asOf = '2026-10-06';
  const sm = M.bodyweightSummary(list, asOf);
  near(sm.avg, 66 + 32 * 0.05); near(sm.rate, 0.35);
  near(sm.pathRate, 4 / (91 / 7));
  const vp = M.bodyweightVsPlan(sm);
  assert.equal(vp.rate, '+0.35 kg/week over the last 4 weeks · plan 0.31 kg/week');
  assert.match(vp.today, /^7-day average 67\.6 kg · plan 67\.\d\d kg · [\d.]+ kg (above|below)$/);
  assert.equal(M.bodyweightVsPlan(M.bodyweightSummary(list.slice(15), asOf)).rate, 'not enough weigh-ins yet');
  assert.equal(M.bodyweightVsPlan(null).rate, 'not enough weigh-ins yet');
  assert.equal(M.bodyweightAvgAt([day(0, 66), day(1, 67)], '2026-09-02'), null);
});

test('"today" row only while today is inside the cycle dates', () => {
  reset(); useCycle(cycle());
  const list = [day(0, 66), day(1, 66), day(2, 66.4)];
  assert.ok(M.bodyweightVsPlan(M.bodyweightSummary(list, '2026-09-03')).today);
  assert.equal(M.bodyweightVsPlan(M.bodyweightSummary(list, '2027-01-03')).today, null);
});

test('big number: the average; with no average yet, the latest weigh-in labelled latest', () => {
  reset(); useCycle(cycle());
  const t = bodyweightTop(M.bodyweightSummary([day(0, 66), day(1, 66.2), day(2, 66.4)], '2026-09-03'));
  assert.deepEqual([t.big, t.tag, t.sub], ['66.2', '7-day average', 'latest 66.4 kg · Thu 3 Sep']);
  const t2 = bodyweightTop(M.bodyweightSummary([day(0, 66), day(1, 66.2)], '2026-09-02'));
  assert.deepEqual([t2.big, t2.tag], ['66.2', 'latest']);
});

const readings = [66.1, 66.5, 66.7, 66.5, 66.4].map((kg, i) => ({ date: `2026-10-0${i + 1}`, kg }));
const plan = { from: { date: '2026-10-01', y: 66.3 }, to: { date: '2026-10-16', y: 66.78 }, endsInView: true, label: 'plan 66.78 kg, 16 Oct' };

test('chart: gold average line, grey dots with no joining line, dashed plan with end label, no area, no above/below coding', () => {
  const avgs = M.bodyweightAverages(readings);
  const svg = bodyweightChart({ readings, avgs, plan, x0: '2026-09-20', x1: '2026-10-16' });
  assert.equal((svg.match(/<polyline/g) || []).length, 1, 'only the average is a line');
  assert.equal((svg.match(/class="bw__dot"/g) || []).length, 5);
  assert.doesNotMatch(svg, /chart__area|chart__mark|is-above|is-below/);
  assert.match(svg, /bw__plan/); assert.match(svg, />plan 66\.78 kg, 16 Oct</);
  assert.match(svg, /class="bw__hit"/);
});

test('gaps: faint dotted bridge between average points; "no weigh-ins" only over gaps wider than 14 days', () => {
  const mk = (ds) => ds.map((d, i) => ({ date: d, y: 66 + i * 0.1 }));
  const small = bodyweightChart({ readings: readings, avgs: mk(['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09']), x0: '2026-10-01', x1: '2026-10-16' });
  assert.equal((small.match(/class="bw__bridge"/g) || []).length, 1);
  assert.doesNotMatch(small, /no weigh-ins/);
  assert.equal((small.match(/<polyline/g) || []).length, 2);
  const wide = bodyweightChart({ readings: readings, avgs: mk(['2026-10-01', '2026-10-02', '2026-10-20', '2026-10-21']), x0: '2026-10-01', x1: '2026-10-30' });
  assert.match(wide, />no weigh-ins</);
  assert.equal((wide.match(/class="bw__bridge"/g) || []).length, 1, 'the line never disappears');
});

test('axis: even 0.5 kg steps, at least 2 kg tall, every dot and plan point inside, weekly labels <= 6', () => {
  const svg = bodyweightChart({ readings, avgs: M.bodyweightAverages(readings), plan, x0: '2026-07-01', x1: '2026-10-16' });
  const labels = [...svg.matchAll(/class="chart__tick" x="28"[^>]*>([\d.]+)</g)].map((m) => Number(m[1]));
  assert.ok(labels[labels.length - 1] - labels[0] >= 1.5);
  const steps = new Set(labels.slice(1).map((v, i) => +(v - labels[i]).toFixed(6)));
  assert.equal(steps.size, 1);
  const xl = [...svg.matchAll(/class="chart__tick" x="(?!28")[\d.]+" y="\d+" text-anchor="(?:start|middle|end)">(\d+ \w+)</g)].map((m) => m[1]).filter((t) => !/plan/.test(t));
  assert.ok(xl.length <= 6, `${xl.length} x labels`);
  const a = axisFor([66.0, 66.8], { minSpan: 2, tickStep: 0.5 });
  assert.ok(a.hi - a.lo >= 2 - 1e-9);
  const ys = [...svg.matchAll(/class="bw__dot" cx="[\d.]+" cy="([\d.]+)"/g)].map((m) => Number(m[1]));
  for (const y of ys) assert.ok(y >= 20 && y <= 166, `dot y ${y} inside the plot`);
});

test('tooltip text: the day, its weigh-in or "no weigh-in", and the 7-day average', () => {
  assert.equal(bodyweightTip('2026-10-03', 66.7, 66.4), 'Sat 3 Oct: 66.7 kg · 7-day average 66.4 kg');
  assert.equal(bodyweightTip('2026-10-03', undefined, undefined), 'Sat 3 Oct: no weigh-in · 7-day average not enough weigh-ins');
});

test('view ranges: 4 weeks / 3 months / 12 weeks / all end today (or the plan end)', () => {
  reset(); useCycle(cycle({ meta: { cycle_name: 'T', start_date: addDays(today(), -10), end_date: addDays(today(), 10), bodyweight_start_kg: 66, bodyweight_target_kg: 67 } }));
  store.put('bodyweight', { key: addDays(today(), -100), date: addDays(today(), -100), kg: 70, ts: 1 });
  store.put('bodyweight', { key: addDays(today(), -5), date: addDays(today(), -5), kg: 66, ts: 1 });
  const v4 = M.bodyweightView('4w'), v3 = M.bodyweightView('3m'), vA = M.bodyweightView('all'), v12 = M.bodyweightView('12w');
  assert.equal(v4.readings.length, 1); assert.equal(v3.readings.length, 1); assert.equal(vA.readings.length, 2); assert.equal(v12.readings.length, 1);
  assert.equal(v4.x1, addDays(today(), 10)); assert.ok(v4.plan.endsInView);
  assert.match(v4.plan.label, /^plan 67\.00 kg, \d+ \w+$/);
});

test('private: big number 66.4 and rate +0.25 kg/week (backup + history.json)', { skip: !hasPrivate }, async () => {
  const { checkHistory, importHistory } = await import('../js/history.js');
  const { readFileSync } = await import('node:fs');
  useCycle(readJson(PRIVATE_CYCLE)); loadBackup(readJson(PRIVATE_BACKUP));
  M.reconcilePositions(); M.migratePositionKeys(); M.cleanExampleData();
  importHistory(checkHistory(readFileSync(new URL('../private/history.json', import.meta.url), 'utf8')).history);
  const sm = M.bodyweightSummary(M.bodyweights(), '2026-11-05');
  assert.equal(bodyweightTop(sm).big, '66.4');
  assert.equal(M.bodyweightVsPlan(sm).rate.slice(0, 5), '+0.25');
});

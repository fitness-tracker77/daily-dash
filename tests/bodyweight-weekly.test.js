import test from 'node:test';
import assert from 'node:assert/strict';
import { model as M, reset, useCycle, loadBackup, readJson, PRIVATE_BACKUP, PRIVATE_CYCLE, hasPrivate } from './helpers.js';
import { bodyweightChart, lineChart, barChart, weekTip, dotTip } from '../js/charts.js';
import { bodyweightTop } from '../js/views/bwchart.js';
import { addDays, weekStart } from '../js/util.js';

const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 1e-9, `${m} ${a} vs ${b}`);
const cyc = (extra = {}) => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: '2026-09-01', end_date: '2026-12-01', bodyweight_start_kg: 66, bodyweight_target_kg: 70, ...extra }, days: [], sessions: {} });
const r = (date, kg) => ({ date, kg });

test('weekly averages: Monday-Sunday mean, placed mid-week, empty weeks skipped', () => {
  const w = M.bodyweightWeeks([r('2026-10-26', 66.1), r('2026-10-28', 66.2), r('2026-11-01', 66.1), r('2026-11-16', 67)]);
  assert.deepEqual(w.map((x) => [x.week, x.mid, x.kgs.length]), [['2026-10-26', '2026-10-29', 3], ['2026-11-16', '2026-11-19', 1]]);
  near(w[0].avg, (66.1 + 66.2 + 66.1) / 3);
});

test('summary: this week average, latest, and the 4-week rate with the plan slope', () => {
  reset(); useCycle(cyc());
  const now = '2026-11-05'; const W = weekStart(now); // Monday 2 Nov
  const list = [r(addDays(W, -28), 66.0), r(addDays(W, -27), 66.2), r(addDays(W, 1), 66.8), r(addDays(W, 3), 67.0)];
  const sm = M.bodyweightSummary(list, now);
  near(sm.avg, 66.9); near(sm.rate, (66.9 - 66.1) / 4);
  assert.equal(M.bodyweightRateLine(sm), 'Last 4 weeks: +0.20 kg/week · plan +0.31 kg/week');
  const top = bodyweightTop(sm);
  assert.deepEqual([top.big, top.tag, top.sub], ['66.9', "this week's average", 'latest 67 kg · Thu 5 Nov']);
});

test('either week missing: not enough weigh-ins yet; no weigh-in this week: big number is the latest', () => {
  reset(); useCycle(cyc());
  const now = '2026-11-05'; const W = weekStart(now);
  assert.equal(M.bodyweightRateLine(M.bodyweightSummary([r(addDays(W, 1), 66.8)], now)), 'Last 4 weeks: not enough weigh-ins yet');
  assert.equal(M.bodyweightRateLine(M.bodyweightSummary([r(addDays(W, -28), 66), r(addDays(W, -3), 66.5)], now)), 'Last 4 weeks: not enough weigh-ins yet');
  const sm = M.bodyweightSummary([r(addDays(W, -3), 66.5)], now);
  assert.deepEqual([sm.avg, bodyweightTop(sm).big, bodyweightTop(sm).tag], [null, '66.5', 'latest']);
  assert.equal(M.bodyweightRateLine(null), 'Last 4 weeks: not enough weigh-ins yet');
});

const readings = [r('2026-10-26', 66.1), r('2026-10-28', 66.2), r('2026-11-01', 66.1), r('2026-11-09', 66.6), r('2026-11-17', 66.9)];
const view = () => ({ readings, weeks: M.bodyweightWeeks(readings), x0: '2026-10-26', x1: '2026-11-20' });

test('chart: grey dots, ONE gold line through the weekly points, nothing else', () => {
  const svg = bodyweightChart(view());
  assert.equal((svg.match(/class="bw__dot"/g) || []).length, 5);
  assert.equal((svg.match(/<polyline/g) || []).length, 1);
  assert.equal((svg.match(/class="bw__avgdot"/g) || []).length, 3, 'one point per week with weigh-ins; the empty week is skipped');
  assert.doesNotMatch(svg, /bw__plan|bw__bridge|no weigh-ins|chart__area|chart__mark|chart__target|plan/);
});

test('x-axis starts at the first weigh-in; at most 6 labels; y: even 0.5 steps, >= 2 kg, every dot inside', () => {
  const svg = bodyweightChart(view());
  const xl = [...svg.matchAll(/class="chart__tick" x="(?!28")[\d.]+" y="\d+" text-anchor="\w+">(\d+ \w+)</g)].map((m) => m[1]);
  assert.equal(xl[0], '26 Oct'); assert.ok(xl.length <= 6);
  const yl = [...svg.matchAll(/class="chart__tick" x="28"[^>]*>([\d.]+)</g)].map((m) => Number(m[1]));
  assert.ok(yl[yl.length - 1] - yl[0] >= 1.5);
  assert.equal(new Set(yl.slice(1).map((v, i) => +(v - yl[i]).toFixed(6))).size, 1);
  for (const m of svg.matchAll(/class="bw__dot" cx="[\d.]+" cy="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 20 && Number(m[1]) <= 166);
});

test('tap text: weekly point and dot', () => {
  const w = M.bodyweightWeeks(readings)[0];
  assert.equal(weekTip(w), 'Week of 26 Oct · 66.1, 66.2, 66.1 → average 66.13 kg');
  assert.equal(dotTip('2026-11-05', 66.5), 'Thu 5 Nov: 66.5 kg');
  const pts = JSON.parse(bodyweightChart(view()).match(/data-pts="([^"]*)"/)[1].replace(/&quot;/g, '"'));
  assert.equal(pts.filter((p) => p.t === 'w').length, 3); assert.equal(pts.filter((p) => p.t === 'd').length, 5);
  assert.ok(pts.find((p) => p.t === 'w').tip.startsWith('Week of 26 Oct'));
});

test('monthly review weight change uses the first and last weekly averages of the month', () => {
  reset(); useCycle(cyc());
  for (const x of [r('2026-11-02', 66.0), r('2026-11-04', 66.4), r('2026-11-23', 67.2), r('2026-11-26', 67.0), r('2026-11-29', 67.4)]) M_put(x);
  const c = M.monthReview('2026-11').bwChange;
  near(c.from.y, 66.2); near(c.to.y, 67.2); near(c.diff, 1.0);
  assert.equal(c.from.date, '2026-11-05');
});
import { store } from './helpers.js';
function M_put(x) { store.put('bodyweight', { key: x.date, date: x.date, kg: x.kg, ts: 1 }); }

test('every time chart starts at its first point and ends today; one point shows the number and the message', () => {
  const pts = [{ date: '2026-10-10', y: 5 }, { date: '2026-10-20', y: 6 }];
  const svg = lineChart({ points: pts, x0: '2026-08-01', x1: '2099-12-31', unit: 'kg' });
  const first = svg.match(/class="chart__tick" x="[\d.]+" y="\d+" text-anchor="start">([^<]+)</)[1];
  assert.equal(first, '10 Oct', 'no empty August');
  assert.doesNotMatch(svg, /Dec|2099/);
  const solo = lineChart({ points: [{ date: '2026-10-10', y: 6.8 }], x0: '2026-08-01', x1: '2026-10-31', unit: '' });
  assert.match(solo, /^<p class="fine"><strong>6\.8<\/strong> on 10 Oct · chart appears after 2 sessions<\/p>$/);
  const bars = barChart({ trim: true, bars: [{ key: '2026-08-03', label: 'a', stack: [{ v: 0 }] }, { key: '2026-10-05', label: 'b', stack: [{ v: 4 }] }, { key: '2099-01-01', label: 'c', stack: [{ v: 0 }] }] });
  assert.equal((bars.match(/<path class="chart__bar|<rect class="chart__bar/g) || []).length, 1);
  assert.doesNotMatch(bars, />a<|>c</);
});

test('private: this week average and the 4-week rate from backup + history', { skip: !hasPrivate }, async () => {
  const { checkHistory, importHistory } = await import('../js/history.js');
  const { readFileSync } = await import('node:fs');
  useCycle(readJson(PRIVATE_CYCLE)); loadBackup(readJson(PRIVATE_BACKUP));
  M.reconcilePositions(); M.migratePositionKeys(); M.cleanExampleData();
  importHistory(checkHistory(readFileSync(new URL('../private/history.json', import.meta.url), 'utf8')).history);
  const sm = M.bodyweightSummary(M.bodyweights(), '2026-11-05');
  assert.ok(sm.avg != null && sm.rate != null);
  assert.match(M.bodyweightRateLine(sm), /^Last 4 weeks: [+−]\d\.\d\d kg\/week · plan \+0\.35 kg\/week$/);
});

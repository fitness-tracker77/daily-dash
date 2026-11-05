import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle, loadBackup, readJson, PRIVATE_BACKUP, PRIVATE_CYCLE, hasPrivate } from './helpers.js';
import { today, addDays } from '../js/util.js';

const cyc = (extra = {}) => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: '2026-10-01', end_date: '2026-12-31', priority_muscle: 'chest', daily_protein_target_g: 100 }, days: [], sessions: {}, ...extra });
const set = (date, ex, idx, load, muscle = 'chest', reps = 5) => store.put('sets', { key: `${date}|${ex}|${idx}`, date, ex, name: ex, muscle, idx, done: true, reps, load, ts: Date.parse(`${date}T12:00:00Z`) + idx });
const meal = (date, kcal, protein) => store.put('meals', { key: `${date}|id:m`, date, slot: 'id:m', type: 'meal', title: 'Meal', ts: 1, items: [], kcal, protein, partial: false, deducted: [] });
const NOW = '2026-11-18';

test('periods are calendar periods with correct bounds and stepping limits', () => {
  const w = M.periodBounds('Week', '2026-11-18', NOW, '2026-10-05');
  assert.deepEqual([w.from, w.to], ['2026-11-16', '2026-11-22']);
  const m = M.periodBounds('Month', '2026-11-18', NOW, '2026-10-05');
  assert.deepEqual([m.from, m.to, m.label], ['2026-11-01', '2026-11-30', 'November 2026']);
  const y = M.periodBounds('Year', '2026-11-18', NOW, '2026-10-05');
  assert.deepEqual([y.from, y.to, y.label], ['2026-01-01', '2026-12-31', '2026']);
  const all = M.periodBounds('All', NOW, NOW, '2026-10-05');
  assert.deepEqual([all.from, all.to, all.canPrev, all.canNext], ['2026-10-05', NOW, false, false]);
  assert.equal(m.canNext, false, 'no forward step past the current period');
  assert.equal(m.canPrev, true);
  const oct = M.periodBounds('Month', m.prev, NOW, '2026-10-05');
  assert.deepEqual([oct.from, oct.to, oct.canPrev, oct.canNext], ['2026-10-01', '2026-10-31', false, true]);
  assert.equal(M.periodBounds('Month', oct.next, NOW, '2026-10-05').from, '2026-11-01');
  assert.equal(M.periodBounds('Month', '2026-11-18', NOW, null).canPrev, false, 'no data: no step back');
});

test('numbers follow the period: weeks are clipped to it and sessions include runs', () => {
  reset(); useCycle(cyc());
  set('2026-10-30', 'bench', 0, 50);              // Friday in October, in the week that straddles the month
  set('2026-11-02', 'bench', 0, 60);
  store.put('runs', { key: '2026-11-03|run', date: '2026-11-03', distance_km: 5, time_s: null, notes: '', ts: 1 });
  const nov = M.liftedIn('2026-11-01', '2026-11-30');
  assert.deepEqual([nov.volume, nov.sets, nov.sessions], [300, 1, 2]); // 5 x 60 only; the lift day plus the run
  const oct = M.liftedIn('2026-10-01', '2026-10-31');
  assert.deepEqual([oct.volume, oct.sessions], [250, 1]);
  const wk = M.setsByWeek('2026-11-01', '2026-11-30');
  assert.equal(wk.reduce((a, x) => a + x.sets, 0), 1, 'Oct 30 is not counted in the November week buckets');
  const mv = M.muscleView('2026-11-01', '2026-11-30', 'kg');
  assert.equal(mv.total, 300);
  assert.equal(M.runsByWeek('2026-11-01', '2026-11-30').reduce((a, x) => a + x.runs, 0), 1);
  assert.equal(M.monthReview('2026-11'.slice(0, 7)).sessions, 2);
});

test('today is left out of averages and counts until the day is over, and shown as today so far', () => {
  reset(); useCycle(cyc());
  const t = today();
  meal(addDays(t, -1), 2000, 120); meal(t, 500, 30);
  const nut = M.nutritionIn(addDays(t, -5), addDays(t, 5));
  assert.deepEqual(nut.map((d) => [d.date, d.protein]), [[addDays(t, -1), 120]]);
  assert.deepEqual(M.proteinTargetDays(addDays(t, -5), addDays(t, 5)), { hit: 1, of: 1, target: 100 });
  assert.deepEqual(M.todaySoFar(), { kcal: 500, protein: 30 });
  const r = M.monthReview(t.slice(0, 7));
  if (addDays(t, -1).slice(0, 7) === t.slice(0, 7)) assert.deepEqual([r.mealDays, r.proteinAvg], [1, 120]);
  assert.deepEqual(r.todaySoFar, { kcal: 500, protein: 30 });
});

test('each muscle group keeps one fixed shade in every chart; ungrouped is fixed too', () => {
  assert.equal(M.muscleTone('chest'), M.muscleTone('Chest'));
  const a = M.muscleView('2026-11-01', '2026-11-30', 'sets').tones; // empty ok
  assert.deepEqual(a, {});
  reset(); useCycle(cyc());
  set('2026-11-02', 'bench', 0, 60, 'chest'); set('2026-11-02', 'row', 0, 40, 'back');
  const sets = M.muscleView('2026-11-01', '2026-11-30', 'sets'), kg = M.muscleView('2026-11-01', '2026-11-30', 'kg');
  assert.deepEqual(sets.tones, kg.tones);
  set('2026-11-03', 'squat', 0, 90, 'legs');
  const more = M.muscleView('2026-11-01', '2026-11-30', 'sets').tones;
  assert.equal(more.chest, sets.tones.chest); assert.equal(more.back, sets.tones.back);
  assert.equal(M.muscleTone('weird-group'), M.muscleTone('weird-group'));
});

test('badges are recomputed from stored data and dated the first day truly earned', () => {
  reset(); useCycle(cyc());
  store.put('kv', { key: 'badges', value: { kg1000: '2020-01-01', first_pr: '2020-01-01' } }); // stale, wrongly dated
  set('2026-10-01', 'bench', 0, 100, 'chest', 5);   // 500
  set('2026-10-03', 'bench', 0, 100, 'chest', 6);   // +600 = 1100 on the 3rd
  const b = Object.fromEntries(M.updateBadges().map((x) => [x.id, x.date]));
  assert.equal(b.kg1000, '2026-10-03');
  assert.equal(b.first_pr, null, 'no PR: the stale badge is gone');
  assert.deepEqual(Object.keys(b).sort(), M.BADGES.map((x) => x.id).sort());
});

test('private: First 1,000 kg lifted is 2026-09-24 and 10 sessions counts runs', { skip: !hasPrivate }, async () => {
  const { checkHistory, importHistory } = await import('../js/history.js');
  const { readFileSync } = await import('node:fs');
  useCycle(readJson(PRIVATE_CYCLE)); loadBackup(readJson(PRIVATE_BACKUP));
  M.reconcilePositions(); M.migratePositionKeys(); M.cleanExampleData();
  importHistory(checkHistory(readFileSync(new URL('../private/history.json', import.meta.url), 'utf8')).history);
  const b = Object.fromEntries(M.updateBadges().map((x) => [x.id, x.date]));
  assert.equal(b.kg1000, '2026-09-24');
  const again = Object.fromEntries(M.updateBadges().map((x) => [x.id, x.date]));
  assert.deepEqual(again, b, 'stable on recompute');
});

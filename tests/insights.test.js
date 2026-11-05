import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle } from './helpers.js';

const meal = (id, time) => ({ id, time, type: 'meal', title: id, items: [{ name: id, item_id: 'x_' + id, grams: 100, kcal: 100, protein_g: 5 }] });
const raw = () => ({
  schema_version: 2,
  meta: { cycle_name: 'T', start_date: '2026-11-01', end_date: '2026-11-10', priority_muscle: 'hamstrings' },
  days: ['2026-11-03', '2026-11-05', '2026-11-06'].map((date) => ({ date, slots: [meal('b', '08:00'), meal('l', '13:00'), meal('d', '20:00')] })),
  sessions: {
    '2026-11-04': { kind: 'lift', exercises: [
      { id: 'curl', name: 'Leg curl', sets: 4, reps: 8, muscle_group: 'hamstrings' },
      { id: 'bench', name: 'Bench', sets: 6, reps: 5, muscle_group: 'chest' },
    ] },
  },
});
const slot = (date, id) => M.cycle().slots(date).find((s) => s.id === id);

test('Plan followed: past days count all, today only ticked or time passed, future never', () => {
  reset(); useCycle(raw());
  M.setTick('2026-11-03', slot('2026-11-03', 'b'), true);   // past: 1 of 3
  M.setTick('2026-11-05', slot('2026-11-05', 'l'), true);   // today 13:00 ticked
  const at = { date: '2026-11-05', minutes: 14 * 60 };     // 08:00 passed (unticked), 13:00 ticked, 20:00 not yet
  assert.deepEqual(M.progressAt('2026-11-03', at), { planned: 3, done: 1, complete: false });
  assert.deepEqual(M.progressAt('2026-11-05', at), { planned: 2, done: 1, complete: false });
  assert.deepEqual(M.progressAt('2026-11-06', at), { planned: 0, done: 0, complete: false });
  const w = M.adherenceByWeek('2026-11-02', '2026-11-08', at)[0];
  assert.deepEqual([w.planned, w.done], [15, 2]); // 3 + the 10 sets planned on 11-04 + 2
  M.setTick('2026-11-05', slot('2026-11-05', 'd'), true);  // ticked early: counts although its time has not passed
  assert.deepEqual(M.progressAt('2026-11-05', at), { planned: 3, done: 2, complete: false });
});

test('cycle position: Day X of Y', () => {
  reset(); useCycle(raw());
  assert.deepEqual(M.cyclePosition('2026-11-05'), { day: 5, of: 10 });
  assert.equal(M.cyclePosition('2026-12-01'), null);
});

test('priority headline shows sets and share first, kg second', () => {
  reset(); const c = useCycle(raw());
  const ex = c.session('2026-11-04').exercises;
  for (let i = 0; i < 4; i++) M.toggleSet('2026-11-04', ex[0], i, { reps: 8, load: 50 });
  for (let i = 0; i < 6; i++) M.toggleSet('2026-11-04', ex[1], i, { reps: 5, load: 20 });
  const w = M.thisWeekMuscle('2026-11-05');
  assert.deepEqual([w.priority, w.prSets, w.totalSets, w.prShare], ['hamstrings', 4, 10, 0.4]);
  assert.equal(w.prKg, 1600);
  const h = M.weekHeadline(w);
  assert.match(h, /^4 sets <small>hamstrings this week, 40% of all sets · 1,?600 kg/);
  assert.equal(M.weeklyMuscle('2026-11-02', '2026-11-08').weeks[0].muscleSets.chest, 6);
});

test('sets with no load still count as sets', () => {
  reset(); const c = useCycle(raw());
  M.toggleSet('2026-11-04', c.session('2026-11-04').exercises[0], 0, {});
  assert.equal(M.thisWeekMuscle('2026-11-05').prSets, 1);
});

test('muscle view: Sets and kg each use one measure for bars, donut, legend and headline', () => {
  reset(); const c = useCycle(raw());
  const ex = c.session('2026-11-04').exercises;
  for (let i = 0; i < 4; i++) M.toggleSet('2026-11-04', ex[0], i, { reps: 8, load: 50 });   // hamstrings 4 sets, 1600 kg
  for (let i = 0; i < 6; i++) M.toggleSet('2026-11-04', ex[1], i, { reps: 5, load: 20 });   // chest 6 sets, 600 kg
  store.put('sets', { key: '2026-11-04|@1|6', date: '2026-11-04', pos: 1, ex: 'bench', name: 'Bench', muscle: 'chest', idx: 6, done: true, reps: 12, load: null, ts: 99 }); // bodyweight set: a set, no kg
  const sets = M.muscleView('2026-11-02', '2026-11-08', 'sets');
  assert.deepEqual([sets.unit, sets.total, sets.totals.get('hamstrings'), sets.totals.get('chest'), sets.groups[0]], ['sets', 11, 4, 7, 'chest']);
  assert.deepEqual(sets.weeks[0].values, { hamstrings: 4, chest: 7 });
  assert.match(sets.headline, /^4 sets <small>hamstrings this week, 36% of all sets/);
  const kg = M.muscleView('2026-11-02', '2026-11-08', 'kg');
  assert.deepEqual([kg.unit, kg.total, kg.totals.get('chest'), kg.groups[0]], ['kg', 2200, 600, 'hamstrings']);
  assert.match(kg.headline, /^1,?600 kg <small>hamstrings this week, 73% of all kg · 4 sets/);
  assert.equal(M.muscleView('2026-11-02', '2026-11-08').measure, 'sets', 'default');
});

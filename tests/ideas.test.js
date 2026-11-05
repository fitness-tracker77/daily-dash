import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle } from './helpers.js';
import { today, addDays, weekStart } from '../js/util.js';

const W = weekStart(today());
const d = (n) => addDays(W, n);
const lift = (id = 'curl') => ({ kind: 'lift', exercises: [{ id, name: id, sets: 2, reps: 8, muscle_group: 'x' }] });
const meal = (id, protein) => ({ id, time: '08:00', type: 'meal', title: id, items: [{ name: id, item_id: id, grams: 100, kcal: 100, protein_g: protein }] });
const raw = () => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: addDays(W, -14), end_date: addDays(W, 14), daily_protein_target_g: 100 },
  days: [{ date: d(-2), slots: [meal('a', 120)] }, { date: d(-1), slots: [meal('b', 80)] }],
  sessions: { [d(0)]: lift(), [d(2)]: lift(), [d(4)]: lift(), [d(6)]: lift() } });

test('recent PRs: newest first, with the previous best; empty with no data', () => {
  reset(); const c = useCycle(raw());
  assert.deepEqual(M.recentPrs(), []);
  const e = c.session(d(0)).exercises[0], e2 = c.session(d(2)).exercises[0], e3 = c.session(d(4)).exercises[0];
  M.toggleSet(d(0), e, 0, { reps: 5, load: 30 });
  assert.deepEqual(M.recentPrs(), [], 'a first set is not a PR');
  M.toggleSet(d(2), e2, 0, { reps: 5, load: 32.5 });
  M.toggleSet(d(4), e3, 0, { reps: 5, load: 35 });
  assert.deepEqual(M.recentPrs().map((h) => [h.date, h.load, h.prev]), [[d(4), 35, 32.5], [d(2), 32.5, 30]]);
  assert.equal(M.recentPrs(1).length, 1);
});

test('protein target days count only logged days that reached the target', () => {
  reset(); const c = useCycle(raw());
  M.setTick(d(-2), c.mealSlots(d(-2))[0], true);
  M.setTick(d(-1), c.mealSlots(d(-1))[0], true);
  assert.deepEqual(M.proteinTargetDays(d(-7), d(0)), { hit: 1, of: 2, target: 100 });
  const r = raw(); delete r.meta.daily_protein_target_g; useCycle(r);
  assert.equal(M.proteinTargetDays(d(-7), d(0)), null);
  reset(); useCycle(raw()); assert.equal(M.proteinTargetDays(d(-7), d(0)), null, 'no logged days');
});

test('week sessions: done, partial, missed, today, upcoming', () => {
  reset(); const c = useCycle(raw());
  const states = () => M.weekSessions().map((x) => x.state);
  const base = states();
  assert.equal(base.length, 4);
  const t = today();
  for (const x of M.weekSessions()) assert.ok(['missed', 'today', 'upcoming'].includes(x.state));
  const past = M.weekSessions().find((x) => x.date < t);
  if (past) { // tick one set of 2 on a past day: partial, then both: done
    const ex = c.session(past.date).exercises[0];
    M.toggleSet(past.date, ex, 0, { reps: 5, load: 20 });
    assert.equal(M.weekSessions().find((x) => x.date === past.date).state, 'partial');
    M.toggleSet(past.date, ex, 1, { reps: 5, load: 20 });
    assert.equal(M.weekSessions().find((x) => x.date === past.date).state, 'done');
  }
  assert.ok(store);
});

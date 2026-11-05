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

test('PR celebration fires once per set and carries the previous best', () => {
  reset(); const c = useCycle(raw());
  const e = c.session(d(0)).exercises[0], e2 = c.session(d(2)).exercises[0];
  M.toggleSet(d(0), e, 0, { reps: 5, load: 50 });
  assert.equal(M.celebratePr(d(0), M.setRec(d(0), e, 0)), null, 'a first set is not a PR');
  M.toggleSet(d(2), e2, 0, { reps: 5, load: 52.5 });
  const rec = M.setRec(d(2), e2, 0);
  assert.deepEqual(M.celebratePr(d(2), rec), { name: 'curl', load: 52.5, was: 50 });
  assert.equal(M.celebratePr(d(2), rec), null, 'never again (untick/retick or reload)');
  M.toggleSet(d(2), e2, 0); M.toggleSet(d(2), e2, 0, { reps: 5, load: 52.5 });
  assert.equal(M.celebratePr(d(2), M.setRec(d(2), e2, 0)), null);
});

test('streak milestones: due exactly at 3, 7, 14, 30 and shown once; each has a badge', () => {
  const T = today();
  const meal = (id) => ({ id, time: '08:00', type: 'meal', title: id, items: [{ name: id, item_id: id, grams: 100, kcal: 100, protein_g: 5 }] });
  const mk = (n) => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: addDays(T, -40), end_date: addDays(T, 5) }, days: Array.from({ length: n }, (_, k) => ({ date: addDays(T, -(n - k)), slots: [meal('a')] })), sessions: {} });
  for (const n of [2, 3, 5, 7]) {
    reset(); const c = useCycle(mk(n));
    for (const day of c.dates) M.setTick(day, c.mealSlots(day)[0], true);
    const pm = M.pendingMilestone();
    if ([3, 7].includes(n)) {
      assert.deepEqual([pm.n, pm.seen], [n, false]);
      assert.equal(M.markMilestoneSeen(pm), true);
      assert.equal(M.pendingMilestone().seen, true, 'seen after the first showing, so a reload shows no card');
      assert.equal(M.markMilestoneSeen(pm), false);
      assert.ok(M.updateBadges().find((b) => b.id === `streak${n}`).date, `badge streak${n}`);
    } else assert.equal(pm, null);
  }
  assert.deepEqual(M.STREAK_MILESTONES, [3, 7, 14, 30]);
  assert.ok(['streak3', 'streak7', 'streak14', 'streak30'].every((id) => M.BADGES.some((b) => b.id === id)));
});

test('weekly recap: only logged data, protein-target days and 7-day-average weight change', () => {
  reset(); const c = useCycle(raw());
  const sun = d(6);
  let r = M.weekRecap(sun);
  assert.deepEqual([r.sessions, r.sets, r.volume, r.prs, r.proteinTargetDays, r.weightAvgChange], [null, null, null, null, null, null]);
  const e = c.session(d(0)).exercises[0];
  M.toggleSet(d(0), e, 0, { reps: 5, load: 50 }); M.toggleSet(d(0), e, 1, { reps: 5, load: 50 });
  store.put('runs', { key: `${d(1)}|run`, date: d(1), distance_km: 5, time_s: null, notes: '', ts: 1 });
  for (let k = 0; k <= 6; k++) store.put('bodyweight', { key: d(k - 7), date: d(k - 7), kg: 66 + k * 0.1, ts: 1 }), store.put('bodyweight', { key: d(k), date: d(k), kg: 67 + k * 0.1, ts: 1 });
  r = M.weekRecap(sun);
  assert.deepEqual([r.sessions, r.sets, r.volume], [2, 2, 500]);
  assert.ok(r.weightAvgChange && Math.abs(r.weightAvgChange.diff - 1) < 1e-9, 'avg this week vs 7 days earlier');
});

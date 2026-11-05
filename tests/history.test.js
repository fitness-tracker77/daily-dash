import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle, loadBackup, readJson, PRIVATE_BACKUP, PRIVATE_CYCLE, hasPrivate } from './helpers.js';
import { checkHistory, importHistory } from '../js/history.js';

const PRIVATE_HISTORY = new URL('../private/history.json', import.meta.url);
const file = () => ({
  weigh_ins: [{ date: '2026-09-01', kg: 70.5 }, { date: '2026-09-02', kg: 70.1, note: 'am' }],
  runs: [{ date: '2026-09-03', distance_km: 5, note: 'easy' }],
  lift_sets: [
    { date: '2026-09-01', exercise: 'Leg Curl', muscle_group: 'Hamstrings', set: 1, reps: 8, load_kg: 30 },
    { date: '2026-09-01', exercise: 'Leg Curl', muscle_group: 'Hamstrings', set: 2, reps: 8, load_kg: 32.5 },
    { date: '2026-09-01', exercise: 'Pull-up', muscle_group: 'back', set: 1, reps: 6, load_kg: null },
  ],
});
const run = (f) => { const r = checkHistory(JSON.stringify(f)); assert.ok(r.ok); return { r, res: importHistory(r.history) }; };
const cyc = () => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: '2026-11-01', end_date: '2026-11-30' }, days: [], sessions: {} });

test('adds weigh-ins, runs and sets; exercise id is the lowercase name; load null = bodyweight', () => {
  reset(); useCycle(cyc());
  const { res } = run(file());
  assert.deepEqual(res.added, { weigh_ins: 2, runs: 1, sets: 3 });
  const s = store.get('sets', '2026-09-01|leg-curl|1');
  assert.deepEqual([s.ex, s.name, s.muscle, s.idx, s.load, s.done, 'pos' in s], ['leg-curl', 'Leg Curl', 'hamstrings', 1, 32.5, true, false]);
  assert.equal(store.get('sets', '2026-09-01|pull-up|0').load, null);
  assert.equal(M.loggedSets().length, 3);
  assert.equal(M.rollup('d:2026-09-01').volume, 8 * 30 + 8 * 32.5); // bodyweight set counts as a set, not as kg
  assert.equal(M.rollup('d:2026-09-01').sets, 3);
  assert.equal(store.get('runs', '2026-09-03|run').distance_km, 5);
});

test('history feeds prefill and PRs', () => {
  reset(); useCycle(cyc());
  run(file());
  const pf = M.prefill('2026-11-02', { id: 'leg-curl', name: 'Leg Curl', pos: 0 }, 0);
  assert.deepEqual([pf.load, pf.from], [32.5, 'history']);
  // PR: a later heavier set beats the imported best
  store.put('sets', { key: '2026-10-01|leg-curl|0', date: '2026-10-01', ex: 'leg-curl', name: 'Leg Curl', idx: 0, done: true, reps: 5, load: 40, ts: 1 });
  assert.equal(M.prs().hits.length, 1);
});

test('never overwrites; re-importing the same file adds nothing', () => {
  reset(); useCycle(cyc());
  store.put('bodyweight', { key: '2026-09-01', date: '2026-09-01', kg: 99, ts: 1 });
  store.put('sets', { key: '2026-09-01|@0|0', date: '2026-09-01', pos: 0, occ: 1, ex: 'leg-curl', name: 'Leg curl', idx: 0, done: true, reps: 10, load: 50, ts: 5 });
  const before = JSON.stringify(store.get('bodyweight', '2026-09-01'));
  const { res } = run(file());
  assert.deepEqual(res.added, { weigh_ins: 1, runs: 1, sets: 2 });
  assert.deepEqual([res.skipped.weigh_ins, res.skipped.sets], [1, 1]);
  assert.equal(JSON.stringify(store.get('bodyweight', '2026-09-01')), before);
  assert.equal(store.get('sets', '2026-09-01|@0|0').load, 50);
  const again = run(file()).res;
  assert.deepEqual(again.added, { weigh_ins: 0, runs: 0, sets: 0 });
});

test('validation names the exact field and leaves bad entries out', () => {
  const f = file(); f.weigh_ins[1].kg = 'x'; f.lift_sets[0].set = 0; f.runs[0].date = '09/03'; f.lift_sets[2].load_kg = undefined;
  const r = checkHistory(JSON.stringify(f));
  assert.deepEqual(r.warnings.map((x) => x.path), ['weigh_ins[1].kg', 'runs[0].date', 'lift_sets[0].set', 'lift_sets[2].load_kg']);
  reset(); useCycle(cyc());
  const res = importHistory(r.history);
  assert.equal(res.skipped.invalid, 4);
  assert.deepEqual(res.added, { weigh_ins: 1, runs: 0, sets: 1 });
  assert.equal(checkHistory('{nope').ok, false);
  assert.equal(checkHistory('{}').ok, false);
});

test('private: 12 weigh-ins, 1 run, 134 sets are added; no existing record changes', { skip: !hasPrivate }, () => {
  useCycle(readJson(PRIVATE_CYCLE)); loadBackup(readJson(PRIVATE_BACKUP));
  M.reconcilePositions(); M.migratePositionKeys(); M.cleanExampleData();
  const snap = () => Object.fromEntries(store.COLLS.filter((c) => c !== 'rollups').map((c) => [c, new Map([...store.all(c)].map(([k, v]) => [k, JSON.stringify(v)]))]));
  const before = snap();
  const r = checkHistory(JSON.stringify(readJson(PRIVATE_HISTORY)));
  assert.equal(r.warnings.length, 0);
  const res = importHistory(r.history);
  assert.deepEqual(res.added, { weigh_ins: 12, runs: 1, sets: 134 });
  const after = snap();
  for (const c of Object.keys(before)) for (const [k, v] of before[c]) assert.equal(after[c].get(k), v, `${c} record unchanged`);
  const added = { bodyweight: 12, runs: 1, sets: 134 };
  for (const [c, n] of Object.entries(added)) assert.equal(after[c].size - before[c].size, n, c);
  assert.equal(M.loggedSets().filter((s) => s.date === '2026-11-04').length, 14, '11-04 untouched');
  const again = importHistory(r.history);
  assert.deepEqual(again.added, { weigh_ins: 0, runs: 0, sets: 0 });
  // history-only sets are never on a card: none has a position, and none lands on a date with a session card
  const fresh = store.values('sets').filter((s) => !('pos' in s) && !before.sets.has(s.key));
  assert.equal(fresh.length, 134);
  const onCard = fresh.filter((s) => M.cycle().session(s.date)?.exercises.some((c) => c.id === s.ex || c.name?.toLowerCase() === s.name.toLowerCase()));
  assert.equal(onCard.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle, loadBackup, readJson, PRIVATE_BACKUP, PRIVATE_CYCLE, hasPrivate } from './helpers.js';
import { checkBackup, applyBackup } from '../js/backup.js';

const D = '2026-11-04';
const cycleRaw = (extra = {}) => ({
  schema_version: 2,
  meta: { cycle_name: 'T', start_date: '2026-11-01', end_date: '2026-11-30', priority_muscle: 'hamstrings' },
  days: [{ date: D, slots: [] }],
  sessions: {
    [D]: {
      kind: 'lift',
      exercises: [
        { id: 'leg-curl', name: 'Leg curl', sets: 2, reps: 8, muscle_group: 'hamstrings' },
        { id: 'bench', name: 'Bench', sets: 3, reps: 5, muscle_group: 'chest' },
        { id: 'leg-curl', name: 'Leg curl', sets: 1, reps: 8, muscle_group: 'hamstrings' },
      ],
    },
  },
  ...extra,
});
const cards = () => M.cycle().session(D).exercises;

test('ticking card 1 leaves card 2 unticked, and the reverse', () => {
  reset(); useCycle(cycleRaw());
  const [a, , b] = cards();
  M.toggleSet(D, a, 0, { reps: 8, load: 30 });
  assert.equal(M.setRec(D, a, 0).done, true);
  assert.equal(M.setRec(D, b, 0)?.done ?? false, false);
  M.toggleSet(D, a, 0); // untick
  M.toggleSet(D, b, 0, { reps: 8, load: 32 });
  assert.equal(M.setRec(D, b, 0).done, true);
  assert.equal(M.setRec(D, a, 0)?.done ?? false, false);
  assert.notEqual(M.setKeyOf(D, a, 0), M.setKeyOf(D, b, 0));
});

test('effort and notes are per card; history merges by exercise id', () => {
  reset(); useCycle(cycleRaw());
  const [a, , b] = cards();
  M.setExLog(D, a, { effort: 7, note: 'first' });
  M.setExLog(D, b, { effort: 9, note: 'alone' });
  assert.equal(M.exLog(D, a).effort, 7);
  assert.equal(M.exLog(D, b).effort, 9);
  assert.equal(M.exLogFor(D, 'leg-curl').note, 'first · alone');
  assert.equal(store.get('exlog', `${D}|@2`).ex, 'leg-curl');
});

test('volume, set counts and weight lifted count each set once across duplicate cards', () => {
  reset(); useCycle(cycleRaw());
  const [a, , b] = cards();
  M.toggleSet(D, a, 0, { reps: 8, load: 30 });
  M.toggleSet(D, a, 1, { reps: 8, load: 30 });
  M.toggleSet(D, b, 0, { reps: 8, load: 35 });
  assert.equal(M.loggedSets().length, 3);
  const r = M.rollup(`d:${D}`);
  assert.equal(r.sets, 3);
  assert.equal(r.volume, 8 * 30 * 2 + 8 * 35);
  assert.equal(M.exerciseDetail('leg-curl').setCount, 3);
  assert.equal(M.exerciseDetail('leg-curl').days.length, 1);
  assert.equal(M.sessionProgress(D).done, 3);
});

test('prefill: a null-load card 2 takes the same set number from card 1; reps come from the plan', () => {
  reset(); useCycle(cycleRaw());
  const [a, , b] = cards();
  M.toggleSet(D, a, 0, { reps: 8, load: 30 });
  M.toggleSet(D, a, 1, { reps: 6, load: 32.5 });
  const pf = M.prefill(D, b, 0);
  assert.deepEqual([pf.reps, pf.load, pf.from], [8, 30, 'history']);
});

const oldSet = (date, ex, i, extra = {}) => ({ key: `${date}|${ex}|${i}`, date, ex, name: ex, muscle: 'hamstrings', idx: i, done: true, reps: 8, load: 30, ts: 1000 + i, ...extra });

test('old keys migrate to the FIRST card; safe to re-run; nothing lost or duplicated', () => {
  reset(); useCycle(cycleRaw());
  store.put('sets', oldSet(D, 'leg-curl', 0)); store.put('sets', oldSet(D, 'leg-curl', 1)); store.put('sets', oldSet(D, 'bench', 0, { name: 'Bench' }));
  store.put('exlog', { key: `${D}|leg-curl`, date: D, ex: 'leg-curl', name: 'Leg curl', effort: 8, note: 'x' });
  const before = M.loggedSets().length;
  const r1 = M.migratePositionKeys();
  assert.deepEqual([r1.sets, r1.exlog], [3, 1]);
  assert.deepEqual(store.values('sets').map((s) => s.key).sort(), [`${D}|@0|0`, `${D}|@0|1`, `${D}|@1|0`]);
  assert.ok(store.get('exlog', `${D}|@0`));
  assert.equal(M.loggedSets().length, before);
  const snap = JSON.stringify([store.values('sets'), store.values('exlog')].map((x) => x.sort((p, q) => (p.key < q.key ? -1 : 1))));
  const r2 = M.migratePositionKeys();
  assert.deepEqual([r2.sets, r2.exlog], [0, 0]);
  assert.equal(JSON.stringify([store.values('sets'), store.values('exlog')].map((x) => x.sort((p, q) => (p.key < q.key ? -1 : 1)))), snap);
});

test('a set with no matching card keeps its data and still counts in history', () => {
  reset(); useCycle(cycleRaw());
  store.put('sets', oldSet('2026-10-01', 'squat', 0, { load: 100 }));
  const r = M.migratePositionKeys();
  assert.equal(r.unmatched, 1);
  assert.equal(store.get('sets', '2026-10-01|squat|0').load, 100);
  assert.equal(M.loggedSets().length, 1);
  assert.equal(M.exerciseDetail('squat').setCount, 1);
});

test('restoring an old-format backup then applying the cycle runs the migration', () => {
  reset(); useCycle(cycleRaw());
  const backup = { format: 'daily-dash-backup', version: 1, db_schema: 1, exportedAt: '2026-11-05T00:00:00Z', data: { sets: [oldSet(D, 'leg-curl', 0)], exlog: [] } };
  const chk = checkBackup(JSON.stringify(backup));
  applyBackup(chk.backup, 'merge');
  assert.ok(store.get('sets', `${D}|leg-curl|0`));
  M.migratePositionKeys(); // what ctx.applyCycle does after reloadCycle
  assert.ok(store.get('sets', `${D}|@0|0`));
  assert.equal(store.get('sets', `${D}|leg-curl|0`), null);
});

test('re-importing the cycle file keeps ticks attached', () => {
  reset(); useCycle(cycleRaw());
  const [a, , b] = cards();
  M.toggleSet(D, a, 0, { reps: 8, load: 30 }); M.toggleSet(D, b, 0, { reps: 8, load: 35 });
  M.setExLog(D, b, { effort: 9 });
  useCycle(cycleRaw({ meta: { ...cycleRaw().meta, cycle_name: 'T v2' } })); // same plan imported again
  M.migratePositionKeys();
  const [a2, , b2] = cards();
  assert.equal(M.setRec(D, a2, 0).done, true);
  assert.equal(M.setRec(D, b2, 0).done, true);
  assert.equal(M.setRec(D, b2, 0).load, 35);
  assert.equal(M.exLog(D, b2).effort, 9);
  assert.equal(M.sessionProgress(D).done, 2);
});

test('private backup: every set and exlog entry survives the migration with the same totals', { skip: !hasPrivate }, () => {
  const backup = readJson(PRIVATE_BACKUP);
  useCycle(readJson(PRIVATE_CYCLE));
  loadBackup(backup);
  const totals = () => {
    const sets = M.loggedSets();
    const perEx = {};
    for (const s of sets) { const k = `${s.date}|${s.ex}`; perEx[k] = (perEx[k] || 0) + 1; }
    const logs = store.values('exlog').map((x) => `${x.date}|${x.ex}|${x.effort}|${x.note}`).sort();
    return { n: sets.length, vol: sets.reduce((a, s) => a + (M.volumeOf(s) ?? 0), 0), perEx, logs, all: store.values('sets').length };
  };
  const before = totals();
  const r1 = M.migratePositionKeys();
  const after = totals();
  assert.deepEqual(after, before, 'totals unchanged');
  assert.equal(M.migratePositionKeys().sets + M.migratePositionKeys().exlog, 0);
  assert.equal(store.values('sets').length, backup.data.sets.length);
  assert.equal(store.values('exlog').length, backup.data.exlog.length);
  console.log(`private migration: moved ${r1.sets} sets, ${r1.exlog} exlog, unmatched ${r1.unmatched}`);
});

import test from 'node:test';
import { createHash } from 'node:crypto';
const hash = (t) => createHash('sha1').update(t).digest('hex');
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle, loadBackup, readJson, PRIVATE_BACKUP, PRIVATE_CYCLE, hasPrivate } from './helpers.js';

const D = '2026-11-04';
const card = (id, sets = 2) => ({ id, name: id, sets, reps: 8, muscle_group: 'x' });
const plan = (...ids) => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: '2026-11-01', end_date: '2026-11-30' }, days: [{ date: D, slots: [] }], sessions: { [D]: { kind: 'lift', exercises: ids.map((i) => card(i)) } } });
const ex = (c, pos) => c.session(D).exercises[pos];
const exOf = (c, id, occ) => c.session(D).exercises.filter((e) => e.id === id)[occ - 1];

function logged() { // curl (1st), bench, curl (2nd): one set each plus an effort note on the 2nd curl
  reset(); const c = useCycle(plan('curl', 'bench', 'curl'));
  M.toggleSet(D, ex(c, 0), 0, { reps: 8, load: 30 });
  M.toggleSet(D, ex(c, 1), 0, { reps: 5, load: 60 });
  M.toggleSet(D, ex(c, 2), 0, { reps: 8, load: 35 });
  M.setExLog(D, ex(c, 2), { effort: 9, note: 'second' });
}
const reimport = (...ids) => { const c = useCycle(plan(...ids)); const r = M.reconcilePositions(); return { c, r }; };
const loadOf = (c, id, occ) => M.setRec(D, exOf(c, id, occ), 0)?.load;
const totals = () => ({ n: M.loggedSets().length, vol: M.loggedSets().reduce((a, s) => a + (M.volumeOf(s) ?? 0), 0) });

test('exercise inserted before a logged one: ticks follow their exercise and occurrence', () => {
  logged(); const t0 = totals();
  const { c, r } = reimport('row', 'curl', 'bench', 'curl');
  assert.equal(r.reattached, 4); // 3 sets + 1 exlog
  assert.equal(M.setRec(D, ex(c, 0), 0), null, 'new exercise has no ticks');
  assert.equal(loadOf(c, 'curl', 1), 30); assert.equal(loadOf(c, 'bench', 1), 60); assert.equal(loadOf(c, 'curl', 2), 35);
  assert.equal(M.exLog(D, exOf(c, 'curl', 2)).note, 'second');
  assert.equal(M.exLog(D, exOf(c, 'curl', 1)), null);
  assert.deepEqual(totals(), t0);
  assert.equal(M.reconcilePositions().reattached, 0, 'safe to re-run');
});

test('two exercises swapped', () => {
  logged(); const t0 = totals();
  const { c } = reimport('bench', 'curl', 'curl');
  assert.equal(loadOf(c, 'bench', 1), 60); assert.equal(loadOf(c, 'curl', 1), 30); assert.equal(loadOf(c, 'curl', 2), 35);
  assert.deepEqual(totals(), t0);
});

test('a logged exercise removed: kept unmatched, in history and totals, never on another card', () => {
  logged(); const t0 = totals();
  const { c, r } = reimport('curl', 'curl');
  assert.equal(r.unmatched, 1);
  assert.equal(loadOf(c, 'curl', 1), 30); assert.equal(loadOf(c, 'curl', 2), 35);
  for (const pos of [0, 1]) assert.notEqual(M.setRec(D, ex(c, pos), 0)?.load, 60);
  assert.equal(store.get('sets', `${D}|bench|0`).load, 60);
  assert.deepEqual(totals(), t0);
  assert.equal(M.exerciseDetail('bench').setCount, 1);
  assert.equal(M.reconcilePositions().unmatched, 0, 'unmatched stays put on re-run');
});

test('a day with no session in the file is left alone', () => {
  logged();
  const raw = plan('curl'); raw.sessions = {}; useCycle(raw);
  assert.deepEqual(M.reconcilePositions(), { reattached: 0, unmatched: 0, stamped: 0 });
  assert.equal(store.values('sets').length, 3);
});

test('private backup: modified re-imports keep every record and the totals', { skip: !hasPrivate }, () => {
  const rawCycle = readJson(PRIVATE_CYCLE), backup = readJson(PRIVATE_BACKUP);
  useCycle(rawCycle); loadBackup(backup); M.reconcilePositions(); M.migratePositionKeys(); M.cleanExampleData(); M.reconcilePositions();
  const snapshot = () => ({ n: M.loggedSets().length, vol: M.loggedSets().reduce((a, s) => a + (M.volumeOf(s) ?? 0), 0), rows: store.values('sets').length, logs: store.values('exlog').length,
    perEx: hash(JSON.stringify(Object.entries(M.loggedSets().reduce((a, s) => ((a[`${s.date}|${s.ex}`] = (a[`${s.date}|${s.ex}`] || 0) + 1), a), {})).sort())),
    efforts: createHash('sha1').update(store.values('exlog').map((x) => `${x.date}|${x.ex}|${x.effort}|${x.note}`).sort().join('\n')).digest('hex') });
  const base = snapshot();
  const dates = Object.keys(rawCycle.sessions).filter((d) => store.values('sets').some((s) => s.date === d));
  const variants = {
    insert: (e) => [{ id: 'zz-new', name: 'zz new', sets: 2, reps: 5, muscle_group: 'x' }, ...e],
    swap: (e) => (e.length > 1 ? [e[1], e[0], ...e.slice(2)] : e),
    remove: (e) => e.slice(1),
  };
  for (const [name, fn] of Object.entries(variants)) {
    const raw = structuredClone(rawCycle);
    for (const d of dates) if (raw.sessions[d].exercises) raw.sessions[d].exercises = fn(raw.sessions[d].exercises);
    useCycle(raw); M.reconcilePositions();
    assert.deepEqual(snapshot(), base, `${name}: totals, per-exercise counts, efforts and notes unchanged`);
    for (const s of store.values('sets')) { // no record sits on a card of another exercise
      const card = raw.sessions[s.date]?.exercises && M.cycle().session(s.date)?.exercises.find((c) => c.pos === s.pos);
      if (card && !String(s.key).includes('~') && Number.isInteger(s.pos)) assert.equal(s.ex, card.id ?? s.ex, `${name}: ${s.date}`);
    }
    M.reconcilePositions(); assert.deepEqual(snapshot(), base, `${name}: re-run`);
    useCycle(rawCycle); M.reconcilePositions(); M.migratePositionKeys(); // back to the original plan
    assert.deepEqual(snapshot(), base, `${name}: back to original`);
  }
});

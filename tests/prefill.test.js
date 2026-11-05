import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle } from './helpers.js';

const D1 = '2026-10-29', D2 = '2026-11-04';
const raw = () => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: '2026-10-01', end_date: '2026-11-30' }, days: [], sessions: {
  [D1]: { kind: 'lift', exercises: [
    { id: 'barbell-row', name: 'Barbell row', sets: 4, reps: 10, load_kg: 49, muscle_group: 'back' },
    { id: 'pull-ups', name: 'Pull-ups', sets: 3, reps: 6, load_kg: null, muscle_group: 'back' },
    { id: 'cable-row', name: 'Cable row', sets: 3, reps: 12, load_kg: null, muscle_group: 'back' }] },
  [D2]: { kind: 'lift', exercises: [
    { id: 'barbell-row', name: 'Barbell row', sets: 4, reps: 6, load_kg: 51, muscle_group: 'back' },
    { id: 'pull-ups', name: 'Pull-ups', sets: 3, reps: 6, load_kg: null, muscle_group: 'back' },
    { id: 'cable-row', name: 'Cable row', sets: 3, reps: 12, load_kg: null, muscle_group: 'back' }] },
} });
const card = (c, date, id) => c.session(date).exercises.find((e) => e.id === id);

function logLast(c) {
  const row = card(c, D1, 'barbell-row'), pu = card(c, D1, 'pull-ups'), cr = card(c, D1, 'cable-row');
  for (let i = 0; i < 4; i++) M.toggleSet(D1, row, i, { reps: 10, load: 49 });
  for (let i = 0; i < 3; i++) store.put('sets', { key: `${D1}|@1|${i}`, date: D1, pos: 1, occ: 1, ex: 'pull-ups', name: 'Pull-ups', idx: i, done: true, reps: 6, load: null, ts: 10 + i });
  [30, 32.5, 35].forEach((kg, i) => M.toggleSet(D1, cr, i, { reps: 12, load: kg }));
}

test('plan load wins (Barbell row prefills 51 x 6); reps always come from the plan', () => {
  reset(); const c = useCycle(raw()); logLast(c);
  const row = card(c, D2, 'barbell-row');
  const pf = M.prefill(D2, row, 0);
  assert.deepEqual([pf.load, pf.reps, pf.from], [51, 6, 'plan']);
  assert.equal(M.prefill(D2, row, 3).load, 51);
});

test('Pull-ups prefill bodyweight x 6 (kg stays blank)', () => {
  reset(); const c = useCycle(raw()); logLast(c);
  const pf = M.prefill(D2, card(c, D2, 'pull-ups'), 1);
  assert.deepEqual([pf.load, pf.reps], [null, 6]);
});

test('a null plan load prefills the SAME set number of the last session, falling back to its last set', () => {
  reset(); const c = useCycle(raw()); logLast(c);
  const cr = card(c, D2, 'cable-row');
  assert.deepEqual([0, 1, 2].map((i) => M.prefill(D2, cr, i).load), [30, 32.5, 35]);
  assert.equal(M.prefill(D2, { ...cr, sets: 5 }, 4).load, 35, 'no set 5 last time: its last set');
  assert.equal(M.prefill(D2, cr, 0).reps, 12);
  assert.equal(M.prefill(D2, cr, 0).from, 'history');
});

test('"last:" line lists the last session sets; bodyweight, never "no load"', () => {
  reset(); const c = useCycle(raw()); logLast(c);
  const ls = M.lastSession(D2, card(c, D2, 'barbell-row'));
  assert.equal(ls.date, D1);
  assert.equal(M.setsText(ls.sets), '49 kg × 10, 10, 10, 10');
  assert.equal(M.setsText(M.lastSession(D2, card(c, D2, 'pull-ups')).sets), 'bodyweight × 6, 6, 6');
  assert.equal(M.setsText(M.lastSession(D2, card(c, D2, 'cable-row')).sets), '30 kg × 12; 32.5 kg × 12; 35 kg × 12');
  assert.doesNotMatch(M.setsText(ls.sets) + M.setsText(M.lastSession(D2, card(c, D2, 'pull-ups')).sets), /no load/);
  assert.equal(M.lastSession(D1, card(c, D1, 'barbell-row')), null, 'nothing before the first session');
});

test('no history and no plan load: blank kg', () => {
  reset(); const c = useCycle(raw());
  const pf = M.prefill(D1, card(c, D1, 'cable-row'), 0);
  assert.deepEqual([pf.load, pf.reps, pf.from], [null, 12, 'none']);
});

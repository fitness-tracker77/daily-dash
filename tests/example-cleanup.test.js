import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle, loadBackup, readJson, PRIVATE_BACKUP, PRIVATE_CYCLE, hasPrivate } from './helpers.js';

const real = () => ({
  schema_version: 2, meta: { cycle_name: 'Real', start_date: '2026-11-01', end_date: '2026-11-30' },
  days: [{ date: '2026-11-02', slots: [{ id: 'b', time: '08:00', type: 'meal', title: 'Breakfast', items: [{ name: 'Oats', item_id: 'oats', grams: 50, kcal: 190, protein_g: 6 }] }] }],
  sessions: {}, pantry: [{ item_id: 'oats', name: 'Oats', quantity: 500, unit: 'g' }],
});
const meal = (key, date, title, ids) => ({ key, date, slot: key.split('|')[1], type: 'meal', title, time: '08:00', ts: 1, items: ids.map((id) => ({ name: id, item_id: id, eaten_g: 10, kcal: 1, protein: 1 })), kcal: 1, protein: 1, deducted: [] });

function seed() {
  reset(); useCycle(real());
  store.put('meals', meal('2026-11-02|id:b', '2026-11-02', 'Breakfast', ['oats']));
  store.put('meals', meal('2026-11-02|id:x1', '2026-11-02', 'Example breakfast', ['oats']));
  store.put('meals', meal('2026-11-02|id:x2', '2026-11-02', 'Lunch', ['ex_rice']));
  store.put('grams', { key: '2026-11-02|id:x2', date: '2026-11-02', slot: 'id:x2', g: { 0: 100 } });
  store.put('sets', { key: '2026-11-02|example-squat|0', date: '2026-11-02', ex: 'example-squat', name: 'Squat', idx: 0, done: true, reps: 5, load: 50, ts: 1 });
  store.put('sets', { key: '2026-11-03|@0|0', date: '2026-11-03', pos: 0, ex: 'squat', name: 'Squat', idx: 0, done: true, reps: 5, load: 60, ts: 2 });
  store.put('exlog', { key: '2026-11-02|example-squat', date: '2026-11-02', ex: 'example-squat', effort: 5, note: '' });
  store.put('exlog', { key: '2026-11-03|@0', date: '2026-11-03', pos: 0, ex: 'squat', effort: 7, note: 'real' });
  store.put('pantry', { key: 'ex_rice', quantity: 1, source: 'counted' });
  store.put('pantry', { key: 'oats', quantity: 400, source: 'counted' });
  store.put('pantryEvents', { key: 'e1', date: '2026-11-02', ts: 1, item_id: 'ex_rice', kind: 'bought', amount: 1 });
  store.put('pantryEvents', { key: 'e2', date: '2026-11-02', ts: 2, item_id: 'oats', kind: 'bought', amount: 1 });
  store.put('bodyweight', { key: '2026-11-02', date: '2026-11-02', kg: 66, ts: 1 });
  store.put('days', { key: '2026-11-02', planned: 12, done: 2, complete: false });
  store.put('days', { key: '2026-10-30', planned: 12, done: 2, complete: false }); // example-only day outside the real cycle
}

test('removes only example-marked records, keeps real ones, recomputes days', () => {
  seed();
  const r = M.cleanExampleData();
  assert.deepEqual([r.meals.length, r.sets.length, r.exlog.length, r.pantry.length, r.pantryEvents.length], [2, 1, 1, 1, 1]);
  assert.deepEqual(store.values('meals').map((m) => m.key), ['2026-11-02|id:b']);
  assert.equal(store.get('grams', '2026-11-02|id:x2'), null);
  assert.deepEqual(store.values('sets').map((x) => x.ex), ['squat']);
  assert.deepEqual(store.values('exlog').map((x) => x.note), ['real']);
  assert.deepEqual(store.values('pantry').map((x) => x.key), ['oats']);
  assert.deepEqual(store.values('pantryEvents').map((x) => x.key), ['e2']);
  assert.equal(store.values('bodyweight').length, 1);
  assert.deepEqual(r.days, ['2026-10-30']);
  assert.equal(store.get('days', '2026-11-02').planned, 1); // 1 real meal slot planned
  assert.equal(store.get('days', '2026-11-02').done, 1);
});

test('is safe to re-run', () => {
  seed(); M.cleanExampleData();
  const snap = JSON.stringify(store.COLLS.map((c) => store.values(c).sort((a, b) => (a.key < b.key ? -1 : 1))));
  const r = M.cleanExampleData();
  assert.equal(r.meals.length + r.sets.length + r.exlog.length + r.pantry.length + r.pantryEvents.length + r.days.length, 0);
  assert.equal(JSON.stringify(store.COLLS.map((c) => store.values(c).sort((a, b) => (a.key < b.key ? -1 : 1)))), snap);
});

test('never writes while the built-in example is the active cycle', () => {
  reset();
  const ex = readJson(new URL('../data/cycle.example.json', import.meta.url));
  const c = useCycle(ex);
  assert.equal(c.isExample, true);
  const date = [...c.sessionMap.keys()][0];
  M.toggleSet(date, c.session(date).exercises[0], 0, { reps: 5, load: 20 });
  const slot = c.mealSlots(c.dates[0])[0];
  M.setTick(c.dates[0], slot, true);
  M.recount('ex_oats', 5);
  for (const col of ['sets', 'meals', 'days', 'pantry', 'pantryEvents', 'exlog', 'runs', 'grams']) assert.equal(store.values(col).length, 0, col);
});

test('private backup: only example records go; real meals, sets, weigh-ins and pantry untouched; 11-04 = 14 sets, 5,176 kg', { skip: !hasPrivate }, () => {
  const backup = readJson(PRIVATE_BACKUP);
  useCycle(readJson(PRIVATE_CYCLE)); loadBackup(backup);
  const orig = backup.data;
  const exItem = (id) => typeof id === 'string' && id.startsWith('ex_');
  const expectGone = {
    meals: orig.meals.filter((m) => m.items?.some((i) => exItem(i.item_id)) || String(m.title).startsWith('Example')).map((m) => m.key),
    sets: orig.sets.filter((s) => String(s.ex).startsWith('example-')).map((s) => s.key),
    exlog: orig.exlog.filter((s) => String(s.ex).startsWith('example-')).map((s) => s.key),
    pantry: orig.pantry.filter((p) => exItem(p.key)).map((p) => p.key),
    pantryEvents: orig.pantryEvents.filter((p) => exItem(p.item_id)).map((p) => p.key),
  };
  const r = M.cleanExampleData();
  for (const c of Object.keys(expectGone)) assert.deepEqual(r[c].slice().sort(), expectGone[c].slice().sort(), c);
  for (const c of Object.keys(expectGone)) { // everything not marked is still there, byte for byte
    const keep = orig[c].filter((x) => !expectGone[c].includes(x.key));
    assert.deepEqual(store.values(c).map((x) => x.key).sort(), keep.map((x) => x.key).sort(), `${c} kept`);
    if (c !== 'sets') for (const k of keep) assert.deepEqual(store.get(c, k.key), k, `${c} ${k.key} unchanged`);
  }
  assert.deepEqual(store.values('bodyweight').sort((a, b) => (a.key < b.key ? -1 : 1)), orig.bodyweight.slice().sort((a, b) => (a.key < b.key ? -1 : 1)));
  assert.equal(M.cleanExampleData().meals.length, 0);
  const day = M.loggedSets().filter((s) => s.date === '2026-11-04');
  assert.equal(day.length, 14);
  assert.equal(day.reduce((a, s) => a + (M.volumeOf(s) ?? 0), 0), 5176);
  const dd = store.get('days', '2026-11-02');
  console.log(`private cleanup removed: meals ${r.meals.length}, sets ${r.sets.length}, exlog ${r.exlog.length}, pantry ${r.pantry.length}, pantryEvents ${r.pantryEvents.length}, days dropped ${r.days.length}; 11-02 now planned ${dd?.planned} done ${dd?.done}`);
});

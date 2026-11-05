import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model as M, reset, useCycle } from './helpers.js';
import { today, addDays } from '../js/util.js';

const T = today(), D1 = addDays(T, 1), D2 = addDays(T, 2), D3 = addDays(T, 3);
const meal = (id, time, items) => ({ id, time, type: 'meal', title: id, items });
const it = (item_id, grams) => ({ name: item_id, item_id, grams, kcal: 100, protein_g: 5 });
const raw = (pantry, days, end = addDays(T, 6)) => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: addDays(T, -1), end_date: end }, days, sessions: {}, pantry });
const base = () => raw(
  [{ item_id: 'tort', name: 'Tortillas', quantity: 4, unit: 'pcs', grams_per_unit: 50, source: 'counted', as_of: T },
   { item_id: 'oats', name: 'Oats', quantity: 100, unit: 'g', source: 'counted', as_of: T },
   { item_id: 'egg', name: 'Eggs', quantity: 6, unit: 'pcs', source: 'counted', as_of: T },
   { item_id: 'quesa', name: 'Quesadillas', quantity: 0, unit: 'pcs', grams_per_unit: 100, source: 'counted', as_of: T }],
  [
    { date: T, slots: [{ id: 'cook', time: '10:00', type: 'cook', title: 'Batch cook', yields: [{ item_id: 'quesa', quantity: 8 }], items: [] }] },
    { date: D1, slots: [meal('q1', '13:00', [it('quesa', 400), it('oats', 150)]), meal('x', '19:00', [it('mystery', 200)])] },
    { date: D2, slots: [meal('q2', '13:00', [it('quesa', 400), it('egg', 100), it('oats', 100)])] },
    { date: D3, slots: [meal('q3', '13:00', [it('tort', 400)])] },
  ]);
const setup = (r = base()) => { reset(); const c = useCycle(r); M.syncPantry(); return c; };
const cook = (c) => c.slots(T).find((s) => s.id === 'cook');

test('ticking the cook slot adds a cooked event; unticking reverses it', () => {
  const c = setup();
  M.setTick(T, cook(c), true);
  assert.equal(store.get('pantry', 'quesa').quantity, 8);
  const ev = store.values('pantryEvents'); assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].kind, ev[0].item_id, ev[0].amount], ['cooked', 'quesa', 8]);
  M.setTick(T, cook(c), false);
  assert.equal(store.get('pantry', 'quesa').quantity, 0);
  assert.equal(store.values('pantryEvents').length, 0);
});

test('a planned yield counts as stock, so the batch is not listed to buy', () => {
  setup();
  const rows = M.shoppingList().rows;
  assert.ok(!rows.some((r) => r.id === 'quesa'), 'quesadillas not to buy (8 planned, 8 needed)');
  // without the yield the same use would be a shortfall
  const r2 = base(); delete r2.days[0].slots[0].yields; setup(r2);
  assert.equal(M.shoppingList().rows.find((r) => r.id === 'quesa').deficit, 8);
  // a yield dated AFTER the use does not help: oats are used on D1 and D2, a batch of oats lands on D3
  const r3 = base(); r3.days[3].slots.push({ id: 'late', time: '08:00', type: 'cook', title: 'late', yields: [{ item_id: 'oats', quantity: 999 }], items: [] }); setup(r3);
  assert.equal(M.shoppingList().rows.find((r) => r.id === 'oats').deficit, 150);
});

test('items with no pantry line go to notTracked with planned grams, not the shopping rows', () => {
  setup();
  const s = M.shoppingList();
  assert.ok(!s.rows.some((r) => r.id === 'mystery'));
  assert.deepEqual(s.notTracked.map((r) => [r.id, r.grams, r.neededBy]), [['mystery', 200, D1]]);
});

test('pcs without grams_per_unit is "planned in grams, stocked in pieces"', () => {
  setup();
  const egg = M.pantryBoard().find((r) => r.id === 'egg');
  assert.equal(egg.noConversion, true); assert.equal(egg.pieces, true);
  const row = M.shoppingList().rows.find((r) => r.id === 'egg');
  assert.equal(row.pieces, true);
});

test('stock never shows negative', () => {
  const c = setup();
  store.put('pantry', { ...store.get('pantry', 'oats'), quantity: -30 });
  M.cycle(); // memo cleared by store.put's change event
  const o = M.pantryBoard().find((r) => r.id === 'oats');
  assert.equal(o.quantity, 0); assert.equal(o.negative, true); assert.equal(o.overBy, 250);
  assert.equal(M.shoppingList().rows.find((r) => r.id === 'oats').have, 0);
  assert.ok(c);
});

test('shopping list is sorted by first date needed and carries it', () => {
  setup();
  const rows = M.shoppingList().rows;
  assert.ok(rows.length >= 2);
  for (const r of rows) assert.match(r.neededBy, /^\d{4}-\d\d-\d\d$/);
  assert.deepEqual(rows.map((r) => r.neededBy), rows.map((r) => r.neededBy).slice().sort());
  assert.equal(rows.find((r) => r.id === 'oats').neededBy, D1);
  assert.equal(rows.find((r) => r.id === 'tort').neededBy, D3);
  assert.ok(rows.findIndex((r) => r.id === 'oats') < rows.findIndex((r) => r.id === 'tort'));
});

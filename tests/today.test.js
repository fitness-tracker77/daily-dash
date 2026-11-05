import test from 'node:test';
import assert from 'node:assert/strict';
import { model as M, reset, useCycle } from './helpers.js';
import { today, addDays } from '../js/util.js';

const T = today();
const meal = (id, time) => ({ id, time, type: 'meal', title: id, items: [{ name: id, item_id: id, grams: 100, kcal: 100, protein_g: 5 }] });
const cook = (id, time) => ({ id, time, type: 'cook', title: id, items: [] });
const day = (date) => ({ date, slots: [meal('a', '08:00'), meal('b', '10:15'), cook('c', '13:00'), meal('d', '19:00')] });
const raw = () => ({ schema_version: 2, meta: { cycle_name: 'T', start_date: addDays(T, -5), end_date: addDays(T, 5) }, days: [-3, -2, -1, 0, 1].map((n) => day(addDays(T, n))), sessions: {} });
const tickAll = (c, date) => c.slots(date).forEach((s) => M.setTick(date, s, true));

test('streak: two complete days, today in progress, reads 2; completing today makes it 3', () => {
  reset(); const c = useCycle(raw());
  tickAll(c, addDays(T, -2)); tickAll(c, addDays(T, -1));
  M.setTick(T, c.slots(T)[0], true); // today: 1 of 4
  assert.equal(M.streaks().current, 2);
  tickAll(c, T);
  assert.equal(M.streaks().current, 3);
});

test('streak: an unfinished yesterday breaks it, an unfinished today does not', () => {
  reset(); const c = useCycle(raw());
  tickAll(c, addDays(T, -3)); tickAll(c, addDays(T, -2));
  M.setTick(addDays(T, -1), c.slots(addDays(T, -1))[0], true);
  assert.equal(M.streaks().current, 0);
});

test('still open items sit above next up, oldest first; next up is the first item still ahead', () => {
  reset(); const c = useCycle(raw());
  const at = (h, m = 0) => ({ date: T, minutes: h * 60 + m });
  let a = M.todayAgenda(T, at(11));
  assert.deepEqual(a.open.map((s) => s.id), ['a', 'b']);
  assert.equal(a.next.id, 'c');
  M.setTick(T, c.slots(T).find((s) => s.id === 'a'), true);
  a = M.todayAgenda(T, at(11));
  assert.deepEqual(a.open.map((s) => s.id), ['b']);
  a = M.todayAgenda(T, at(7));
  assert.deepEqual([a.open.length, a.next.id], [0, 'b']);
  a = M.todayAgenda(T, at(20));
  assert.deepEqual([a.open.map((s) => s.id), a.next], [['b', 'c', 'd'], null]);
  assert.equal(M.todayAgenda(addDays(T, 1), at(20)).open.length, 0, 'another day has nothing "still open"');
});

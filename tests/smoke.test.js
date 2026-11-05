import test from 'node:test';
import assert from 'node:assert/strict';
import { store, model, reset, useCycle, readJson } from './helpers.js';

test('example cycle loads and a set can be ticked', () => {
  reset();
  const raw = readJson(new URL('../data/cycle.example.json', import.meta.url));
  const c = useCycle(raw);
  const date = [...c.sessionMap.keys()][0];
  const ex = c.session(date).exercises[0];
  model.toggleSet(date, ex, 0, { reps: 8, load: 40 });
  assert.equal(store.values('sets').filter((s) => s.done).length, 1);
});

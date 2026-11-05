// Test helpers: load a cycle into the model and reset the in-memory store (no IndexedDB needed).
import * as store from '../js/store.js';
import * as model from '../js/model.js';
import { Cycle } from '../js/data.js';
import { readFileSync, existsSync } from 'node:fs';

export { store, model };
export const PRIVATE_BACKUP = new URL('../private/daily-dash-backup-2026-11-05.json', import.meta.url);
export const PRIVATE_CYCLE = new URL('../private/cycle.json', import.meta.url);
export const hasPrivate = existsSync(PRIVATE_BACKUP) && existsSync(PRIVATE_CYCLE);
export const readJson = (u) => JSON.parse(readFileSync(u, 'utf8'));

export function reset() { for (const c of store.COLLS) for (const k of [...store.all(c).keys()]) store.all(c).delete(k); }
export function useCycle(raw) { const c = new Cycle(raw); model.setCycle(c); return c; }
export function loadBackup(backup) {
  reset();
  for (const [c, rows] of Object.entries(backup.data)) for (const r of rows) store.all(c).set(r.key, structuredClone(r));
  model.setCycle(model.cycle());
}

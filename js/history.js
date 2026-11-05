// Import history: weigh-ins, runs and lift sets from before the app, pasted or from a file.
// Written into the same stores as logged data. Never overwrites: a weigh-in or run for a date that already has
// one is skipped, and so is a set already present for the same date + exercise + set number. Re-importing adds nothing.
// lift_sets are history-only (the "unmatched" form: key `date|exId|idx`, no `pos`), so they count in history,
// prefill, PRs, charts and volume but are never shown on a session card.
import * as store from './store.js';
import { isNum, isValidDate, slug } from './util.js';

const isStr = (v) => typeof v === 'string' && v.trim() !== '';

// Parse and validate. Never throws. Invalid entries are listed (exact field) and left out; nothing is guessed.
export function checkHistory(text) {
  let obj;
  try { obj = JSON.parse(String(text ?? '')); } catch (e) { return { ok: false, error: `Not valid JSON (${e.message}). Nothing was imported.` }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'Expected an object with weigh_ins, runs and lift_sets. Nothing was imported.' };
  const warnings = [];
  const w = (path, msg) => warnings.push({ path, msg });
  const list = (k) => {
    if (obj[k] == null) return [];
    if (!Array.isArray(obj[k])) { w(k, 'must be a list'); return []; }
    return obj[k];
  };
  const weigh = []; const runs = []; const sets = [];
  list('weigh_ins').forEach((x, i) => {
    const p = `weigh_ins[${i}]`; let ok = true;
    if (!isValidDate(x?.date)) { w(`${p}.date`, 'must be a date written YYYY-MM-DD'); ok = false; }
    if (!isNum(x?.kg) || x.kg <= 0) { w(`${p}.kg`, 'must be a number above 0'); ok = false; }
    if (x?.note != null && typeof x.note !== 'string') { w(`${p}.note`, 'must be text'); ok = false; }
    if (ok) weigh.push({ date: x.date, kg: x.kg, note: x.note || '' }); else weigh.push(null);
  });
  list('runs').forEach((x, i) => {
    const p = `runs[${i}]`; let ok = true;
    if (!isValidDate(x?.date)) { w(`${p}.date`, 'must be a date written YYYY-MM-DD'); ok = false; }
    if (!isNum(x?.distance_km) || x.distance_km <= 0) { w(`${p}.distance_km`, 'must be a number above 0'); ok = false; }
    if (x?.note != null && typeof x.note !== 'string') { w(`${p}.note`, 'must be text'); ok = false; }
    if (ok) runs.push({ date: x.date, distance_km: x.distance_km, note: x.note || '' }); else runs.push(null);
  });
  list('lift_sets').forEach((x, i) => {
    const p = `lift_sets[${i}]`; let ok = true;
    if (!isValidDate(x?.date)) { w(`${p}.date`, 'must be a date written YYYY-MM-DD'); ok = false; }
    if (!isStr(x?.exercise) || !slug(x.exercise)) { w(`${p}.exercise`, 'must be the exercise name'); ok = false; }
    if (!Number.isInteger(x?.set) || x.set < 1) { w(`${p}.set`, 'must be a whole number from 1'); ok = false; }
    if (!isNum(x?.reps) || x.reps < 0) { w(`${p}.reps`, 'must be a number, 0 or more'); ok = false; }
    if (x?.load_kg !== null && (!isNum(x?.load_kg) || x.load_kg < 0)) { w(`${p}.load_kg`, 'must be a number, or null for bodyweight'); ok = false; }
    if (x?.muscle_group != null && typeof x.muscle_group !== 'string') { w(`${p}.muscle_group`, 'must be text'); ok = false; }
    if (x?.note != null && typeof x.note !== 'string') { w(`${p}.note`, 'must be text'); ok = false; }
    if (ok) sets.push({ date: x.date, name: x.exercise.trim(), ex: slug(x.exercise), muscle: isStr(x.muscle_group) ? x.muscle_group.trim().toLowerCase() : null, idx: x.set - 1, reps: x.reps, load: x.load_kg, note: x.note || '' }); else sets.push(null);
  });
  if (!obj.weigh_ins && !obj.runs && !obj.lift_sets) return { ok: false, error: 'Nothing to import: the file has no weigh_ins, runs or lift_sets. Nothing was imported.' };
  return { ok: true, history: { weigh, runs, sets }, warnings, counts: { weigh_ins: weigh.length, runs: runs.length, sets: sets.length } };
}

// Write what is new. Returns { added, skipped } per kind; `skipped.invalid` are entries that failed validation.
export function importHistory(history) {
  const out = { added: { weigh_ins: 0, runs: 0, sets: 0 }, skipped: { weigh_ins: 0, runs: 0, sets: 0, invalid: 0 } };
  const at = Date.now();
  for (const x of history.weigh) {
    if (!x) { out.skipped.invalid++; continue; }
    if (store.get('bodyweight', x.date)) { out.skipped.weigh_ins++; continue; }
    store.put('bodyweight', { key: x.date, date: x.date, kg: x.kg, ts: at, ...(x.note ? { note: x.note } : {}) });
    out.added.weigh_ins++;
  }
  for (const x of history.runs) {
    if (!x) { out.skipped.invalid++; continue; }
    const key = `${x.date}|run`;
    if (store.get('runs', key)) { out.skipped.runs++; continue; }
    store.put('runs', { key, date: x.date, distance_km: x.distance_km, time_s: null, notes: x.note, ts: at });
    out.added.runs++;
  }
  const have = new Set(store.values('sets').filter((r) => r.done).map((r) => `${r.date}|${r.ex}|${r.idx}`));
  for (const x of history.sets) {
    if (!x) { out.skipped.invalid++; continue; }
    const id = `${x.date}|${x.ex}|${x.idx}`;
    if (have.has(id) || store.get('sets', id)) { out.skipped.sets++; continue; }
    have.add(id);
    // ts orders sets within a date (oldest first) and is the same on every import
    store.put('sets', { key: id, date: x.date, ex: x.ex, name: x.name, muscle: x.muscle, idx: x.idx, done: true, reps: x.reps, load: x.load, ts: Date.parse(`${x.date}T12:00:00Z`) + x.idx * 1000, ...(x.note ? { note: x.note } : {}) });
    out.added.sets++;
  }
  return out;
}

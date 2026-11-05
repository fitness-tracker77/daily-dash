// All computations. Inputs are cycle.json (via Cycle) and what you logged (via store).
// Rule: if an input number is missing, the result is null (shown as "not logged"),
// never a guessed value. Estimates (estimated 1RM) are labelled "estimate" wherever shown.
import * as store from './store.js';
import { slotKey, exKey, UNGROUPED } from './data.js';
import {
  isNum, today, addDays, addMonths, dateRange, dow, sum, round3, isValidDate, fmtKg, fmtNum, fmtDow,
  daysBetween, weekStart, esc, monthKey, monthStart, uid, fmtClock, fmtPace,
} from './util.js';

let C = null;
export const setCycle = (c) => { C = c; memo.clear(); };
export const cycle = () => C;


// While the built-in example cycle is active nothing is written to storage (it would pollute real Insights later).
// Bodyweight, settings and derived rollups are not example data and stay writable.
const GUARDED = new Set(['meals', 'grams', 'pantry', 'pantryEvents', 'sets', 'exlog', 'runs', 'days']);
const exampleActive = () => !!(C && C.isExample);
function wput(coll, rec) { if (exampleActive() && GUARDED.has(coll)) return; store.put(coll, rec); }
function wkv(key, value) { if (!exampleActive()) store.setKv(key, value); }

// derived values are cached until the next change to logged data
const memo = new Map();
const cached = (k, fn) => { if (!memo.has(k)) memo.set(k, fn()); return memo.get(k); };
const ROLLUP_SOURCES = new Set(['meals', 'sets', 'runs']);
store.onChange((coll) => { memo.clear(); if (ROLLUP_SOURCES.has(coll)) markRollupsDirty(); });

// ======================================================================
// SETTINGS
// ======================================================================
export const DEFAULT_SETTINGS = { theme: 'dark', autoRest: true, restDefault: 90 };
export function settings() { return { ...DEFAULT_SETTINGS, ...(store.kv('settings') || {}) }; }
export function setSetting(k, v) { store.setKv('settings', { ...(store.kv('settings') || {}), [k]: v }); }

// ======================================================================
// MEALS (and other tickable slots)
// ======================================================================
const tickKey = (date, slot) => `${date}|${slotKey(slot)}`;

export function editedGrams(date, slot, idx) {
  const v = store.get('grams', tickKey(date, slot))?.g?.[idx];
  return isNum(v) ? v : null;
}
export function gramsFor(date, slot, idx) {
  const e = editedGrams(date, slot, idx);
  if (e != null) return e;
  const g = slot.items?.[idx]?.grams;
  return isNum(g) ? g : null;
}
// an item's numbers scaled to the grams actually eaten: kcal × eaten / planned
export function scaled(item, grams) {
  const ok = isNum(item?.grams) && item.grams > 0 && isNum(grams);
  return {
    kcal: ok && isNum(item.kcal) ? item.kcal * grams / item.grams : null,
    protein: ok && isNum(item.protein_g) ? item.protein_g * grams / item.grams : null,
  };
}
export const tick = (date, slot) => store.get('meals', tickKey(date, slot));

export function setTick(date, slot, on) {
  const key = tickKey(date, slot);
  const prev = store.get('meals', key);
  if (prev) { reversePantry(prev); store.del('meals', key); }
  if (on) {
    const snap = { key, date, slot: slotKey(slot), ts: Date.now(), type: slot.type, title: slot.title ?? null, time: slot.time ?? null, items: [], kcal: null, protein: null, partial: false, deducted: [] };
    if (slot.type === 'meal' && Array.isArray(slot.items)) {
      slot.items.forEach((it, i) => {
        const g = gramsFor(date, slot, i);
        const sc = scaled(it, g);
        snap.items.push({
          name: it?.name ?? null, item_id: it?.item_id ?? null,
          planned_g: isNum(it?.grams) ? it.grams : null, planned_kcal: isNum(it?.kcal) ? it.kcal : null, planned_protein: isNum(it?.protein_g) ? it.protein_g : null,
          eaten_g: g, kcal: sc.kcal, protein: sc.protein,
        });
      });
      totalSnap(snap);
      snap.deducted = deductPantry(snap.items);
    }
    wput('meals', snap);
  }
  progress(date);
}
function totalSnap(snap) {
  const k = snap.items.map((x) => x.kcal), p = snap.items.map((x) => x.protein);
  snap.kcal = sum(k.filter(isNum));
  snap.protein = sum(p.filter(isNum));
  snap.partial = k.some((v) => !isNum(v)) || p.some((v) => !isNum(v));
}

export function setGrams(date, slot, idx, grams) {
  const key = tickKey(date, slot);
  const cur = store.get('grams', key);
  const g = { ...(cur?.g || {}) };
  if (isNum(grams) && grams >= 0) g[idx] = grams; else delete g[idx];
  if (Object.keys(g).length) wput('grams', { key, date, slot: slotKey(slot), g });
  else store.del('grams', key);
  if (tick(date, slot)) setTick(date, slot, true); // re-apply with the new grams
}

// Log screen: change the grams of a ticked meal from its own record (works for any past cycle)
export function editTickGrams(key, gramsByIdx) {
  const rec = store.get('meals', key);
  if (!rec || rec.type !== 'meal') return;
  reversePantry(rec);
  const snap = { ...rec, items: rec.items.map((it, i) => {
    const g = isNum(gramsByIdx[i]) && gramsByIdx[i] >= 0 ? gramsByIdx[i] : it.eaten_g;
    const per = (planned, eatenVal) => (isNum(planned) && isNum(it.planned_g) && it.planned_g > 0 ? planned * g / it.planned_g
      : isNum(eatenVal) && isNum(it.eaten_g) && it.eaten_g > 0 ? eatenVal * g / it.eaten_g : null);
    return { ...it, eaten_g: g, kcal: per(it.planned_kcal, it.kcal), protein: per(it.planned_protein, it.protein) };
  }) };
  totalSnap(snap);
  snap.deducted = deductPantry(snap.items);
  wput('meals', snap);
  const g = {}; snap.items.forEach((it, i) => { if (isNum(it.eaten_g) && it.eaten_g !== it.planned_g) g[i] = it.eaten_g; });
  if (Object.keys(g).length) wput('grams', { key, date: rec.date, slot: rec.slot, g }); else store.del('grams', key);
  progress(rec.date);
}
export function deleteTick(key) {
  const rec = store.get('meals', key);
  if (!rec) return;
  reversePantry(rec);
  store.del('meals', key);
  progress(rec.date);
}

const ticksByDate = () => cached('ticksByDate', () => {
  const m = new Map();
  for (const r of store.values('meals')) { if (!m.has(r.date)) m.set(r.date, []); m.get(r.date).push(r); }
  return m;
});
export const ticksOn = (date) => ticksByDate().get(date) || [];

export function eaten(date) {
  const meals = ticksOn(date).filter((x) => x.type === 'meal');
  return {
    kcal: meals.length ? sum(meals.map((m) => m.kcal).filter(isNum)) : null,
    protein: meals.length ? sum(meals.map((m) => m.protein).filter(isNum)) : null,
    partial: meals.some((m) => m.partial),
    meals: meals.length,
  };
}

// ======================================================================
// PANTRY
// ======================================================================
const lineSig = (l) => `${l.quantity}|${l.unit}|${l.source}|${l.as_of}|${l.grams_per_unit ?? ''}`;

// a pantry line is (re)set from cycle.json when it first appears or when the file changes it
export function syncPantry() {
  for (const l of C.pantry) {
    const sig = lineSig(l);
    const cur = store.get('pantry', l.item_id);
    if (!cur || cur.baseSig !== sig) {
      wput('pantry', { key: l.item_id, quantity: l.quantity, source: l.source === 'counted' ? 'counted' : 'calculated', as_of: isValidDate(l.as_of) ? l.as_of : null, baseSig: sig });
    }
  }
}
export const pantryLine = (id) => C.pantry.find((l) => l.item_id === id) || null;
export const pantryState = (id) => store.get('pantry', id);

// grams -> the line's unit; null when there is no honest conversion
export function gramsToUnit(line, grams) {
  if (!isNum(grams)) return null;
  const u = String(line.unit).toLowerCase();
  if (u === 'g') return grams;
  if (u === 'kg') return grams / 1000;
  if (isNum(line.grams_per_unit) && line.grams_per_unit > 0) return grams / line.grams_per_unit;
  return null;
}
export function unitToGrams(line, qty) {
  if (!isNum(qty)) return null;
  const u = String(line.unit).toLowerCase();
  if (u === 'g') return qty;
  if (u === 'kg') return qty * 1000;
  if (isNum(line.grams_per_unit) && line.grams_per_unit > 0) return qty * line.grams_per_unit;
  return null;
}

function deductPantry(items) {
  const out = [];
  for (const it of items) {
    if (!it.item_id) continue;
    const line = pantryLine(it.item_id); const cur = pantryState(it.item_id);
    if (!line || !cur) continue;
    const amt = gramsToUnit(line, it.eaten_g);
    if (amt == null) continue;
    wput('pantry', { ...cur, quantity: round3(cur.quantity - amt), source: 'calculated', as_of: today() });
    out.push({ item_id: it.item_id, amount: amt, sig: cur.baseSig });
  }
  return out;
}
function reversePantry(snap) {
  for (const d of snap.deducted || []) {
    const cur = pantryState(d.item_id);
    if (!cur || cur.baseSig !== d.sig) continue; // a newer cycle.json count replaced this line
    wput('pantry', { ...cur, quantity: round3(cur.quantity + d.amount), source: 'calculated', as_of: today() });
  }
}

export function recount(id, qty) {
  const cur = pantryState(id); const line = pantryLine(id);
  if (!cur || !isNum(qty) || qty < 0) return false;
  wput('pantry', { ...cur, quantity: qty, source: 'counted', as_of: today() });
  wput('pantryEvents', { key: uid(), date: today(), ts: Date.now(), item_id: id, name: line?.name ?? id, kind: 'recount', amount: qty, unit: line?.unit ?? null, prev: cur.quantity, sig: cur.baseSig });
  return true;
}
export function bought(id, qty) {
  const cur = pantryState(id); const line = pantryLine(id);
  if (!cur || !isNum(qty) || qty <= 0) return false;
  wput('pantry', { ...cur, quantity: round3(cur.quantity + qty), source: 'calculated', as_of: today() });
  wput('pantryEvents', { key: uid(), date: today(), ts: Date.now(), item_id: id, name: line?.name ?? id, kind: 'bought', amount: qty, unit: line?.unit ?? null, sig: cur.baseSig });
  return true;
}
// Deleting a purchase takes its amount back off. A recount cannot be undone (the old
// number was replaced by a measurement), so deleting one only removes the log entry.
export function deletePantryEvent(key) {
  const ev = store.get('pantryEvents', key);
  if (!ev) return;
  if (ev.kind === 'bought') {
    const cur = pantryState(ev.item_id);
    if (cur && (!ev.sig || cur.baseSig === ev.sig)) wput('pantry', { ...cur, quantity: round3(cur.quantity - ev.amount), source: 'calculated', as_of: today() });
  }
  store.del('pantryEvents', key);
}
export const pantryEvents = (id) => store.values('pantryEvents').filter((e) => !id || e.item_id === id).sort((a, b) => b.ts - a.ts);

// planned grams per item from today (unticked meals only) to the end of the cycle
export function remainingPlan() {
  return cached('remainingPlan', () => {
    const t = today();
    const end = C.end || C.dates[C.dates.length - 1] || null;
    const days = end && end >= t ? dateRange(t, end) : [];
    const need = new Map(); const untracked = new Set();
    for (const date of days) {
      for (const slot of C.mealSlots(date)) {
        if (date === t && tick(date, slot)) continue; // already eaten and subtracted
        (slot.items || []).forEach((it) => {
          if (!isNum(it?.grams)) return;
          if (!it.item_id) { untracked.add(it.name); return; }
          const n = need.get(it.item_id) || { name: it.name, grams: 0 };
          n.grams += it.grams; need.set(it.item_id, n);
        });
      }
    }
    return { from: t, to: end, days: days.length, need, untracked: [...untracked] };
  });
}

// Each pantry line: what you have now against what the rest of the cycle's plan needs (same unit)
export function pantryBoard() {
  return cached('pantryBoard', () => {
    const plan = remainingPlan();
    return C.pantry.map((line) => {
      const st = pantryState(line.item_id);
      const row = { id: line.item_id, name: line.name ?? line.item_id, unit: line.unit, quantity: st?.quantity ?? null, source: st?.source ?? null, as_of: st?.as_of ?? null, line };
      const planned = plan.need.get(line.item_id)?.grams || 0;
      row.plannedG = planned; row.remainingDays = plan.days;
      if (!planned || !plan.days) { row.noUse = true; return row; }
      const need = gramsToUnit(line, planned);
      if (need == null) { row.noConversion = true; return row; }
      row.need = need;
      row.short = isNum(row.quantity) && row.quantity < need - 1e-9;
      return row;
    });
  });
}

export function shoppingList() {
  return cached('shopping', () => {
    const plan = remainingPlan();
    const rows = [];
    for (const [id, n] of plan.need) {
      const line = pantryLine(id); const cur = pantryState(id);
      if (!line || !cur) { rows.push({ id, name: n.name, grams: n.grams, notInPantry: true }); continue; }
      const needUnits = gramsToUnit(line, n.grams);
      if (needUnits == null) { rows.push({ id, name: line.name, grams: n.grams, unit: line.unit, noConversion: true, basis: cur.source, as_of: cur.as_of }); continue; }
      const deficit = needUnits - cur.quantity;
      if (deficit > 1e-9) rows.push({ id, name: line.name, need: needUnits, have: cur.quantity, deficit, unit: line.unit, basis: cur.source, as_of: cur.as_of });
    }
    return { rows, untracked: plan.untracked, days: plan.days, from: plan.from, to: plan.to };
  });
}

// ======================================================================
// TRAINING
// ======================================================================
// Keys use the card's position in that day's session, so the same exercise listed twice has separate sets.
// (Old keys were `${date}|${exId}|${i}`; migratePositionKeys moves them. History always groups by the `ex` id on the record.)
export const setKeyOf = (date, ex, i) => `${date}|@${ex.pos ?? 0}|${i}`;
const exlogKeyOf = (date, ex) => `${date}|@${ex.pos ?? 0}`;
export const setRec = (date, ex, i) => store.get('sets', setKeyOf(date, ex, i));
const muscleFor = (ex) => ex.muscle ?? C?.muscleOf.get(exKey(ex)) ?? null;

function baseSet(date, ex, i) {
  return setRec(date, ex, i) || { key: setKeyOf(date, ex, i), date, pos: ex.pos ?? 0, ex: exKey(ex), name: ex.name, muscle: muscleFor(ex), idx: i, done: false, reps: null, load: null, ts: 0 };
}
export function setDraft(date, ex, i, field, value) {
  const r = { ...baseSet(date, ex, i) };
  r[field] = isNum(value) && value >= 0 ? value : null;
  wput('sets', r);
}
// tick/untick one set with the reps & kg shown in its boxes
export function toggleSet(date, ex, i, typed = {}) {
  const r = { ...baseSet(date, ex, i) };
  r.done = !r.done;
  if (r.done) {
    const pf = prefill(date, ex, i);
    r.reps = isNum(typed.reps) ? typed.reps : isNum(r.reps) ? r.reps : pf.reps;
    r.load = isNum(typed.load) ? typed.load : isNum(r.load) ? r.load : pf.load;
    r.muscle = muscleFor(ex);
    r.name = ex.name;
    r.ts = Date.now();
  }
  wput('sets', r);
  progress(date);
  return r.done;
}
export function editSet(key, { reps, load }) {
  const r = store.get('sets', key); if (!r) return;
  wput('sets', { ...r, reps: isNum(reps) && reps >= 0 ? reps : null, load: isNum(load) && load >= 0 ? load : null });
}
export function deleteSet(key) {
  const r = store.get('sets', key); if (!r) return;
  store.del('sets', key);
  progress(r.date);
}
// sets logged with an older cycle (or migrated) get their muscle group once the cycle names it
export function backfillMuscles() {
  for (const r of store.values('sets')) {
    if (r.muscle) continue;
    const m = C.muscleOf.get(r.ex);
    if (m) wput('sets', { ...r, muscle: m });
  }
}

const normSet = (r) => ({ key: r.key, date: r.date, ex: r.ex, name: r.name || r.ex, muscle: r.muscle || UNGROUPED, idx: r.idx, reps: isNum(r.reps) ? r.reps : null, load: isNum(r.load) ? r.load : null, ts: r.ts || 0 });
const sortSets = (arr) => arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts || a.idx - b.idx));
// every set you ticked, oldest first
export function loggedSets() {
  return cached('loggedSets', () => sortSets(store.values('sets').filter((r) => r.done).map(normSet)));
}
export const volumeOf = (s) => (isNum(s.reps) && isNum(s.load) && s.load > 0 ? s.reps * s.load : null);
// Epley: load × (1 + reps / 30), only for sets of 1 to 10 reps. Always shown as an estimate.
export const e1rm = (load, reps) => (isNum(load) && load > 0 && isNum(reps) && reps >= 1 && reps <= 10 ? load * (1 + reps / 30) : null);

// PRs: a set's load beats the best load logged for that exercise on any EARLIER date.
function computePrs(list) {
  const best = new Map(); const hits = []; const ids = new Set();
  let i = 0;
  while (i < list.length) {
    const date = list[i].date; const group = [];
    while (i < list.length && list[i].date === date) group.push(list[i++]);
    const dayMax = new Map();
    for (const s of group) {
      if (!isNum(s.load) || s.load <= 0) continue;
      const prev = best.get(s.ex);
      if (prev != null && s.load > prev) {
        ids.add(s.key);
        const h = hits.find((x) => x.date === date && x.ex === s.ex);
        if (!h) hits.push({ date, ex: s.ex, name: s.name, load: s.load, prev });
        else if (s.load > h.load) h.load = s.load;
      }
      dayMax.set(s.ex, Math.max(dayMax.get(s.ex) ?? -Infinity, s.load));
    }
    for (const [ex, v] of dayMax) best.set(ex, Math.max(best.get(ex) ?? -Infinity, v));
  }
  return { hits, ids };
}
export const prs = () => cached('prs', () => computePrs(loggedSets()));

const setsByEx = () => cached('setsByEx', () => {
  const m = new Map();
  for (const s of loggedSets()) { if (!m.has(s.ex)) m.set(s.ex, []); m.get(s.ex).push(s); }
  return m;
});
// "last: X kg × R": the last set of that exercise logged on an earlier date
export function lastLogged(date, ex) {
  const list = setsByEx().get(exKey(ex)) || [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].date < date) return list[i];
  return null;
}
// reps/kg boxes: your most recent logged set of that exercise (earlier today included), else the plan
export function prefill(date, ex, i) {
  const key = setKeyOf(date, ex, i);
  const list = setsByEx().get(exKey(ex)) || [];
  for (let k = list.length - 1; k >= 0; k--) {
    const s = list[k];
    if (s.key === key || s.date > date) continue;
    return { reps: s.reps ?? (isNum(ex.reps) ? ex.reps : null), load: s.load, from: 'history' };
  }
  return { reps: isNum(ex.reps) ? ex.reps : null, load: isNum(ex.load_kg) ? ex.load_kg : null, from: 'plan' };
}

// effort (1-10) and a note per exercise per date
export const exLog = (date, ex) => store.get('exlog', exlogKeyOf(date, ex));
function writeExLog(key, cur, patch) {
  const next = { ...cur, ...patch, ts: Date.now() };
  if (!isNum(next.effort) && !String(next.note || '').trim()) store.del('exlog', key);
  else wput('exlog', next);
}
export function setExLog(date, ex, patch) {
  const key = exlogKeyOf(date, ex);
  writeExLog(key, store.get('exlog', key) || { key, date, pos: ex.pos ?? 0, ex: exKey(ex), name: ex.name, effort: null, note: '' }, patch);
}
export function editExLog(key, patch) { const cur = store.get('exlog', key); if (cur) writeExLog(key, cur, patch); }
// effort and notes for one exercise id on a date, across all its cards (last effort written wins; notes joined)
export function exLogFor(date, id) {
  const rows = store.values('exlog').filter((r) => r.date === date && r.ex === id).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  if (!rows.length) return null;
  const eff = rows.filter((r) => isNum(r.effort)).pop();
  return { effort: eff ? eff.effort : null, note: rows.map((r) => String(r.note || '').trim()).filter(Boolean).join(' · ') };
}

// One-time, re-runnable: move old `date|exId|i` sets and `date|exId` exlog rows to the FIRST card with that
// exercise id in that date's session. A row with no matching card keeps its old key and its data.
const OLD_KEY = (k) => !/^\d{4}-\d\d-\d\d\|@/.test(String(k));
export function migratePositionKeys() {
  const out = { sets: 0, exlog: 0, unmatched: 0 };
  if (!C || C.isExample) return out;
  const firstPos = (date, id) => { const ses = C.session(date); const c = ses?.exercises?.find((e) => exKey(e) === id); return c ? c.pos : null; };
  for (const r of store.values('sets')) {
    if (!OLD_KEY(r.key)) continue;
    const pos = firstPos(r.date, r.ex);
    if (pos == null) { out.unmatched++; continue; }
    let idx = Number.isInteger(r.idx) ? r.idx : Number(String(r.key).split('|').pop());
    let key = `${r.date}|@${pos}|${idx}`;
    if (store.get('sets', key)) { // slot already taken by newer data: keep both, never overwrite
      const used = store.values('sets').filter((x) => x.date === r.date && x.pos === pos).map((x) => x.idx);
      idx = Math.max(-1, ...used) + 1; key = `${r.date}|@${pos}|${idx}`;
    }
    store.del('sets', r.key);
    wput('sets', { ...r, key, pos, idx });
    out.sets++;
  }
  for (const r of store.values('exlog')) {
    if (!OLD_KEY(r.key)) continue;
    const pos = firstPos(r.date, r.ex);
    if (pos == null) { out.unmatched++; continue; }
    const key = `${r.date}|@${pos}`;
    const cur = store.get('exlog', key);
    const note = [cur?.note, r.note].map((n) => String(n || '').trim()).filter(Boolean).join(' · ');
    store.del('exlog', r.key);
    wput('exlog', cur ? { ...cur, effort: isNum(cur.effort) ? cur.effort : r.effort ?? null, note } : { ...r, key, pos });
    out.exlog++;
  }
  return out;
}
export function deleteExLog(key) { store.del('exlog', key); }

export function sessionProgress(date) {
  const ses = C.session(date);
  if (!ses) return null;
  if (ses.kind === 'run') return { planned: 1, done: runRec(date) ? 1 : 0, kind: 'run' };
  let planned = 0, done = 0;
  for (const ex of ses.exercises) {
    planned += ex.sets;
    for (let i = 0; i < ex.sets; i++) if (setRec(date, ex, i)?.done) done++;
  }
  return { planned, done, kind: 'lift' };
}

export function sessionSummary(date) {
  const sets = loggedSets().filter((s) => s.date === date);
  const vols = sets.map(volumeOf).filter(isNum);
  const sp = sessionProgress(date);
  const volume = vols.length ? sum(vols) : null;
  const byEx = new Map();
  for (const x of sets) { const v = volumeOf(x); if (v == null) continue; const e = byEx.get(x.ex) || { name: x.name, volume: 0 }; e.volume += v; byEx.set(x.ex, e); }
  return { volume, setsDone: sets.length, setsPlanned: sp?.planned ?? null, prs: prs().hits.filter((h) => h.date === date), fun: funLine(volume, date), byEx: [...byEx.values()] };
}

// one comparison from fun_equivalents, rotating by date
export function funLine(kg, date = today(), offset = 0) {
  const list = C?.funEq;
  if (!list || !list.length || !isNum(kg) || kg <= 0) return null;
  const f = list[(Math.abs(daysBetween('2000-01-01', date)) + offset) % list.length];
  return { ...f, count: kg / f.kg };
}

export function exercisesLogged() {
  return cached('exList', () => {
    const m = new Map();
    for (const s of loggedSets()) { const e = m.get(s.ex) || { ex: s.ex, name: s.name, sets: 0, last: s.date }; e.sets++; e.last = s.date; e.name = s.name; m.set(s.ex, e); }
    return [...m.values()].sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : b.sets - a.sets));
  });
}

// everything about one exercise, for its detail sheet
export function exerciseDetail(key) {
  return cached(`exd:${key}`, () => {
    const list = setsByEx().get(key) || [];
    const prIds = prs().ids;
    const byDate = new Map();
    for (const s of list) {
      if (!byDate.has(s.date)) byDate.set(s.date, { date: s.date, sets: [], maxLoad: null, bestE1rm: null, pr: false });
      const d = byDate.get(s.date);
      const e = e1rm(s.load, s.reps);
      d.sets.push({ ...s, pr: prIds.has(s.key), e1rm: e });
      if (isNum(s.load) && s.load > 0) d.maxLoad = Math.max(d.maxLoad ?? -Infinity, s.load);
      if (e != null) d.bestE1rm = Math.max(d.bestE1rm ?? -Infinity, e);
      if (prIds.has(s.key)) d.pr = true;
    }
    for (const d of byDate.values()) {
      const xl = exLogFor(d.date, key);
      d.effort = isNum(xl?.effort) ? xl.effort : null; d.note = xl?.note || '';
    }
    let best = null;
    for (const s of list) {
      if (!isNum(s.load) || s.load <= 0) continue;
      if (!best || s.load > best.load || (s.load === best.load && (s.reps ?? 0) > (best.reps ?? 0))) best = s;
    }
    return { key, name: list[list.length - 1]?.name ?? key, days: [...byDate.values()], best, setCount: list.length };
  });
}


// ======================================================================
// LEFTOVER EXAMPLE DATA
// ======================================================================
// Before a real cycle was imported the built-in example left records behind. Delete only records carrying an
// example marker (item_id "ex_*", meal title "Example*", exercise id "example-*"), then rebuild the days rollup and
// badges from what remains. Never touches bodyweight or anything unmarked. Safe to re-run (second run removes nothing).
const isExItem = (id) => typeof id === 'string' && id.startsWith('ex_');
const isExMeal = (m) => (Array.isArray(m.items) && m.items.some((i) => isExItem(i?.item_id))) || (typeof m.title === 'string' && m.title.startsWith('Example'));
const isExEx = (r) => typeof r.ex === 'string' && r.ex.startsWith('example-');
export function cleanExampleData() {
  const out = { meals: [], sets: [], exlog: [], pantry: [], pantryEvents: [], days: [], daysRecomputed: 0, badgesRebuilt: false };
  if (!C || C.isExample) return out;
  const drop = (coll, test, list) => { for (const r of store.values(coll)) if (test(r)) { list.push(r.key); store.del(coll, r.key); } };
  drop('meals', isExMeal, out.meals);
  for (const k of out.meals) store.del('grams', k); // typed grams for a deleted example meal
  drop('sets', isExEx, out.sets);
  drop('exlog', isExEx, out.exlog);
  drop('pantry', (r) => isExItem(r.key), out.pantry);
  drop('pantryEvents', (r) => isExItem(r.item_id), out.pantryEvents);
  const removed = out.meals.length + out.sets.length + out.exlog.length + out.pantry.length + out.pantryEvents.length;
  if (!removed) return out;
  const hasLogs = (d) => store.values('meals').some((r) => r.date === d) || store.values('sets').some((r) => r.date === d && r.done)
    || store.values('exlog').some((r) => r.date === d) || store.values('runs').some((r) => r.date === d) || store.values('pantryEvents').some((r) => r.date === d);
  for (const d of store.values('days')) {
    if (C.day(d.key) || C.session(d.key)) { progress(d.key); out.daysRecomputed++; }
    else if (!hasLogs(d.key)) { store.del('days', d.key); out.days.push(d.key); }
  }
  store.del('kv', 'badges'); updateBadges(); out.badgesRebuilt = true;
  return out;
}

// ======================================================================
// RUNS
// ======================================================================
const runKey = (date) => `${date}|run`;
export const runRec = (date) => store.get('runs', runKey(date));
export function saveRun(date, { distance_km, time_s, notes }) {
  wput('runs', { key: runKey(date), date, distance_km: isNum(distance_km) && distance_km > 0 ? distance_km : null, time_s: isNum(time_s) && time_s > 0 ? time_s : null, notes: String(notes || ''), ts: Date.now() });
  progress(date);
}
export function deleteRun(key) { const r = store.get('runs', key); if (!r) return; store.del('runs', key); progress(r.date); }
export const paceOf = (r) => (isNum(r?.distance_km) && r.distance_km > 0 && isNum(r?.time_s) ? r.time_s / r.distance_km : null);

// ======================================================================
// BODYWEIGHT
// ======================================================================
export function addBodyweight(date, kg) {
  if (!isValidDate(date) || !isNum(kg) || kg <= 0) return false;
  store.put('bodyweight', { key: date, date, kg, ts: Date.now() });
  return true;
}
export function deleteBodyweight(key) { store.del('bodyweight', key); }
export const bodyweights = () => cached('bw', () => store.values('bodyweight').filter((b) => isValidDate(b.date) && isNum(b.kg)).sort((a, b) => (a.date < b.date ? -1 : 1)));
export function latestBodyweight() { const b = bodyweights(); return b.length ? b[b.length - 1] : null; }
// straight path from bodyweight_start_kg on start_date to bodyweight_target_kg on end_date
export function targetPath() {
  if (!C.start || !C.end || C.bwStart == null || C.bwTarget == null) return null;
  const span = daysBetween(C.start, C.end);
  return {
    start: C.start, end: C.end, from: C.bwStart, to: C.bwTarget,
    at(date) {
      if (date < C.start || date > C.end) return null;
      return span <= 0 ? C.bwStart : C.bwStart + (C.bwTarget - C.bwStart) * daysBetween(C.start, date) / span;
    },
  };
}
export function vsPath(entry) {
  const p = targetPath(); const line = p?.at(entry.date);
  if (line == null) return null;
  const diff = entry.kg - line;
  return { line, diff, side: Math.abs(diff) < 0.05 ? 'on' : diff > 0 ? 'above' : 'below' };
}

// ======================================================================
// DAY PROGRESS + STREAKS
// ======================================================================
// complete = every meal slot ticked and every set (or the run) of that date's session done
export function progress(date) {
  if (C && (C.day(date) || C.session(date))) {
    const meals = C.mealSlots(date);
    let planned = meals.length, done = meals.filter((s) => tick(date, s)).length;
    const sp = sessionProgress(date);
    if (sp) { planned += sp.planned; done += sp.done; }
    const r = { planned, done, complete: planned > 0 && done >= planned };
    const cur = store.get('days', date);
    if (date <= today() && (!cur || cur.planned !== r.planned || cur.done !== r.done || cur.complete !== r.complete)) wput('days', { key: date, ...r });
    return r;
  }
  const s = store.get('days', date);
  return s ? { planned: s.planned, done: s.done, complete: !!s.complete } : { planned: 0, done: 0, complete: false };
}
export function refreshSnaps() { for (const d of C.dates) if (d <= today()) progress(d); }

function knownDates() {
  const set = new Set([...C.dates, ...store.all('days').keys()]);
  for (const d of C.sessionMap.keys()) set.add(d);
  return [...set].filter(isValidDate).sort();
}
export function streaks() {
  return cached('streaks', () => {
    const t = today();
    const dates = knownDates().filter((d) => d <= t);
    let run = 0, best = 0;
    const runs = [];
    for (const d of dates) {
      const p = progress(d);
      if (p.planned === 0) continue; // nothing planned: neither adds nor breaks
      if (p.complete) { run++; runs.push({ date: d, run }); best = Math.max(best, run); }
      else if (d !== t) run = 0;
    }
    let current = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
      const d = dates[i]; const p = progress(d);
      if (p.planned === 0) continue;
      if (p.complete) current++;
      else if (d === t) continue; // today still in progress
      else break;
    }
    return { current, best, runs, completeDays: runs.length };
  });
}

// ======================================================================
// LOGGED DATES (anything you ticked or typed)
// ======================================================================
export function logDates() {
  return cached('logDates', () => {
    const s = new Set();
    for (const r of store.values('meals')) s.add(r.date);
    for (const r of store.values('sets')) if (r.done) s.add(r.date);
    for (const r of store.values('exlog')) s.add(r.date);
    for (const r of store.values('runs')) s.add(r.date);
    for (const r of store.values('bodyweight')) s.add(r.date);
    for (const r of store.values('pantryEvents')) s.add(r.date);
    return [...s].filter(isValidDate).sort();
  });
}
export const firstLogDate = () => logDates()[0] || null;

export function entriesFor(date) {
  const sets = sortSets(store.values('sets').filter((r) => r.date === date && r.done).map(normSet));
  const byEx = new Map();
  for (const s of sets) { if (!byEx.has(s.ex)) byEx.set(s.ex, { ex: s.ex, name: s.name, sets: [] }); byEx.get(s.ex).sets.push(s); }
  return {
    ticks: ticksOn(date).slice().sort((a, b) => String(a.time).localeCompare(String(b.time))),
    exercises: [...byEx.values()],
    exlogs: store.values('exlog').filter((r) => r.date === date),
    run: runRec(date),
    bodyweight: store.get('bodyweight', date),
    pantry: store.values('pantryEvents').filter((r) => r.date === date).sort((a, b) => a.ts - b.ts),
  };
}

// ======================================================================
// ROLLUPS: per day (d:), week (w:, Monday) and month (m:), rebuilt from the raw logs
// ======================================================================
export const ROLLUP_VERSION = 2; // 2: adds muscleSets (sets per muscle group)
let rollupsDirty = true;
let rebuildTimer = null;
function markRollupsDirty() {
  rollupsDirty = true;
  if (store.kv('rollupsDirty') !== true) store.setKv('rollupsDirty', true); // survives a crash before the rebuild
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => { if (rollupsDirty) rollups(); }, 400);
}
export function initRollups() {
  rollupsDirty = store.kv('rollupsVersion') !== ROLLUP_VERSION || store.kv('rollupsDirty') !== false;
}

const blankAgg = (key, kind, start) => ({ key, kind, start, volume: 0, muscle: {}, muscleSets: {}, sets: 0, reps: 0, kcal: 0, protein: 0, meals: 0, mealDays: 0, sessions: 0, runs: 0, runKm: 0, runSec: 0, prs: 0 });
const r3 = (o) => { for (const k of ['volume', 'kcal', 'protein', 'runKm']) o[k] = round3(o[k]); for (const g of Object.keys(o.muscle)) o.muscle[g] = round3(o.muscle[g]); return o; };

// Pure: raw records in, rollup records out (sorted by key). Builds the stored rollups and verifies them.
export function computeRollups({ sets = [], meals = [], runs = [] }) {
  const days = new Map();
  const day = (date) => { if (!days.has(date)) days.set(date, blankAgg(`d:${date}`, 'd', date)); return days.get(date); };
  const done = sortSets(sets.filter((r) => r.done && isValidDate(r.date)).map(normSet));
  for (const s of done) {
    const d = day(s.date); d.sets++;
    d.muscleSets[s.muscle] = (d.muscleSets[s.muscle] || 0) + 1;
    if (isNum(s.reps)) d.reps += s.reps;
    const v = volumeOf(s);
    if (v != null) { d.volume += v; d.muscle[s.muscle] = (d.muscle[s.muscle] || 0) + v; }
  }
  for (const h of computePrs(done).hits) day(h.date).prs++;
  for (const m of meals) {
    if (m.type !== 'meal' || !isValidDate(m.date)) continue;
    const d = day(m.date); d.meals++;
    if (isNum(m.kcal)) d.kcal += m.kcal;
    if (isNum(m.protein)) d.protein += m.protein;
  }
  for (const r of runs) {
    if (!isValidDate(r.date)) continue;
    const d = day(r.date); d.runs++;
    if (isNum(r.distance_km)) d.runKm += r.distance_km;
    if (isNum(r.time_s)) d.runSec += r.time_s;
  }
  const groups = new Map();
  const add = (key, kind, start, d) => {
    if (!groups.has(key)) groups.set(key, blankAgg(key, kind, start));
    const g = groups.get(key);
    for (const k of ['volume', 'sets', 'reps', 'kcal', 'protein', 'meals', 'runs', 'runKm', 'runSec', 'prs']) g[k] += d[k];
    for (const [m, v] of Object.entries(d.muscle)) g.muscle[m] = (g.muscle[m] || 0) + v;
    for (const [m, v] of Object.entries(d.muscleSets)) g.muscleSets[m] = (g.muscleSets[m] || 0) + v;
    if (d.meals > 0) g.mealDays++;
    if (d.sets > 0) g.sessions++;
  };
  for (const d of [...days.values()].sort((a, b) => (a.start < b.start ? -1 : 1))) {
    d.mealDays = d.meals > 0 ? 1 : 0; d.sessions = d.sets > 0 ? 1 : 0;
    const ws = weekStart(d.start), mk = monthKey(d.start);
    add(`w:${ws}`, 'w', ws, d);
    add(`m:${mk}`, 'm', monthStart(mk), d);
  }
  return [...days.values(), ...groups.values()].map(r3).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function rollups() {
  if (rollupsDirty) {
    const recs = computeRollups({ sets: store.values('sets'), meals: store.values('meals'), runs: store.values('runs') });
    store.replaceAll('rollups', recs);
    rollupsDirty = false;
    if (store.kv('rollupsVersion') !== ROLLUP_VERSION) store.setKv('rollupsVersion', ROLLUP_VERSION);
    if (store.kv('rollupsDirty') !== false) store.setKv('rollupsDirty', false);
  }
  return store.all('rollups');
}
export const rollup = (key) => rollups().get(key) || null;

// ======================================================================
// INSIGHTS
// ======================================================================
export const RANGES = ['2W', '1M', '3M', '6M', 'All'];
export function rangeBounds(id) {
  const to = today();
  let from;
  if (id === '2W') from = addDays(to, -13);
  else if (id === '1M') from = addDays(addMonths(to, -1), 1);
  else if (id === '3M') from = addDays(addMonths(to, -3), 1);
  else if (id === '6M') from = addDays(addMonths(to, -6), 1);
  else from = firstLogDate() && firstLogDate() < to ? firstLogDate() : to;
  return { id, from, to };
}
const daysIn = (from, to) => [...rollups().values()].filter((r) => r.kind === 'd' && r.start >= from && r.start <= to).sort((a, b) => (a.start < b.start ? -1 : 1));

export function liftedIn(from, to) {
  const d = daysIn(from, to).filter((r) => r.sets > 0);
  return d.length ? { volume: sum(d.map((r) => r.volume)), sets: sum(d.map((r) => r.sets)), sessions: d.length, prs: sum(d.map((r) => r.prs)) } : null;
}
export function weeksIn(from, to) {
  const out = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}
export function weeklyMuscle(from, to) {
  const weeks = weeksIn(from, to).map((w) => ({ week: w, r: rollup(`w:${w}`) }));
  const totals = new Map();
  for (const { r } of weeks) for (const [m, v] of Object.entries(r?.muscle || {})) totals.set(m, (totals.get(m) || 0) + v);
  const groups = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  return { weeks: weeks.map(({ week, r }) => ({ week, muscle: r?.muscle || {}, muscleSets: r?.muscleSets || {}, volume: r?.volume || 0, sets: r?.sets || 0 })), groups, totals, priority: C.priorityMuscle };
}
// sets and kg per muscle group for the week (Monday to Sunday) containing `date`; the priority group's headline uses this
export function thisWeekMuscle(date = today()) {
  const r = rollup(`w:${weekStart(date)}`);
  const sets = r?.muscleSets || {};
  const totalSets = sum(Object.values(sets));
  const pr = C?.priorityMuscle ?? null;
  const prSets = pr ? sets[pr] || 0 : null;
  return { week: weekStart(date), priority: pr, sets, totalSets, prSets, prShare: pr && totalSets ? prSets / totalSets : null, prKg: pr ? r?.muscle?.[pr] || 0 : null, totalKg: r?.volume || 0 };
}
// kg cannot be compared across groups, so the headline is SETS this week; kg comes second
export function weekHeadline(w) {
  if (w.priority) return `${fmtNum(w.prSets)} sets <small>${esc(w.priority)} this week${w.prShare != null ? `, ${Math.round(w.prShare * 100)}% of all sets` : ''} · ${fmtNum(w.prKg)} kg</small>`;
  return `${fmtNum(w.totalSets)} sets <small>all groups this week · ${fmtNum(w.totalKg)} kg</small>`;
}
export const exerciseTrend = (key, from, to) => exerciseDetail(key).days.filter((d) => d.date >= from && d.date <= to);
export function nutritionIn(from, to) {
  return daysIn(from, to).filter((r) => r.meals > 0).map((r) => ({ date: r.start, kcal: r.kcal, protein: r.protein }));
}
export function runsByWeek(from, to) {
  return weeksIn(from, to).map((w) => { const r = rollup(`w:${w}`); return { week: w, km: r?.runKm || 0, runs: r?.runs || 0 }; });
}
export function setsByWeek(from, to) {
  return weeksIn(from, to).map((w) => { const r = rollup(`w:${w}`); return { week: w, sets: r?.sets || 0, reps: r?.reps || 0 }; });
}
// Plan followed. Past days count every planned item; today counts items already ticked or whose time has passed;
// future items never count. `at` = { date, minutes } (minutes since midnight), injectable for tests.
const nowAt = () => { const n = new Date(); return { date: today(), minutes: n.getHours() * 60 + n.getMinutes() }; };
const clockMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export function progressAt(date, at = nowAt()) {
  if (date < at.date) return progress(date);
  if (date > at.date) return { planned: 0, done: 0, complete: false };
  const passed = (t) => { const m = clockMin(t); return m != null && m <= at.minutes; };
  let planned = 0, done = 0;
  for (const s of C.mealSlots(date)) { const d = !!tick(date, s); if (d || passed(s.time)) planned++; if (d) done++; }
  const sp = sessionProgress(date);
  if (sp) {
    const gym = C.slots(date).find((x) => x.type === 'gym');
    const started = gym ? passed(gym.time) : false;
    planned += started ? sp.planned : sp.done; done += sp.done;
  }
  return { planned, done, complete: planned > 0 && done >= planned };
}
// "Day X of Y of the cycle": today's position between meta.start_date and meta.end_date (null when unknown or outside)
export function cyclePosition(date = today()) {
  if (!C?.start || !C?.end) return null;
  const of = daysBetween(C.start, C.end) + 1, day = daysBetween(C.start, date) + 1;
  return of > 0 && day >= 1 && day <= of ? { day, of } : null;
}
export function adherenceByWeek(from, to, at = nowAt()) {
  return weeksIn(from, to).map((w) => {
    let planned = 0, done = 0;
    for (const d of dateRange(w, addDays(w, 6))) {
      if (d > at.date || d < from) continue;
      const p = progressAt(d, at);
      planned += p.planned; done += p.done;
    }
    return { week: w, planned, done, pct: planned ? (done / planned) * 100 : null };
  });
}
// average effort score per date (from the effort you gave each exercise)
export function effortTrend(from, to) {
  const by = new Map();
  for (const r of store.values('exlog')) {
    if (!isNum(r.effort) || r.date < from || r.date > to) continue;
    const e = by.get(r.date) || []; e.push(r.effort); by.set(r.date, e);
  }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, arr]) => ({ date, y: sum(arr) / arr.length, n: arr.length }));
}
// Monday to Sunday of the week containing date: eaten kcal and protein per day (null when no meal ticked)
export function weekNutrition(date) {
  const from = weekStart(date);
  return dateRange(from, addDays(from, 6)).map((d) => { const r = rollup(`d:${d}`); return { date: d, kcal: r && r.meals ? r.kcal : null, protein: r && r.meals ? r.protein : null }; });
}
// heaviest set per session for the last n sessions of an exercise (sparkline)
export function recentLoads(ex, n = 8) {
  return exerciseDetail(exKey(ex)).days.filter((d) => d.maxLoad != null).slice(-n).map((d) => d.maxLoad);
}
export function dayStatus(date) {
  const r = rollup(`d:${date}`);
  const p = progress(date);
  return { trained: !!r && (r.sets > 0 || r.runs > 0), complete: p.complete, planned: p.planned > 0 };
}

export function monthReview(mk) {
  const r = rollup(`m:${mk}`);
  const bw = bodyweights().filter((b) => monthKey(b.date) === mk);
  const runs = store.values('runs').filter((x) => monthKey(x.date) === mk);
  return {
    month: mk,
    sessions: r && r.sessions > 0 ? r.sessions : null,
    volume: r && r.sets > 0 ? r.volume : null,
    prs: r && r.sets > 0 ? r.prs : null,
    bwChange: bw.length >= 2 ? { from: bw[0], to: bw[bw.length - 1], diff: bw[bw.length - 1].kg - bw[0].kg } : null,
    bwCount: bw.length,
    kcalAvg: r && r.mealDays ? r.kcal / r.mealDays : null,
    proteinAvg: r && r.mealDays ? r.protein / r.mealDays : null,
    mealDays: r?.mealDays || 0,
    runs: runs.length ? { count: runs.length, km: sum(runs.map((x) => x.distance_km).filter(isNum)), withDistance: runs.filter((x) => isNum(x.distance_km)).length } : null,
  };
}
export function monthsWithData() {
  const s = new Set(logDates().map(monthKey)); s.add(monthKey(today()));
  return [...s].sort().reverse();
}

export function funStats() {
  return cached('fun', () => {
    const sets = loggedSets();
    const vols = sets.map(volumeOf).filter(isNum);
    const out = {
      total: vols.length ? sum(vols) : null,
      setsCount: sets.length || null,
      repsCount: sets.some((s) => isNum(s.reps)) ? sum(sets.map((s) => s.reps).filter(isNum)) : null,
      heaviestSet: null, heaviestDay: null, mostTrained: null, biggestJump: null,
    };
    for (const s of sets) {
      const v = volumeOf(s);
      if (v != null && (!out.heaviestSet || v > out.heaviestSet.volume)) out.heaviestSet = { volume: v, reps: s.reps, load: s.load, name: s.name, date: s.date };
    }
    for (const r of rollups().values()) if (r.kind === 'd' && r.volume > 0 && (!out.heaviestDay || r.volume > out.heaviestDay.volume)) out.heaviestDay = { date: r.start, volume: r.volume };
    const counts = new Map();
    for (const s of sets) { const c = counts.get(s.ex) || { name: s.name, n: 0 }; c.n++; counts.set(s.ex, c); }
    for (const c of counts.values()) if (!out.mostTrained || c.n > out.mostTrained.n) out.mostTrained = c;
    // biggest load jump: heaviest set on the first logged day vs heaviest set on the latest day, per exercise
    const fl = new Map();
    for (const s of sets) {
      if (!isNum(s.load) || s.load <= 0) continue;
      const f = fl.get(s.ex);
      if (!f) fl.set(s.ex, { name: s.name, first: s.load, firstDate: s.date, last: s.load, lastDate: s.date });
      else if (s.date === f.firstDate) { f.first = Math.max(f.first, s.load); f.last = f.first; }
      else if (s.date === f.lastDate) f.last = Math.max(f.last, s.load);
      else { f.last = s.load; f.lastDate = s.date; }
    }
    for (const f of fl.values()) {
      if (f.firstDate === f.lastDate) continue;
      const jump = f.last - f.first;
      if (!out.biggestJump || jump > out.biggestJump.jump) out.biggestJump = { ...f, jump };
    }
    return out;
  });
}

// ======================================================================
// BADGES (each keeps the date it was earned)
// ======================================================================
export const BADGES = [
  { id: 'first_complete', label: 'First complete day' },
  { id: 'streak7', label: '7-day streak' },
  { id: 'first_pr', label: 'First PR' },
  { id: 'sessions10', label: '10 sessions' },
  { id: 'kg1000', label: 'First 1,000 kg lifted' },
  { id: 'days30', label: '30 logged days' },
];
export function updateBadges() {
  const b = { ...(store.kv('badges') || {}) }; const before = JSON.stringify(b);
  const sk = streaks();
  if (sk.runs[0] && !b.first_complete) b.first_complete = sk.runs[0].date;
  const r7 = sk.runs.find((r) => r.run >= 7); if (r7 && !b.streak7) b.streak7 = r7.date;
  const sets = loggedSets();
  const p = prs().hits; if (p.length && !b.first_pr) b.first_pr = p[0].date;
  const sessions = [...new Set([...sets.map((s) => `${s.date}|lift`), ...store.values('runs').map((r) => `${r.date}|run`)])].sort();
  if (sessions.length >= 10 && !b.sessions10) b.sessions10 = sessions[9].split('|')[0];
  let cum = 0;
  for (const s of sets) { const v = volumeOf(s); if (v != null) { cum += v; if (cum >= 1000 && !b.kg1000) { b.kg1000 = s.date; break; } } }
  const ld = logDates(); if (ld.length >= 30 && !b.days30) b.days30 = ld[29];
  if (JSON.stringify(b) !== before) wkv('badges', b);
  return BADGES.map((x) => ({ ...x, date: b[x.id] || null }));
}

// ======================================================================
// SUNDAY RECAP (last day of each week, Monday to Sunday)
// ======================================================================
export const isRecapDay = (date) => dow(date) === 0;
export function weekRecap(date) {
  const from = weekStart(date);
  const days = dateRange(from, date);
  const plannedDays = days.filter((d) => progress(d).planned > 0);
  const r = rollup(`w:${from}`);
  return {
    from, to: date,
    completed: plannedDays.filter((d) => progress(d).complete).length, plannedDays: plannedDays.length,
    kcalAvg: r && r.mealDays ? r.kcal / r.mealDays : null,
    proteinAvg: r && r.mealDays ? r.protein / r.mealDays : null,
    mealDays: r?.mealDays || 0,
    sessions: r ? r.sessions + r.runs : null,
    volume: r && r.sets > 0 ? r.volume : null,
    prs: r && r.sets > 0 ? r.prs : null,
  };
}

// ======================================================================
// CELEBRATIONS (once per date)
// ======================================================================
export function celebrateOnce(date, kind) {
  const c = { ...(store.kv('celebrated') || {}) };
  const d = { ...(c[date] || {}) };
  if (d[kind]) return false;
  d[kind] = true; c[date] = d;
  wkv('celebrated', c);
  return true;
}

// ======================================================================
// BACKUP REMINDER: hidden with nothing logged; neutral up to 7 days, warm after 7
// ======================================================================
export function backupStatus(now = today()) {
  const first = firstLogDate();
  if (!first) return null;
  const last = store.kv('lastBackup');
  const lastDate = typeof last === 'string' && isValidDate(last.slice(0, 10)) ? last.slice(0, 10) : null;
  const days = Math.max(0, daysBetween(lastDate || first, now));
  return { never: !lastDate, days, warm: days > 7, lastDate, first };
}

// ======================================================================
// EXPORT FOR CLAUDE (plain text)
// ======================================================================
export const EXPORT_RANGES = [['7d', 'Last 7 days'], ['cycle', 'This cycle'], ['30d', 'Last 30 days']];
export function exportRange(id) {
  const t = today();
  if (id === 'cycle' && C.start && C.end) return { from: C.start, to: C.end < t ? C.end : t };
  if (id === '30d') return { from: addDays(t, -29), to: t };
  return { from: addDays(t, -6), to: t };
}
export function exportText(id = '7d') {
  const { from, to } = exportRange(id);
  const L = []; const nl = (s = '') => L.push(s);
  const NL = 'not logged';
  nl(`Daily Dash export, ${EXPORT_RANGES.find((r) => r[0] === id)?.[1] ?? id}: ${from} to ${to}`);
  nl(`Cycle: ${C.name ?? 'meta.cycle_name missing'}${C.start && C.end ? ` (${C.start} to ${C.end})` : ''}`);
  nl(`Targets: ${C.kcalTarget != null ? fmtNum(C.kcalTarget) + ' kcal' : 'kcal target missing'}, ${C.proteinTarget != null ? fmtNum(C.proteinTarget) + ' g protein' : 'protein target missing'}`);
  nl();
  const prIds = prs().ids;
  for (const d of dateRange(from, to)) {
    const p = progress(d);
    nl(`== ${d} ${fmtDow(d, true)}${p.planned ? ` (${p.done}/${p.planned} planned items done${p.complete ? ', complete' : ''})` : ''} ==`);
    const seen = new Set();
    for (const s of C.mealSlots(d)) {
      const t = tick(d, s); seen.add(tickKey(d, s));
      nl(`${s.time ?? ''} ${s.title ?? 'meal'}`);
      nl(`  planned: ${(s.items || []).map((i) => `${i?.name} ${isNum(i?.grams) ? fmtKg(i.grams) + ' g' : '? g'}`).join(', ') || 'none'}`);
      nl(`  eaten:   ${t ? t.items.map((i) => `${i.name} ${isNum(i.eaten_g) ? fmtKg(i.eaten_g) + ' g' : '? g'}`).join(', ') : 'not ticked'}`);
    }
    for (const t of ticksOn(d)) {
      if (seen.has(t.key)) continue;
      nl(`${t.time ?? ''} ${t.title ?? t.type} [${t.type}] done${t.type === 'meal' ? `: ${t.items.map((i) => `${i.name} ${fmtKg(i.eaten_g)} g`).join(', ')}` : ''}`);
    }
    const e = eaten(d);
    nl(`  eaten total: ${e.meals ? `${fmtNum(e.kcal)} kcal, ${fmtNum(e.protein, 1)} g protein${e.partial ? ' (some items had no numbers)' : ''}` : NL}`);
    const ent = entriesFor(d);
    for (const x of ent.exercises) {
      const xl = exLogFor(d, x.ex);
      nl(`  ${x.name}: ${x.sets.map((s) => `${s.reps ?? '?'} x ${s.load != null ? fmtKg(s.load) + ' kg' : 'no load'}${prIds.has(s.key) ? ' (PR)' : ''}`).join(', ')}${isNum(xl?.effort) ? `; effort ${xl.effort}/10` : ''}${xl?.note ? `; note: ${xl.note}` : ''}`);
    }
    for (const xl of ent.exlogs) if (!ent.exercises.some((x) => x.ex === xl.ex)) nl(`  ${xl.name}: no sets ticked${isNum(xl.effort) ? `; effort ${xl.effort}/10` : ''}${xl.note ? `; note: ${xl.note}` : ''}`);
    const vol = rollup(`d:${d}`);
    if (vol?.sets) nl(`  training volume: ${fmtNum(vol.volume, 1)} kg`);
    if (ent.run) nl(`  run: ${isNum(ent.run.distance_km) ? fmtKg(ent.run.distance_km) + ' km' : 'distance not logged'}, ${isNum(ent.run.time_s) ? fmtClock(ent.run.time_s) : 'time not logged'}${paceOf(ent.run) ? `, pace ${fmtPace(paceOf(ent.run))}` : ''}${ent.run.notes ? `; notes: ${ent.run.notes}` : ''}`);
    if (ent.bodyweight) { const v = vsPath(ent.bodyweight); nl(`  bodyweight: ${fmtKg(ent.bodyweight.kg)} kg${v ? ` (${v.side} target path ${fmtNum(v.line, 1)} kg)` : ''}`); }
    for (const pe of ent.pantry) nl(`  pantry ${pe.kind}: ${pe.name} ${fmtKg(pe.amount)} ${pe.unit ?? ''}`);
  }
  nl();
  nl('== Pantry now ==');
  for (const r of pantryBoard()) {
    nl(`${r.name}: ${isNum(r.quantity) ? fmtKg(r.quantity) : '?'} ${r.unit}, ${r.source ?? 'unknown'}${r.as_of ? ' ' + r.as_of : ''}${r.noUse ? ', no planned use' : r.noConversion ? ', needs grams_per_unit to compare' : `, rest of cycle needs ${fmtKg(r.need)} ${r.unit}`}`);
  }
  const sh = shoppingList();
  nl(sh.rows.length ? `Shopping: ${sh.rows.map((r) => (r.notInPantry ? `${r.name} ${fmtKg(r.grams)} g (not in pantry list)` : r.noConversion ? `${r.name} ${fmtKg(r.grams)} g (needs grams_per_unit)` : `${r.name} ${fmtKg(r.deficit)} ${r.unit} (based on ${r.basis})`)).join('; ')}` : 'Shopping: nothing short');
  nl();
  const sk = streaks();
  nl('== Streaks ==');
  nl(`Current streak: ${sk.current} days. Best: ${sk.best} days. Complete days: ${sk.completeDays}.`);
  const badges = updateBadges().filter((b) => b.date);
  nl(`Badges: ${badges.length ? badges.map((b) => `${b.label} (${b.date})`).join(', ') : 'none yet'}`);
  return L.join('\n');
}

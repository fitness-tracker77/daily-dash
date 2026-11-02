// All computations. Inputs are cycle.json (via Cycle) and what the user logged.
// Rule: if an input number is missing, the result is null ("not logged" / "missing"),
// never a guessed value.
import * as store from './store.js';
import { slotKey, exKey } from './data.js';
import { isNum, today, addDays, dateRange, dow, sum, round1, isValidDate, fmtDate, fmtKg, fmtNum, fmtDow, daysBetween } from './util.js';

let C = null;
export const setCycle = (c) => { C = c; };
export const cycle = () => C;
const S = () => store.get();

// ======================================================================
// MEALS
// ======================================================================
export function editedGrams(date, slot, idx) {
  const v = S().grams?.[date]?.[slotKey(slot)]?.[idx];
  return isNum(v) ? v : null;
}
export function gramsFor(date, slot, idx) {
  const e = editedGrams(date, slot, idx);
  if (e != null) return e;
  const g = slot.items?.[idx]?.grams;
  return isNum(g) ? g : null;
}
// numbers for an item scaled to the grams actually eaten
export function scaled(item, grams) {
  const ok = isNum(item?.grams) && item.grams > 0 && isNum(grams);
  return {
    kcal: ok && isNum(item.kcal) ? item.kcal * grams / item.grams : null,
    protein: ok && isNum(item.protein_g) ? item.protein_g * grams / item.grams : null,
  };
}
export function slotPlanned(slot) {
  const items = Array.isArray(slot.items) ? slot.items : [];
  const kc = items.map((i) => i?.kcal), pr = items.map((i) => i?.protein_g);
  return {
    kcal: items.length ? sum(kc.filter(isNum)) : null,
    protein: items.length ? sum(pr.filter(isNum)) : null,
    missing: kc.some((v) => !isNum(v)) || pr.some((v) => !isNum(v)),
  };
}
export const tick = (date, slot) => S().ticks?.[date]?.[slotKey(slot)] || null;

export function setTick(date, slot, on) {
  const st = S();
  const key = slotKey(slot);
  const prev = st.ticks?.[date]?.[key];
  if (prev) { reversePantry(prev); delete st.ticks[date][key]; }
  if (on) {
    const snap = { ts: Date.now(), type: slot.type, title: slot.title, time: slot.time, items: [], kcal: null, protein: null, partial: false, deducted: [] };
    if (slot.type === 'meal' && Array.isArray(slot.items)) {
      slot.items.forEach((it, i) => {
        const g = gramsFor(date, slot, i);
        const sc = scaled(it, g);
        snap.items.push({ name: it?.name, item_id: it?.item_id ?? null, planned_g: isNum(it?.grams) ? it.grams : null, eaten_g: g, kcal: sc.kcal, protein: sc.protein });
      });
      const k = snap.items.map((x) => x.kcal), p = snap.items.map((x) => x.protein);
      snap.kcal = sum(k.filter(isNum));
      snap.protein = sum(p.filter(isNum));
      snap.partial = k.some((v) => v == null) || p.some((v) => v == null);
      snap.deducted = deductPantry(date, snap.items);
    }
    store.bucket(st.ticks, date)[key] = snap;
  }
  updateSnap(date);
  store.save();
}

export function setGrams(date, slot, idx, grams) {
  const b = store.bucket(S().grams, date, slotKey(slot));
  if (isNum(grams) && grams >= 0) b[idx] = grams; else delete b[idx];
  if (tick(date, slot)) setTick(date, slot, true); // re-apply with new grams
  else store.save();
}

export function eaten(date) {
  const t = S().ticks?.[date] || {};
  const meals = Object.values(t).filter((x) => x.type === 'meal');
  return {
    kcal: meals.length ? sum(meals.map((m) => m.kcal).filter(isNum)) : 0,
    protein: meals.length ? sum(meals.map((m) => m.protein).filter(isNum)) : 0,
    partial: meals.some((m) => m.partial),
    meals: meals.length,
  };
}
export function plannedDay(date) {
  const meals = C.mealSlots(date);
  const p = meals.map(slotPlanned);
  return { kcal: meals.length ? sum(p.map((x) => x.kcal).filter(isNum)) : null, protein: meals.length ? sum(p.map((x) => x.protein).filter(isNum)) : null, missing: p.some((x) => x.missing) };
}

// ======================================================================
// PANTRY
// ======================================================================
const lineSig = (l) => `${l.quantity}|${l.unit}|${l.source}|${l.as_of}|${l.grams_per_unit ?? ''}`;

export function syncPantry() {
  const st = S();
  for (const l of C.pantry) {
    const sig = lineSig(l);
    const cur = st.pantry[l.item_id];
    if (!cur || cur.baseSig !== sig) {
      st.pantry[l.item_id] = { quantity: l.quantity, source: l.source === 'counted' ? 'counted' : 'calculated', as_of: isValidDate(l.as_of) ? l.as_of : null, baseSig: sig };
    }
  }
  store.save();
}
export const pantryLine = (id) => C.pantry.find((l) => l.item_id === id) || null;
export const pantryState = (id) => S().pantry[id] || null;

// converts grams into the pantry line's unit; null when no honest conversion exists
export function gramsToUnit(line, grams) {
  if (!isNum(grams)) return null;
  const u = String(line.unit).toLowerCase();
  if (u === 'g') return grams;
  if (u === 'kg') return grams / 1000;
  if (isNum(line.grams_per_unit) && line.grams_per_unit > 0) return grams / line.grams_per_unit;
  return null;
}

function deductPantry(date, items) {
  const out = [];
  for (const it of items) {
    if (!it.item_id) continue;
    const line = pantryLine(it.item_id); const cur = pantryState(it.item_id);
    if (!line || !cur) continue;
    const amt = gramsToUnit(line, it.eaten_g);
    if (amt == null) continue;
    cur.quantity = round3(cur.quantity - amt);
    cur.source = 'calculated';
    cur.as_of = date;
    out.push({ item_id: it.item_id, amount: amt, sig: cur.baseSig });
  }
  return out;
}
function reversePantry(snap) {
  for (const d of snap.deducted || []) {
    const cur = pantryState(d.item_id);
    if (!cur || cur.baseSig !== d.sig) continue; // a newer cycle.json count replaced this line
    cur.quantity = round3(cur.quantity + d.amount);
    cur.source = 'calculated';
  }
}
const round3 = (v) => Math.round(v * 1000) / 1000;

export function recount(id, qty) {
  const cur = pantryState(id); const line = pantryLine(id);
  if (!cur || !isNum(qty)) return;
  cur.quantity = qty; cur.source = 'counted'; cur.as_of = today();
  S().pantryEvents.push({ date: today(), ts: Date.now(), item_id: id, name: line?.name, kind: 'recount', amount: qty, unit: line?.unit });
  store.save();
}
export function bought(id, qty) {
  const cur = pantryState(id); const line = pantryLine(id);
  if (!cur || !isNum(qty)) return;
  cur.quantity = round3(cur.quantity + qty); cur.source = 'calculated'; cur.as_of = today();
  S().pantryEvents.push({ date: today(), ts: Date.now(), item_id: id, name: line?.name, kind: 'bought', amount: qty, unit: line?.unit });
  store.save();
}

// remaining days of the cycle (from today), planned grams per item minus current pantry
export function shoppingList() {
  const t = today();
  const end = C.end || C.dates[C.dates.length - 1];
  const need = new Map(); // item_id -> { name, grams }
  const untracked = new Set();
  for (const date of C.dates) {
    if (date < t || (end && date > end)) continue;
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
  const rows = [];
  for (const [id, n] of need) {
    const line = pantryLine(id); const cur = pantryState(id);
    if (!line || !cur) { rows.push({ id, name: n.name, grams: n.grams, notInPantry: true }); continue; }
    const needUnits = gramsToUnit(line, n.grams);
    if (needUnits == null) { rows.push({ id, name: line.name, grams: n.grams, unit: line.unit, noConversion: true, basis: cur.source }); continue; }
    const deficit = needUnits - cur.quantity;
    if (deficit > 1e-9) rows.push({ id, name: line.name, need: needUnits, have: cur.quantity, deficit, unit: line.unit, basis: cur.source });
  }
  return { rows, untracked: [...untracked] };
}

// ======================================================================
// TRAINING
// ======================================================================
export function setRec(date, ex, i) {
  return S().sets?.[date]?.[exKey(ex)]?.sets?.[i] || null;
}
function setBucket(date, ex) {
  const b = store.bucket(S().sets, date, exKey(ex));
  b.name = ex.name;
  b.sets = b.sets || {};
  return b;
}
export function setDraft(date, ex, i, field, value) {
  const b = setBucket(date, ex);
  const r = b.sets[i] || (b.sets[i] = { done: false });
  if (value === '' || value == null || !isNum(value)) delete r[field]; else r[field] = value;
  if (r.done) r.ts = r.ts || Date.now();
  store.save();
}
// tick/untick one set; reps & load = what was typed, else the planned numbers
export function toggleSet(date, ex, i) {
  const b = setBucket(date, ex);
  const r = b.sets[i] || (b.sets[i] = { done: false });
  r.done = !r.done;
  if (r.done) {
    if (!isNum(r.reps) && isNum(ex.reps)) r.reps = ex.reps;
    if (!isNum(r.load) && isNum(ex.load_kg)) r.load = ex.load_kg;
    r.ts = Date.now();
  }
  updateSnap(date);
  store.save();
  return r.done;
}

// every set the user ticked, oldest first
export function loggedSets() {
  const out = [];
  const all = S().sets || {};
  for (const date of Object.keys(all).sort()) {
    for (const [k, b] of Object.entries(all[date] || {})) {
      for (const [i, r] of Object.entries(b?.sets || {})) {
        if (!r?.done) continue;
        out.push({ date, ex: k, name: b.name || k, idx: Number(i), reps: isNum(r.reps) ? r.reps : null, load: isNum(r.load) ? r.load : null, ts: r.ts || 0 });
      }
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts));
  return out;
}
export const volumeOf = (s) => (isNum(s.reps) && isNum(s.load) && s.load > 0 ? s.reps * s.load : null);

// PRs: a set beats the best load logged for that exercise on an EARLIER date.
export function prs(sets = loggedSets()) {
  const best = new Map(); const hits = []; const ids = new Set();
  let i = 0;
  while (i < sets.length) {
    const date = sets[i].date; const group = [];
    while (i < sets.length && sets[i].date === date) group.push(sets[i++]);
    const dayMax = new Map(); const seen = new Set();
    for (const s of group) {
      if (!isNum(s.load) || s.load <= 0) continue;
      const prev = best.get(s.ex);
      if (prev != null && s.load > prev) {
        ids.add(`${s.date}|${s.ex}|${s.idx}`);
        if (!seen.has(s.ex)) { seen.add(s.ex); hits.push({ date, ex: s.ex, name: s.name, load: s.load, prev }); }
        else { const h = hits.find((x) => x.date === date && x.ex === s.ex); if (s.load > h.load) h.load = s.load; }
      }
      dayMax.set(s.ex, Math.max(dayMax.get(s.ex) ?? -Infinity, s.load));
    }
    for (const [ex, v] of dayMax) best.set(ex, Math.max(best.get(ex) ?? -Infinity, v));
  }
  return { hits, ids };
}

export function sessionProgress(date) {
  const ses = C.session(date);
  if (!ses) return null;
  let planned = 0, done = 0;
  for (const ex of ses.exercises) {
    planned += ex.sets;
    for (let i = 0; i < ex.sets; i++) if (setRec(date, ex, i)?.done) done++;
  }
  return { planned, done };
}

export function sessionSummary(date) {
  const sets = loggedSets().filter((s) => s.date === date);
  const vols = sets.map(volumeOf).filter(isNum);
  const sp = sessionProgress(date);
  const pr = prs().hits.filter((h) => h.date === date);
  return { volume: vols.length ? sum(vols) : null, setsDone: sp?.done ?? sets.length, setsPlanned: sp?.planned ?? null, prs: pr };
}

export function exerciseHistory(key) {
  const byDate = new Map();
  for (const s of loggedSets()) {
    if (s.ex !== key || !isNum(s.load)) continue;
    byDate.set(s.date, Math.max(byDate.get(s.date) ?? -Infinity, s.load));
  }
  return [...byDate].map(([date, load]) => ({ date, load }));
}

// ======================================================================
// FUN STATS
// ======================================================================
export function funStats() {
  const sets = loggedSets();
  const inCycle = sets.filter((s) => C.inCycle(s.date));
  const volSum = (arr) => { const v = arr.map(volumeOf).filter(isNum); return v.length ? sum(v) : null; };
  const out = {
    totalAll: volSum(sets),
    totalCycle: volSum(inCycle),
    setsCount: sets.length || null,
    repsCount: sets.some((s) => isNum(s.reps)) ? sum(sets.map((s) => s.reps).filter(isNum)) : null,
    sessions: new Set(sets.map((s) => s.date)).size || null,
    heaviestSet: null, heaviestDay: null, mostTrained: null, biggestJump: null, heaviestLoad: null, bwPct: null,
  };
  for (const s of sets) {
    const v = volumeOf(s);
    if (v != null && (!out.heaviestSet || v > out.heaviestSet.volume)) out.heaviestSet = { volume: v, reps: s.reps, load: s.load, name: s.name, date: s.date };
    if (isNum(s.load) && s.load > 0 && (!out.heaviestLoad || s.load > out.heaviestLoad.load)) out.heaviestLoad = { load: s.load, name: s.name, date: s.date };
  }
  const byDay = new Map();
  for (const s of sets) { const v = volumeOf(s); if (v != null) byDay.set(s.date, (byDay.get(s.date) || 0) + v); }
  for (const [date, v] of byDay) if (!out.heaviestDay || v > out.heaviestDay.volume) out.heaviestDay = { date, volume: v };
  const counts = new Map();
  for (const s of sets) { const c = counts.get(s.ex) || { name: s.name, n: 0 }; c.n++; counts.set(s.ex, c); }
  for (const c of counts.values()) if (!out.mostTrained || c.n > out.mostTrained.n) out.mostTrained = c;
  const firstLast = new Map();
  for (const s of sets) {
    if (!isNum(s.load) || s.load <= 0) continue;
    const f = firstLast.get(s.ex);
    if (!f) firstLast.set(s.ex, { name: s.name, first: s.load, firstDate: s.date, last: s.load, lastDate: s.date });
    else {
      // compare the heaviest set of the first logged day with the heaviest set of the latest day
      if (s.date === f.firstDate) f.first = Math.max(f.first, s.load);
      if (s.date === f.lastDate) f.last = Math.max(f.last, s.load);
      else { f.last = s.load; f.lastDate = s.date; }
    }
  }
  for (const f of firstLast.values()) {
    if (f.firstDate === f.lastDate) continue; // needs two different days
    const jump = f.last - f.first;
    if (!out.biggestJump || jump > out.biggestJump.jump) out.biggestJump = { ...f, jump };
  }
  const bw = latestBodyweight();
  if (bw && out.heaviestLoad) out.bwPct = { pct: out.heaviestLoad.load / bw.kg * 100, bw };
  return out;
}

// 3 comparison lines, rotating daily (or by offset when tapped)
export function equivalents(totalKg, offset = 0) {
  const list = C.funEq;
  if (!list || !list.length) return null;
  const startIdx = (daysBetween('2000-01-01', today()) * 3 + offset) % list.length;
  const n = Math.min(3, list.length);
  const pick = Array.from({ length: n }, (_, k) => list[(startIdx + k) % list.length]);
  return pick.map((f) => ({ ...f, count: isNum(totalKg) ? round1(totalKg / f.kg) : null }));
}

// ======================================================================
// DAY PROGRESS + STREAKS
// ======================================================================
export function progress(date) {
  if (C.day(date) || C.session(date)) {
    const meals = C.mealSlots(date);
    let planned = meals.length, done = meals.filter((s) => tick(date, s)).length;
    const sp = sessionProgress(date);
    if (sp) { planned += sp.planned; done += sp.done; }
    const r = { planned, done, complete: planned > 0 && done >= planned };
    S().daySnap[date] = r;
    return r;
  }
  return S().daySnap[date] || { planned: 0, done: 0, complete: false };
}
function updateSnap(date) { progress(date); }
export function refreshSnaps() { for (const d of C.dates) if (d <= today()) progress(d); store.save(); }

function knownDates() {
  const set = new Set([...C.dates, ...Object.keys(S().daySnap)]);
  for (const d of C.sessionMap.keys()) set.add(d);
  return [...set].filter(isValidDate).sort();
}

export function streaks() {
  const t = today();
  const dates = knownDates().filter((d) => d <= t);
  let run = 0, best = 0, bestEnd = null;
  const runs = []; // date at which each run length was reached
  for (const d of dates) {
    const p = progress(d);
    if (p.planned === 0) continue;
    if (p.complete) { run++; runs.push({ date: d, run }); if (run > best) { best = run; bestEnd = d; } }
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
  const completedThisCycle = C.dates.filter((d) => d <= t && progress(d).complete).length;
  return { current, best, bestEnd, completedThisCycle, runs };
}

// ======================================================================
// BODYWEIGHT
// ======================================================================
export function addBodyweight(date, kg) {
  const st = S();
  st.bodyweight = (st.bodyweight || []).filter((b) => b.date !== date);
  if (isNum(kg) && kg > 0) st.bodyweight.push({ date, kg, ts: Date.now() });
  st.bodyweight.sort((a, b) => (a.date < b.date ? -1 : 1));
  store.save();
}
export const bodyweights = () => (S().bodyweight || []).filter((b) => isValidDate(b.date) && isNum(b.kg));
export function latestBodyweight() { const b = bodyweights(); return b.length ? b[b.length - 1] : null; }
export function targetLine() {
  const m = C.meta;
  if (!C.start || !C.end || !isNum(m.bodyweight_start_kg) || !isNum(m.bodyweight_target_kg)) return null;
  const span = daysBetween(C.start, C.end);
  return {
    start: C.start, end: C.end, from: m.bodyweight_start_kg, to: m.bodyweight_target_kg,
    at(date) {
      if (date < C.start || date > C.end) return null;
      if (span <= 0) return m.bodyweight_start_kg;
      return m.bodyweight_start_kg + (m.bodyweight_target_kg - m.bodyweight_start_kg) * daysBetween(C.start, date) / span;
    },
  };
}

// ======================================================================
// BADGES (earned dates are kept once earned)
// ======================================================================
export const BADGES = [
  { id: 'first_complete', label: 'First complete day' },
  { id: 'streak7', label: '7-day streak' },
  { id: 'first_pr', label: 'First PR' },
  { id: 'sessions10', label: '10 sessions logged' },
  { id: 'kg1000', label: '1,000 kg lifted' },
  { id: 'bw_above3', label: '3 weigh-ins above the line' },
];
export function updateBadges() {
  const st = S(); const b = st.badges; const before = JSON.stringify(b);
  const sk = streaks();
  const firstC = sk.runs[0]; if (firstC && !b.first_complete) b.first_complete = firstC.date;
  const r7 = sk.runs.find((r) => r.run >= 7); if (r7 && !b.streak7) b.streak7 = r7.date;
  const sets = loggedSets();
  const p = prs(sets).hits; if (p.length && !b.first_pr) b.first_pr = p[0].date;
  const sessionDates = [...new Set(sets.map((s) => s.date))];
  if (sessionDates.length >= 10 && !b.sessions10) b.sessions10 = sessionDates[9];
  let cum = 0;
  for (const s of sets) { const v = volumeOf(s); if (v != null) { cum += v; if (cum >= 1000 && !b.kg1000) { b.kg1000 = s.date; break; } } }
  const tl = targetLine();
  if (tl && !b.bw_above3) {
    let n = 0;
    for (const e of bodyweights()) {
      const line = tl.at(e.date);
      if (line == null) { n = 0; continue; }
      n = e.kg > line ? n + 1 : 0;
      if (n >= 3) { b.bw_above3 = e.date; break; }
    }
  }
  if (JSON.stringify(b) !== before) store.save();
  return BADGES.map((x) => ({ ...x, date: b[x.id] || null }));
}

// ======================================================================
// WEEKLY RECAP (shows on Sundays and on the last cycle day)
// ======================================================================
export function isRecapDay(date) {
  if (!C.inCycle(date) || !C.day(date) && !C.session(date)) return false;
  return dow(date) === 0 || date === C.end;
}
export function weekRecap(date) {
  const offset = (dow(date) + 6) % 7; // days since Monday
  const monday = addDays(date, -offset);
  const days = dateRange(monday, date).filter((d) => C.inCycle(d));
  const plannedDays = days.filter((d) => progress(d).planned > 0);
  const completed = plannedDays.filter((d) => progress(d).complete).length;
  const mealDays = days.map((d) => eaten(d)).filter((e) => e.meals > 0);
  const sets = loggedSets().filter((s) => days.includes(s.date));
  const vols = sets.map(volumeOf).filter(isNum);
  const prHits = prs().hits.filter((h) => days.includes(h.date));
  return {
    from: monday, to: date,
    completed, plannedDays: plannedDays.length,
    kcalAvg: mealDays.length ? sum(mealDays.map((e) => e.kcal)) / mealDays.length : null,
    proteinAvg: mealDays.length ? sum(mealDays.map((e) => e.protein)) / mealDays.length : null,
    mealDays: mealDays.length,
    sessions: sets.length ? new Set(sets.map((s) => s.date)).size : null,
    lifted: vols.length ? sum(vols) : null,
    prs: sets.length ? prHits.length : null,
  };
}

// ======================================================================
// CELEBRATIONS (each fires once per date)
// ======================================================================
export function celebrateOnce(date, kind) {
  const c = store.bucket(S().celebrated, date);
  if (c[kind]) return false;
  c[kind] = true; store.save(); return true;
}

// ======================================================================
// EXPORT
// ======================================================================
export function exportText() {
  const st = S(); const L = [];
  const nl = (s = '') => L.push(s);
  nl(`Export — ${fmtDate(today(), { year: true })}`);
  nl(`Cycle: ${C.name ?? 'meta.cycle_name missing'}${C.start && C.end ? ` (${C.start} to ${C.end})` : ''}`);
  nl();
  const dates = [...new Set([...C.dates.filter((d) => d <= today()), ...Object.keys(st.ticks), ...Object.keys(st.sets)])].sort();
  nl('== Days: planned vs actually eaten ==');
  for (const d of dates) {
    const slots = C.slots(d).filter((s) => s.type === 'meal');
    const ticks = st.ticks[d] || {};
    const sp = C.day(d) || C.session(d) ? progress(d) : st.daySnap[d];
    nl(`${d} ${fmtDow(d, true)}${sp ? ` — ${sp.done}/${sp.planned} planned items done${sp.complete ? ' (complete)' : ''}` : ''}`);
    const seen = new Set();
    for (const s of slots) {
      const k = slotKey(s); seen.add(k);
      const t = ticks[k];
      const planned = (s.items || []).map((i) => `${i.name} ${isNum(i.grams) ? i.grams + ' g' : '? g'}`).join(', ');
      nl(`  ${s.time} ${s.title}`);
      nl(`    planned: ${planned || '—'}`);
      nl(`    eaten:   ${t ? t.items.map((i) => `${i.name} ${isNum(i.eaten_g) ? fmtKg(i.eaten_g) + ' g' : '? g'}`).join(', ') : 'not ticked'}`);
    }
    for (const [k, t] of Object.entries(ticks)) {
      if (seen.has(k)) continue;
      nl(`  ${t.time || ''} ${t.title} [${t.type}] — done${t.type === 'meal' ? `: ${t.items.map((i) => `${i.name} ${fmtKg(i.eaten_g)} g`).join(', ')}` : ''}`);
    }
    const e = eaten(d);
    if (e.meals) nl(`  eaten total: ${fmtNum(e.kcal)} kcal, ${fmtNum(e.protein, 1)} g protein${e.partial ? ' (some items had no numbers)' : ''}`);
  }
  nl();
  nl('== Training sessions (sets ticked) ==');
  const sets = loggedSets(); const prIds = prs(sets).ids;
  const byDate = new Map();
  for (const s of sets) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); }
  if (!byDate.size) nl('not logged');
  for (const [d, arr] of byDate) {
    nl(`${d}`);
    const byEx = new Map();
    for (const s of arr) { if (!byEx.has(s.name)) byEx.set(s.name, []); byEx.get(s.name).push(s); }
    for (const [name, list] of byEx) {
      nl(`  ${name}: ${list.sort((a, b) => a.idx - b.idx).map((s) => `${s.reps ?? '?'} x ${s.load != null ? fmtKg(s.load) + ' kg' : 'no load'}${prIds.has(`${s.date}|${s.ex}|${s.idx}`) ? ' (PR)' : ''}`).join(', ')}`);
    }
    const v = arr.map(volumeOf).filter(isNum);
    nl(`  volume: ${v.length ? fmtNum(sum(v), 1) + ' kg' : 'not logged'}`);
  }
  nl();
  nl('== Bodyweight ==');
  const bw = bodyweights(); const tl = targetLine();
  if (!bw.length) nl('not logged');
  for (const b of bw) {
    const line = tl?.at(b.date);
    nl(`${b.date}: ${fmtKg(b.kg)} kg${line != null ? ` (${b.kg > line ? 'above' : b.kg < line ? 'below' : 'on'} target line ${fmtNum(line, 1)} kg)` : ''}`);
  }
  nl();
  nl('== Pantry ==');
  for (const l of C.pantry) {
    const cur = pantryState(l.item_id);
    if (!cur) continue;
    nl(`${l.name}: ${fmtNum(cur.quantity, Number.isInteger(cur.quantity) ? 0 : 1)} ${l.unit} — ${cur.source}${cur.as_of ? ' ' + cur.as_of : ''}`);
  }
  nl();
  nl('== Fun stats ==');
  const f = funStats();
  const nlg = (label, v) => nl(`${label}: ${v ?? 'not logged'}`);
  nlg('Total lifted (this cycle)', f.totalCycle != null ? fmtNum(f.totalCycle, 1) + ' kg' : null);
  nlg('Total lifted (all time)', f.totalAll != null ? fmtNum(f.totalAll, 1) + ' kg' : null);
  const eq = equivalents(f.totalAll);
  if (eq && f.totalAll != null) eq.forEach((e) => nl(`  = ${fmtNum(e.count, 1)} ${e.plural} (${e.note})`));
  nlg('Heaviest single set', f.heaviestSet && `${f.heaviestSet.reps} x ${fmtKg(f.heaviestSet.load)} kg = ${fmtNum(f.heaviestSet.volume, 1)} kg (${f.heaviestSet.name}, ${f.heaviestSet.date})`);
  nlg('Heaviest day', f.heaviestDay && `${fmtNum(f.heaviestDay.volume, 1)} kg on ${f.heaviestDay.date}`);
  nlg('Total sets', f.setsCount); nlg('Total reps', f.repsCount); nlg('Sessions logged', f.sessions);
  nlg('Most-trained exercise', f.mostTrained && `${f.mostTrained.name} (${f.mostTrained.n} sets)`);
  nlg('Biggest load jump', f.biggestJump && `${f.biggestJump.name}: from ${fmtKg(f.biggestJump.first)} kg to ${fmtKg(f.biggestJump.last)} kg`);
  nlg('Heaviest load vs bodyweight', f.bwPct && `${fmtNum(f.bwPct.pct, 0)}% (${fmtKg(f.heaviestLoad.load)} kg vs ${fmtKg(f.bwPct.bw.kg)} kg)`);
  nl();
  const sk = streaks();
  nl('== Streaks ==');
  nl(`Current streak: ${sk.current} days`);
  nl(`Best streak: ${sk.best} days`);
  nl(`Completed days this cycle: ${sk.completedThisCycle}`);
  const badges = updateBadges().filter((b) => b.date);
  nl(`Badges: ${badges.length ? badges.map((b) => `${b.label} (${b.date})`).join(', ') : 'none yet'}`);
  return L.join('\n');
}

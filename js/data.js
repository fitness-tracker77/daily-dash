// Loading + validating the cycle (imported on the phone, or the built-in example). Nothing here invents a value:
// a missing field produces a warning naming it, and callers skip the number.
import { isNum, isValidDate, slug } from './util.js';
import { readImported } from './store.js';

export const SLOT_TYPES = ['meal', 'gym', 'cook', 'freezer', 'note'];

// Imported cycle (stored on the phone) if there is one, otherwise the built-in example.
// data/cycle.json is never fetched from the network.
export async function loadCycle() {
  let problem = null;
  const imp = readImported();
  if (imp) {
    try {
      const cycle = JSON.parse(imp.text);
      if (cycle && typeof cycle === 'object' && !Array.isArray(cycle)) return { cycle, source: 'imported', importedAt: imp.importedAt };
      problem = 'The imported cycle stored on this phone is not a JSON object. Showing the built-in example. Import your cycle again in Settings.';
    } catch (e) {
      problem = `The imported cycle stored on this phone is not valid JSON (${e.message}). Showing the built-in example. Import your cycle again in Settings.`;
    }
  }
  try {
    const res = await fetch('data/cycle.example.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { cycle: await res.json(), source: 'example', problem };
  } catch (e) {
    return { cycle: null, fatal: `The built-in example could not be loaded (${e.message}). Import your own cycle in Settings.`, problem };
  }
}

// Parse + validate pasted text. Never throws.
export function checkImport(text) {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false, error: 'Nothing pasted yet. Paste the full text of your cycle.json.' };
  let cycle;
  try { cycle = JSON.parse(t); } catch (e) { return { ok: false, error: `This is not valid JSON: ${e.message}. Nothing was imported. Copy the whole file and paste again.` }; }
  if (!cycle || typeof cycle !== 'object' || Array.isArray(cycle)) return { ok: false, error: 'The pasted JSON must be an object starting with {. Nothing was imported.' };
  return { ok: true, cycle, text: t, warnings: validate(cycle) };
}

// --------------------------------------------------------------------------
export function validate(c) {
  const w = [];
  const need = (cond, path, msg) => { if (!cond) w.push({ path, msg }); };
  if (!c || typeof c !== 'object') { w.push({ path: '(root)', msg: 'cycle.json is not an object.' }); return w; }

  const m = c.meta;
  need(m && typeof m === 'object', 'meta', 'Missing. Cycle name, dates and targets cannot be shown.');
  if (m && typeof m === 'object') {
    need(typeof m.cycle_name === 'string' && m.cycle_name, 'meta.cycle_name', 'Missing.');
    need(isValidDate(m.start_date), 'meta.start_date', 'Missing or not a YYYY-MM-DD date. Day X of Y and the target line are hidden.');
    need(isValidDate(m.end_date), 'meta.end_date', 'Missing or not a YYYY-MM-DD date. Day X of Y and the target line are hidden.');
    need(isNum(m.daily_kcal_target), 'meta.daily_kcal_target', 'Missing or not a number. The kcal ring has no target.');
    need(isNum(m.daily_protein_target_g), 'meta.daily_protein_target_g', 'Missing or not a number. The protein ring has no target.');
    if ('bodyweight_start_kg' in m) need(isNum(m.bodyweight_start_kg), 'meta.bodyweight_start_kg', 'Not a number. The target line is hidden.');
    if ('bodyweight_target_kg' in m) need(isNum(m.bodyweight_target_kg), 'meta.bodyweight_target_kg', 'Not a number. The target line is hidden.');
  }

  need(Array.isArray(c.days), 'days', 'Missing or not a list. No daily plan can be shown.');
  const recipes = c.recipes && typeof c.recipes === 'object' ? c.recipes : null;
  if (Array.isArray(c.days)) {
    const seen = new Set();
    c.days.forEach((d, i) => {
      const p = `days[${i}]`;
      need(isValidDate(d?.date), `${p}.date`, 'Missing or not a YYYY-MM-DD date. This day is skipped.');
      if (isValidDate(d?.date)) { need(!seen.has(d.date), `${p}.date`, `Duplicate date ${d.date}. Only the first one is used.`); seen.add(d.date); }
      need(Array.isArray(d?.slots), `${p}.slots`, 'Missing or not a list.');
      (Array.isArray(d?.slots) ? d.slots : []).forEach((s, j) => {
        const sp = `${p}.slots[${j}]`;
        need(typeof s?.time === 'string' && /^\d{1,2}:\d{2}$/.test(s.time), `${sp}.time`, 'Missing or not HH:MM.');
        need(SLOT_TYPES.includes(s?.type), `${sp}.type`, `Must be one of ${SLOT_TYPES.join(', ')}.`);
        need(typeof s?.title === 'string' && s.title, `${sp}.title`, 'Missing.');
        if (s?.recipe_id != null) need(recipes && recipes[s.recipe_id], `${sp}.recipe_id`, `"${s.recipe_id}" is not in recipes{}.`);
        if (s?.items != null) need(Array.isArray(s.items), `${sp}.items`, 'Not a list.');
        if (s?.type === 'meal') need(Array.isArray(s.items) && s.items.length, `${sp}.items`, 'A meal needs at least one item.');
        (Array.isArray(s?.items) ? s.items : []).forEach((it, k) => {
          const ip = `${sp}.items[${k}]`;
          need(typeof it?.name === 'string' && it.name, `${ip}.name`, 'Missing.');
          need(isNum(it?.grams) && it.grams > 0, `${ip}.grams`, 'Missing or not a positive number. This item cannot be scaled or subtracted from the pantry.');
          if (s.type === 'meal') {
            need(isNum(it?.kcal), `${ip}.kcal`, 'Missing or not a number. This item is left out of the kcal ring.');
            need(isNum(it?.protein_g), `${ip}.protein_g`, 'Missing or not a number. This item is left out of the protein ring.');
          }
        });
      });
    });
  }

  if (c.recipes != null) {
    need(recipes, 'recipes', 'Not an object keyed by recipe_id.');
    if (recipes) Object.entries(recipes).forEach(([id, r]) => {
      const p = `recipes.${id}`;
      need(typeof r?.title === 'string' && r.title, `${p}.title`, 'Missing.');
      need(Array.isArray(r?.steps) && r.steps.length, `${p}.steps`, 'Missing or empty. Cook mode is unavailable for this recipe.');
      (Array.isArray(r?.steps) ? r.steps : []).forEach((st, k) => {
        need(typeof st?.text === 'string' && st.text, `${p}.steps[${k}].text`, 'Missing.');
        if (st?.timer_seconds != null) need(isNum(st.timer_seconds) && st.timer_seconds > 0, `${p}.steps[${k}].timer_seconds`, 'Not a positive number. No timer is shown.');
      });
    });
  }

  if (c.sessions != null) {
    const ok = typeof c.sessions === 'object' && !Array.isArray(c.sessions);
    need(ok, 'sessions', 'Not an object keyed by date.');
    if (ok) Object.entries(c.sessions).forEach(([date, s]) => {
      const p = `sessions.${date}`;
      need(isValidDate(date), p, 'Key is not a YYYY-MM-DD date. Session skipped.');
      need(Array.isArray(s?.exercises), `${p}.exercises`, 'Missing or not a list.');
      (Array.isArray(s?.exercises) ? s.exercises : []).forEach((e, k) => {
        const ep = `${p}.exercises[${k}]`;
        need(typeof e?.name === 'string' && e.name, `${ep}.name`, 'Missing.');
        need(Number.isInteger(e?.sets) && e.sets > 0, `${ep}.sets`, 'Missing or not a whole number. Exercise skipped.');
        need(Number.isInteger(e?.reps) && e.reps > 0, `${ep}.reps`, 'Missing or not a whole number.');
        if (e?.load_kg != null) need(isNum(e.load_kg), `${ep}.load_kg`, 'Not a number (use null for no load).');
      });
    });
  }

  if (c.pantry != null) {
    need(Array.isArray(c.pantry), 'pantry', 'Not a list.');
    (Array.isArray(c.pantry) ? c.pantry : []).forEach((x, i) => {
      const p = `pantry[${i}]`;
      need(typeof x?.item_id === 'string' && x.item_id, `${p}.item_id`, 'Missing. Line skipped.');
      need(typeof x?.name === 'string' && x.name, `${p}.name`, 'Missing.');
      need(isNum(x?.quantity), `${p}.quantity`, 'Missing or not a number. Line skipped.');
      need(typeof x?.unit === 'string' && x.unit, `${p}.unit`, 'Missing. Line skipped.');
      need(x?.source === 'counted' || x?.source === 'calculated', `${p}.source`, 'Must be "counted" or "calculated".');
      need(isValidDate(x?.as_of), `${p}.as_of`, 'Missing or not a YYYY-MM-DD date.');
      if (x?.grams_per_unit != null) need(isNum(x.grams_per_unit) && x.grams_per_unit > 0, `${p}.grams_per_unit`, 'Not a positive number.');
    });
  }

  if (c.fun_equivalents != null) {
    need(Array.isArray(c.fun_equivalents), 'fun_equivalents', 'Not a list.');
    (Array.isArray(c.fun_equivalents) ? c.fun_equivalents : []).forEach((f, i) => {
      const p = `fun_equivalents[${i}]`;
      need(typeof f?.plural === 'string' && f.plural, `${p}.plural`, 'Missing. Item skipped.');
      need(isNum(f?.kg) && f.kg > 0, `${p}.kg`, 'Missing or not a positive number. Item skipped.');
      need(typeof f?.note === 'string', `${p}.note`, 'Missing.');
    });
  }
  return w;
}

// --------------------------------------------------------------------------
// Accessors that tolerate a partly broken file.
export class Cycle {
  constructor(raw) {
    this.raw = raw || {};
    const m = this.raw.meta && typeof this.raw.meta === 'object' ? this.raw.meta : {};
    this.meta = m;
    this.dayMap = new Map();
    (Array.isArray(this.raw.days) ? this.raw.days : []).forEach((d) => {
      if (isValidDate(d?.date) && !this.dayMap.has(d.date)) this.dayMap.set(d.date, d);
    });
    this.dates = [...this.dayMap.keys()].sort();
    const ses = this.raw.sessions && typeof this.raw.sessions === 'object' ? this.raw.sessions : {};
    this.sessionMap = new Map(Object.entries(ses).filter(([d, s]) => isValidDate(d) && Array.isArray(s?.exercises)));
    this.recipes = this.raw.recipes && typeof this.raw.recipes === 'object' ? this.raw.recipes : {};
    this.pantry = (Array.isArray(this.raw.pantry) ? this.raw.pantry : [])
      .filter((x) => typeof x?.item_id === 'string' && isNum(x?.quantity) && typeof x?.unit === 'string');
    this.funEq = Array.isArray(this.raw.fun_equivalents)
      ? this.raw.fun_equivalents.filter((f) => typeof f?.plural === 'string' && isNum(f?.kg) && f.kg > 0)
      : null;
  }
  get name() { return typeof this.meta.cycle_name === 'string' ? this.meta.cycle_name : null; }
  get start() { return isValidDate(this.meta.start_date) ? this.meta.start_date : null; }
  get end() { return isValidDate(this.meta.end_date) ? this.meta.end_date : null; }
  get kcalTarget() { return isNum(this.meta.daily_kcal_target) ? this.meta.daily_kcal_target : null; }
  get proteinTarget() { return isNum(this.meta.daily_protein_target_g) ? this.meta.daily_protein_target_g : null; }
  get isExample() { return this.meta.example === true; }
  inCycle(date) { return this.start && this.end ? date >= this.start && date <= this.end : this.dayMap.has(date); }
  day(date) { return this.dayMap.get(date) || null; }
  slots(date) {
    const d = this.day(date);
    return (Array.isArray(d?.slots) ? d.slots : []).filter((s) => s && typeof s === 'object')
      .slice().sort((a, b) => timeVal(a.time) - timeVal(b.time));
  }
  mealSlots(date) { return this.slots(date).filter((s) => s.type === 'meal'); }
  session(date) {
    const s = this.sessionMap.get(date);
    if (!s) return null;
    const exercises = s.exercises.filter((e) => typeof e?.name === 'string' && Number.isInteger(e?.sets) && e.sets > 0);
    return exercises.length ? { ...s, exercises } : null;
  }
  recipe(id) { const r = this.recipes[id]; return r && Array.isArray(r.steps) && r.steps.length ? r : null; }
}

function timeVal(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9999;
}

export function slotKey(slot) {
  return slot.id ? `id:${slot.id}` : `${slot.time}|${slot.type}|${slug(slot.title)}`;
}
export function exKey(ex) {
  return ex.id ? String(ex.id) : slug(ex.name);
}

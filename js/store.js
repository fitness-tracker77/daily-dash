// Persistent state in localStorage. Every read/write is wrapped in try/catch.
// History is keyed by date and never derived from cycle.json, so replacing
// cycle.json never wipes it.

const KEY = 'dash.state.v1';
const IMPORT_KEY = 'dash.cycle.imported.v1';

function blank() {
  return {
    v: 1,
    ticks: {},        // ticks[date][slotKey] = snapshot of what was done/eaten
    grams: {},        // grams[date][slotKey][itemIndex] = grams typed before ticking
    sets: {},         // sets[date][exKey] = { name, planned:{sets,reps,load}, sets:{ [i]: {done,reps,load,ts} } }
    bodyweight: [],   // [{ date, kg, ts }]
    pantry: {},       // pantry[item_id] = { quantity, source, as_of, baseSig }
    pantryEvents: [], // [{ date, ts, item_id, name, kind, amount, unit }]
    daySnap: {},      // daySnap[date] = { planned, done, complete } — so streaks survive a new cycle.json
    celebrated: {},   // celebrated[date] = { day, kcal, protein }
    badges: {},       // badges[id] = date earned
    prefs: { theme: null },
  };
}

let state = blank();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = Object.assign(blank(), parsed);
    }
  } catch (e) {
    console.warn('Could not read saved state', e);
    state = blank();
  }
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Could not save state', e);
    return false;
  }
}

export const get = () => state;

// The cycle you pasted in Settings > Import cycle. Stored only on this phone.
export function saveImported(text) {
  try {
    localStorage.setItem(IMPORT_KEY, JSON.stringify({ text, importedAt: new Date().toISOString() }));
    return true;
  } catch (e) {
    console.warn('Could not store imported cycle', e);
    return false;
  }
}
export function readImported() {
  try {
    const raw = localStorage.getItem(IMPORT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.text === 'string' ? v : null;
  } catch { return null; }
}
export function clearImported() {
  try { localStorage.removeItem(IMPORT_KEY); return true; } catch { return false; }
}

// nested helpers
export function bucket(obj, ...keys) {
  let o = obj;
  for (const k of keys) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
  return o;
}

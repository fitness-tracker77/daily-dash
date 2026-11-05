// Everything you log lives in IndexedDB on this phone (database "daily-dash", schema version 1).
// The app reads from an in-memory copy, so screens render synchronously; every change is
// written through to IndexedDB in one transaction per burst of changes.
//
// Collections (object stores, keyPath "key"):
//   meals         `${date}|${slotKey}`     what you ticked, with the grams eaten and the numbers at that moment
//   grams         `${date}|${slotKey}`     grams typed for a meal (before or after ticking)
//   sets          `${date}|@${pos}|${i}`   one row per set (pos = card position in that day's session; also holds ex id): reps, kg, done
//   exlog         `${date}|@${pos}`        effort 1-10 and note for one exercise card on a date (also holds ex id)
//   runs          `${date}|run`            distance, time, notes
//   bodyweight    `${date}`                weigh-ins
//   pantry        `${item_id}`             running pantry quantity and its counted/calculated label
//   pantryEvents  id                       recounts and purchases
//   days          `${date}`                planned/done snapshot per day (keeps streaks across cycles)
//   kv            name                     badges, celebrations, settings, last backup, imported cycle
//   rollups       `d:`/`w:`/`m:` + date    per day/week/month sums, rebuilt from the raw logs
//
// localStorage (the old storage) is migrated once and then only read if IndexedDB cannot open.
// Every storage call is wrapped in try/catch; a failure never blanks the screen.

const DB_NAME = 'daily-dash';
export const DB_VERSION = 1;
export const COLLS = ['meals', 'grams', 'sets', 'exlog', 'runs', 'bodyweight', 'pantry', 'pantryEvents', 'days', 'kv', 'rollups'];
export const LOG_COLLS = COLLS.filter((c) => c !== 'rollups');
// kv entries that describe this phone rather than your history: never part of a backup
export const DEVICE_KV = new Set(['cycleImport', 'migration', 'lastBackup', 'rollupsVersion']);

const LEGACY_KEY = 'dash.state.v1';
const LEGACY_IMPORT_KEY = 'dash.cycle.imported.v1';

const mem = Object.fromEntries(COLLS.map((c) => [c, new Map()]));
let db = null;
export const status = { mode: 'starting', error: null, migrated: null, writeError: null };

let rev = 0;                    // bumps on every change to logged data
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export const revision = () => rev;
function changed(coll) { if (coll !== 'rollups') { rev++; listeners.forEach((fn) => { try { fn(coll); } catch (e) { console.warn(e); } }); } }

// ------------------------------------------------------------------ open + load
function openDB() {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('IndexedDB did not open within 5 s')); } }, 5000);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const c of COLLS) if (!d.objectStoreNames.contains(c)) d.createObjectStore(c, { keyPath: 'key' });
      };
      req.onsuccess = () => { if (done) { req.result.close(); return; } done = true; clearTimeout(timer); resolve(req.result); };
      req.onerror = () => { if (!done) { done = true; clearTimeout(timer); reject(req.error || new Error('IndexedDB error')); } };
      req.onblocked = () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('IndexedDB is blocked by another open copy of the app')); } };
    } catch (e) { done = true; clearTimeout(timer); reject(e); }
  });
}
function getAll(d, coll) {
  return new Promise((resolve, reject) => {
    try {
      const req = d.transaction(coll, 'readonly').objectStore(coll).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

export async function init() {
  try {
    if (!('indexedDB' in self)) throw new Error('IndexedDB is not available in this browser');
    db = await openDB();
    db.onversionchange = () => { try { db.close(); } catch { /* closed */ } };
    for (const c of COLLS) {
      const rows = await getAll(db, c);
      mem[c].clear();
      for (const r of rows) if (r && r.key != null) mem[c].set(r.key, r);
    }
    status.mode = 'idb';
    if (!mem.kv.has('migration')) await migrateLegacy();
    else status.migrated = mem.kv.get('migration').value;
  } catch (e) {
    console.warn('IndexedDB unavailable, using read-only fallback', e);
    db = null;
    status.mode = 'fallback';
    status.error = String(e?.message || e);
    for (const c of COLLS) mem[c].clear();
    const legacy = readLegacy();
    if (legacy.state) for (const [c, r] of convertLegacy(legacy.state)) mem[c].set(r.key, r);
    if (legacy.importText) mem.kv.set('cycleImport', { key: 'cycleImport', value: legacy.importText });
  }
  rev++;
  return status;
}

// ------------------------------------------------------------------ legacy localStorage (v1)
function readLegacy() {
  const out = { state: null, importText: null };
  try { const raw = localStorage.getItem(LEGACY_KEY); if (raw) out.state = JSON.parse(raw); } catch (e) { console.warn('Old data unreadable', e); }
  try {
    const raw = localStorage.getItem(LEGACY_IMPORT_KEY);
    if (raw) { const v = JSON.parse(raw); if (typeof v?.text === 'string') out.importText = { text: v.text, importedAt: v.importedAt || null }; }
  } catch { /* ignore */ }
  return out;
}

// v1 state object -> [collection, record] pairs. Pure; nothing is dropped that v1 held.
export function convertLegacy(st) {
  const out = [];
  const obj = (v) => (v && typeof v === 'object' ? v : {});
  for (const [date, slots] of Object.entries(obj(st.ticks))) {
    for (const [slot, snap] of Object.entries(obj(slots))) {
      if (!snap || typeof snap !== 'object') continue;
      out.push(['meals', { ...snap, key: `${date}|${slot}`, date, slot }]);
    }
  }
  for (const [date, slots] of Object.entries(obj(st.grams))) {
    for (const [slot, g] of Object.entries(obj(slots))) {
      const clean = Object.fromEntries(Object.entries(obj(g)).filter(([, v]) => typeof v === 'number'));
      if (Object.keys(clean).length) out.push(['grams', { key: `${date}|${slot}`, date, slot, g: clean }]);
    }
  }
  for (const [date, exs] of Object.entries(obj(st.sets))) {
    for (const [ex, b] of Object.entries(obj(exs))) {
      for (const [i, r] of Object.entries(obj(b?.sets))) {
        if (!r || typeof r !== 'object') continue;
        out.push(['sets', {
          key: `${date}|${ex}|${i}`, date, ex, name: b.name || ex, muscle: null, idx: Number(i),
          done: !!r.done, reps: typeof r.reps === 'number' ? r.reps : null, load: typeof r.load === 'number' ? r.load : null, ts: r.ts || 0,
        }]);
      }
    }
  }
  for (const b of Array.isArray(st.bodyweight) ? st.bodyweight : []) {
    if (b && typeof b.date === 'string' && typeof b.kg === 'number') out.push(['bodyweight', { key: b.date, date: b.date, kg: b.kg, ts: b.ts || 0 }]);
  }
  for (const [id, p] of Object.entries(obj(st.pantry))) out.push(['pantry', { ...p, key: id }]);
  (Array.isArray(st.pantryEvents) ? st.pantryEvents : []).forEach((e, i) => {
    if (e && typeof e === 'object') out.push(['pantryEvents', { ...e, key: `legacy-${e.ts || 0}-${i}` }]);
  });
  for (const [date, s] of Object.entries(obj(st.daySnap))) out.push(['days', { ...s, key: date }]);
  out.push(['kv', { key: 'celebrated', value: obj(st.celebrated) }]);
  out.push(['kv', { key: 'badges', value: obj(st.badges) }]);
  if (st.prefs?.theme) out.push(['kv', { key: 'settings', value: { theme: st.prefs.theme } }]);
  return out;
}

async function migrateLegacy() {
  const legacy = readLegacy();
  const info = { at: new Date().toISOString(), from: legacy.state ? 'localStorage v1' : 'none', records: 0 };
  if (legacy.state) {
    const recs = convertLegacy(legacy.state);
    for (const [c, r] of recs) { if (!mem[c].has(r.key)) { mem[c].set(r.key, r); queue(c, r.key, r); info.records++; } }
  }
  if (legacy.importText && !mem.kv.has('cycleImport')) {
    const r = { key: 'cycleImport', value: legacy.importText };
    mem.kv.set(r.key, r); queue('kv', r.key, r);
  }
  const m = { key: 'migration', value: info };
  mem.kv.set(m.key, m); queue('kv', m.key, m);
  status.migrated = info;
  await flush(); // localStorage is left untouched as a read-only fallback
}

// ------------------------------------------------------------------ reads
export const all = (coll) => mem[coll];
export const values = (coll) => [...mem[coll].values()];
export const get = (coll, key) => mem[coll].get(key) || null;
export function kv(key, dflt = null) { const r = mem.kv.get(key); return r ? r.value : dflt; }

// ------------------------------------------------------------------ writes (memory now, disk in a batch)
const pending = new Map(); // coll -> Map(key -> record | null)
let flushTimer = null;
let flushing = Promise.resolve(true);

function queue(coll, key, rec) {
  if (!pending.has(coll)) pending.set(coll, new Map());
  pending.get(coll).set(key, rec);
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 0);
}
export function put(coll, rec) {
  if (!rec || rec.key == null) return;
  mem[coll].set(rec.key, rec);
  queue(coll, rec.key, rec);
  changed(coll);
}
export function del(coll, key) {
  if (!mem[coll].has(key)) return;
  mem[coll].delete(key);
  queue(coll, key, null);
  changed(coll);
}
export function setKv(key, value) { put('kv', { key, value }); }
export function delKv(key) { del('kv', key); }

// Write everything pending in one transaction. Resolves true when it reached the disk.
export function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const batch = [...pending.entries()].map(([c, m]) => [c, [...m.entries()]]);
  pending.clear();
  flushing = flushing.then(() => writeBatch(batch));
  return flushing;
}
function writeBatch(batch) {
  if (!batch.length) return Promise.resolve(true);
  if (!db) return Promise.resolve(false); // fallback mode: changes stay in memory only
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(batch.map(([c]) => c), 'readwrite');
      for (const [c, rows] of batch) {
        const os = tx.objectStore(c);
        for (const [k, r] of rows) r === null ? os.delete(k) : os.put(r);
      }
      tx.oncomplete = () => { status.writeError = null; resolve(true); };
      tx.onerror = tx.onabort = () => { status.writeError = String(tx.error?.message || 'write failed'); console.warn('Save failed', tx.error); resolve(false); };
    } catch (e) { status.writeError = String(e?.message || e); console.warn('Save failed', e); resolve(false); }
  });
}

// Replace a whole collection (used by rollups and Restore → Replace).
export function replaceAll(coll, records) {
  const keep = new Map(records.map((r) => [r.key, r]));
  for (const k of [...mem[coll].keys()]) if (!keep.has(k)) { mem[coll].delete(k); queue(coll, k, null); }
  for (const [k, r] of keep) {
    const cur = mem[coll].get(k);
    if (!cur || JSON.stringify(cur) !== JSON.stringify(r)) { mem[coll].set(k, r); queue(coll, k, r); }
  }
  changed(coll);
}

// Read straight from disk (tests and diagnostics: proves what is actually stored).
export async function readDisk(coll) {
  if (!db) return null;
  await flush();
  return getAll(db, coll);
}

// ------------------------------------------------------------------ imported cycle (stored on this phone)
export function saveImported(text) {
  try { setKv('cycleImport', { text, importedAt: new Date().toISOString() }); return status.mode === 'idb'; } catch (e) { console.warn(e); return false; }
}
export function readImported() {
  const v = kv('cycleImport');
  return v && typeof v.text === 'string' ? v : null;
}
export function clearImported() {
  try { delKv('cycleImport'); return true; } catch { return false; }
}

// ------------------------------------------------------------------ persistence request
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted?.()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'not granted';
  } catch { return 'unsupported'; }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

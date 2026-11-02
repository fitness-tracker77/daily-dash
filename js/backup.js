// Backup = one JSON file with your full logged history. Restore validates it, shows counts,
// and then merges or replaces only after you confirm. Nothing is ever sent anywhere: the file
// goes to the iOS share sheet (Save to Files) or a normal download.
import * as store from './store.js';
import { isValidDate, today } from './util.js';

export const BACKUP_FORMAT = 'daily-dash-backup';
export const BACKUP_VERSION = 1;

const sortByKey = (a, b) => (String(a.key) < String(b.key) ? -1 : String(a.key) > String(b.key) ? 1 : 0);

export function buildBackup() {
  const data = {};
  for (const c of store.LOG_COLLS) {
    let rows = store.values(c);
    if (c === 'kv') rows = rows.filter((r) => !store.DEVICE_KV.has(r.key) && r.key !== 'rollupsDirty');
    data[c] = rows.map((r) => structuredClone(r)).sort(sortByKey);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, db_schema: store.DB_VERSION, exportedAt: new Date().toISOString(), data };
}

export function countsOf(data) {
  const dates = new Set();
  for (const c of ['meals', 'sets', 'exlog', 'runs', 'bodyweight', 'pantryEvents']) {
    for (const r of data[c] || []) if ((c !== 'sets' || r.done) && isValidDate(r.date)) dates.add(r.date);
  }
  return {
    days: dates.size,
    sets: (data.sets || []).filter((r) => r.done).length,
    weighins: (data.bodyweight || []).length,
    runs: (data.runs || []).length,
    meals: (data.meals || []).filter((r) => r.type === 'meal').length,
  };
}

// Parse and check a backup file's text. Never throws.
export function checkBackup(text) {
  let obj;
  try { obj = JSON.parse(String(text ?? '')); } catch (e) { return { ok: false, error: `This file is not valid JSON (${e.message}). Nothing was restored.` }; }
  if (!obj || typeof obj !== 'object' || obj.format !== BACKUP_FORMAT) return { ok: false, error: 'This is not a Daily Dash backup file. Nothing was restored.' };
  if (obj.version !== BACKUP_VERSION) return { ok: false, error: `Backup version ${obj.version} is not supported by this app version. Nothing was restored.` };
  if (!obj.data || typeof obj.data !== 'object') return { ok: false, error: 'The backup has no data section. Nothing was restored.' };
  const problems = [];
  for (const [c, rows] of Object.entries(obj.data)) {
    if (!store.LOG_COLLS.includes(c)) { problems.push(`unknown section "${c}" (ignored)`); continue; }
    if (!Array.isArray(rows)) return { ok: false, error: `Section "${c}" is not a list. Nothing was restored.` };
    rows.forEach((r, i) => { if (!r || typeof r !== 'object' || r.key == null) problems.push(`${c}[${i}] has no key (skipped)`); });
  }
  return { ok: true, backup: obj, counts: countsOf(obj.data), problems, exportedAt: obj.exportedAt || null };
}

function cleanRows(rows) { return (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === 'object' && r.key != null); }

// mode: 'replace' wipes your current history first; 'merge' adds what is missing and keeps the newer copy of anything in both
export function applyBackup(backup, mode) {
  const data = backup.data;
  for (const c of store.LOG_COLLS) {
    const incoming = cleanRows(data[c]).filter((r) => c !== 'kv' || !store.DEVICE_KV.has(r.key));
    if (mode === 'replace') {
      const deviceKv = c === 'kv' ? store.values('kv').filter((r) => store.DEVICE_KV.has(r.key)) : [];
      store.replaceAll(c, [...incoming, ...deviceKv]);
      continue;
    }
    for (const r of incoming) {
      const cur = store.get(c, r.key);
      if (!cur) { store.put(c, r); continue; }
      if (c === 'kv') { store.put(c, mergeKv(cur, r)); continue; }
      if ((r.ts || 0) > (cur.ts || 0)) store.put(c, r); // the newer copy wins; same key never duplicates
    }
  }
  // the data in that file is backed up as of when it was made
  const prev = store.kv('lastBackup');
  const at = backup.exportedAt && isValidDate(String(backup.exportedAt).slice(0, 10)) ? String(backup.exportedAt).slice(0, 10) : null;
  if (at && (!prev || at > prev)) store.setKv('lastBackup', at);
}
function mergeKv(cur, inc) {
  if (cur.key === 'badges') { // keep the earliest earned date of each badge
    const v = { ...(cur.value || {}) };
    for (const [k, d] of Object.entries(inc.value || {})) if (!v[k] || (d && d < v[k])) v[k] = d;
    return { key: cur.key, value: v };
  }
  if (cur.key === 'celebrated') {
    const v = { ...(cur.value || {}) };
    for (const [d, kinds] of Object.entries(inc.value || {})) v[d] = { ...(kinds || {}), ...(v[d] || {}) };
    return { key: cur.key, value: v };
  }
  return cur; // settings: this phone's choice stays
}

export function backupFileName() { return `daily-dash-backup-${today()}.json`; }

// Share sheet with a File where supported (Save to Files on iPhone), else a download.
// Resolves 'shared' | 'downloaded' | 'cancelled'.
export async function saveBackupFile() {
  await store.flush();
  const text = JSON.stringify(buildBackup(), null, 1);
  const name = backupFileName();
  let file = null;
  try { file = new File([text], name, { type: 'application/json' }); } catch { file = null; }
  if (file && navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: name });
      store.setKv('lastBackup', today());
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
      // fall through to a download
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  store.setKv('lastBackup', today());
  return 'downloaded';
}

// Settings sheet: cycle import/reset, rest timer, backup/restore, storage status, theme.
import { checkImport } from '../data.js';
import * as store from '../store.js';
import * as M from '../model.js';
import { checkHistory, importHistory } from '../history.js';
import { checkBackup, applyBackup, saveBackupFile } from '../backup.js';
import { openSheet, closeSheet, toast, ICON } from '../ui.js';
import { esc, haptic, num, fmtDate, daysAgoText } from '../util.js';

export function openSettings(ctx) {
  const C = M.cycle();
  const imported = ctx.source === 'imported';
  const when = ctx.importedAt ? new Date(ctx.importedAt) : null;
  const s = M.settings();
  const b = M.backupStatus();
  const last = store.kv('lastBackup');
  const html = `
    <section class="setting">
      <h3 class="h3">Cycle in use</h3>
      <p>${imported
        ? `Your imported cycle${C?.name ? `, ${esc(C.name)}` : ''}${when ? `, imported ${when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.`
        : 'The built-in example (fake data). Import your own cycle below.'}</p>
    </section>

    <section class="setting">
      <h3 class="h3">Import cycle</h3>
      <p class="fine">Paste the full text of your cycle.json. It is checked first, then stored only on this phone. Your logged history is kept.</p>
      <textarea class="import" data-import-text rows="6" placeholder='{ "schema_version": 2, "meta": { … } }' spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Cycle JSON"></textarea>
      <div class="set__row">
        <button class="btn btn--line" data-paste>Paste</button>
        <button class="btn btn--gold" data-import>Import cycle</button>
      </div>
      <div data-result aria-live="polite"></div>
      ${imported ? `<button class="btn btn--line btn--block" data-reset>Reset to example</button>
        <p class="fine">Removes the imported cycle from this phone and shows the example again. Your history is kept.</p>` : ''}
    </section>

    <section class="setting">
      <h3 class="h3">Import history</h3>
      <p class="fine">Weigh-ins, runs and lifts from before the app, as JSON: <code>{ "weigh_ins": [], "runs": [], "lift_sets": [] }</code>. Nothing is overwritten: anything already logged for that date is skipped, so importing the same file twice adds nothing.</p>
      <textarea class="import" data-hist-text rows="4" placeholder='{ "weigh_ins": [ … ], "runs": [ … ], "lift_sets": [ … ] }' spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="History JSON"></textarea>
      <div class="set__row">
        <label class="btn btn--line file"><input type="file" accept="application/json,.json" data-hist-file>Choose file</label>
        <button class="btn btn--gold" data-hist-import>Import history</button>
      </div>
      <div data-hist-result aria-live="polite"></div>
    </section>

    <section class="setting">
      <h3 class="h3">Rest timer</h3>
      <label class="switch"><input type="checkbox" data-autorest ${s.autoRest ? 'checked' : ''}><span>Start the rest timer when I tick a set</span></label>
      <label class="field"><span>Default rest</span><input type="text" inputmode="numeric" value="${s.restDefault}" data-restdefault aria-label="Default rest in seconds"><em>seconds</em></label>
      <p class="fine">Used when an exercise has no rest_seconds in cycle.json.</p>
    </section>

    <section class="setting">
      <h3 class="h3">Backup</h3>
      <p>${b ? (b.never ? `No backup yet. Your first entry was ${daysAgoText(b.days)}.` : `Last backup ${daysAgoText(b.days)}, ${fmtDate(last.slice(0, 10), { year: true })}.`) : last ? `Last backup ${fmtDate(String(last).slice(0, 10), { year: true })}.` : 'Nothing logged yet.'}</p>
      <button class="btn btn--gold btn--block" data-backup>Save backup file</button>
      <p class="fine">One JSON file with your full history. On iPhone choose Save to Files. The file never leaves your phone unless you send it.</p>
      <h3 class="h3">Restore</h3>
      <label class="btn btn--line btn--block file"><input type="file" accept="application/json,.json" data-restore-file>Choose backup file</label>
      <div data-restore aria-live="polite"></div>
    </section>

    <section class="setting">
      <h3 class="h3">Storage on this phone</h3>
      <dl class="facts">
        <div><dt>Persistent storage</dt><dd data-persist>${esc(ctx.persist || 'checking')}</dd></div>
        <div><dt>Database</dt><dd>${store.status.mode === 'idb' ? 'IndexedDB' : store.status.mode === 'fallback' ? 'unavailable, showing older data read-only' : esc(store.status.mode)}</dd></div>
        ${store.status.migrated && store.status.migrated.from !== 'none' ? `<div><dt>Moved from old storage</dt><dd>${esc(fmtDate(String(store.status.migrated.at).slice(0, 10), { year: true }))}, ${store.status.migrated.records} records</dd></div>` : ''}
      </dl>
      <p class="fine">Even with persistent storage granted, iOS can still remove website data, for example if the app is deleted. Keep backups.</p>
    </section>

    <section class="setting">
      <h3 class="h3">Appearance</h3>
      <button class="btn btn--line btn--block" data-theme-btn>Switch to ${ctx.theme === 'light' ? 'dark' : 'light'} theme</button>
    </section>
    <p class="fine set__foot">${esc(ctx.appTitle)}, app ${esc(ctx.version || '')}</p>`;

  const body = openSheet(html, { title: 'Settings' });
  const ta = body.querySelector('[data-import-text]');
  const out = body.querySelector('[data-result]');
  let confirmedText = null;

  body.querySelector('[data-paste]').addEventListener('click', async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { ta.value = t; out.innerHTML = ''; confirmedText = null; } else toast('The clipboard is empty.');
    } catch { toast('Paste was blocked. Long-press the box and choose Paste.'); ta.focus(); }
  });
  ta.addEventListener('input', () => { confirmedText = null; out.innerHTML = ''; });

  const doImport = () => {
    const r = checkImport(ta.value);
    if (!r.ok) {
      out.innerHTML = `<div class="warn is-open import__msg"><p>${ICON.warn}<span>${esc(r.error)}</span></p></div>`;
      haptic([30, 60, 30]);
      return;
    }
    if (r.warnings.length && confirmedText !== r.text) {
      confirmedText = r.text;
      out.innerHTML = `
        <div class="warn is-open import__msg">
          <p>${ICON.warn}<span>${r.warnings.length} problem${r.warnings.length === 1 ? '' : 's'} found. Nothing is guessed: affected numbers would be left out. Fix the file, or import it anyway.</span></p>
          <ul class="warn__list">${r.warnings.slice(0, 50).map((x) => `<li><code>${esc(x.path)}</code><span>${esc(x.msg)}</span></li>`).join('')}</ul>
          ${r.warnings.length > 50 ? `<p class="fine">${r.warnings.length - 50} more not shown.</p>` : ''}
          <button class="btn btn--line btn--block" data-import-anyway>Import anyway</button>
        </div>`;
      out.querySelector('[data-import-anyway]').addEventListener('click', doImport);
      return;
    }
    if (!store.saveImported(r.text)) {
      out.innerHTML = `<div class="warn is-open import__msg"><p>${ICON.warn}<span>This phone would not store the cycle (its database is unavailable). Nothing was changed.</span></p></div>`;
      return;
    }
    ctx.applyCycle(r.cycle, { source: 'imported', importedAt: new Date().toISOString() });
    closeSheet(); haptic(12);
    toast(`Cycle imported${r.cycle?.meta?.cycle_name ? `: ${r.cycle.meta.cycle_name}` : ''}`);
  };
  body.querySelector('[data-import]').addEventListener('click', doImport);

  body.querySelector('[data-reset]')?.addEventListener('click', async () => {
    if (!confirm('Remove the imported cycle from this phone and go back to the example? Your history is kept.')) return;
    if (!store.clearImported()) { toast('Could not remove it.'); return; }
    closeSheet();
    await ctx.reloadCycle();
    toast('Back to the built-in example');
  });

  body.querySelector('[data-autorest]').addEventListener('change', (e) => { M.setSetting('autoRest', e.target.checked); toast(e.target.checked ? 'Rest timer starts on each set' : 'Rest timer off'); });
  body.querySelector('[data-restdefault]').addEventListener('change', (e) => {
    const v = num(e.target.value);
    if (v == null || v < 5 || v > 900 || !Number.isInteger(v)) { toast('Use whole seconds between 5 and 900.'); e.target.value = M.settings().restDefault; return; }
    M.setSetting('restDefault', v); toast(`Default rest ${v} s`);
  });

  body.querySelector('[data-backup]').addEventListener('click', async () => {
    try {
      const res = await saveBackupFile();
      if (res === 'cancelled') { toast('Backup cancelled'); return; }
      toast(res === 'shared' ? 'Backup saved' : 'Backup downloaded');
      closeSheet(); ctx.rerender();
    } catch (e) { toast(`Backup failed: ${e?.message || e}`); }
  });

  const hOut = body.querySelector('[data-hist-result]');
  const histText = body.querySelector('[data-hist-text]');
  body.querySelector('[data-hist-file]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { histText.value = await file.text(); } catch (err) { hOut.innerHTML = `<div class="warn is-open"><p>${ICON.warn}<span>The file could not be read (${esc(err?.message || err)}).</span></p></div>`; }
  });
  body.querySelector('[data-hist-import]').addEventListener('click', () => {
    const r = checkHistory(histText.value);
    if (!r.ok) { hOut.innerHTML = `<div class="warn is-open"><p>${ICON.warn}<span>${esc(r.error)}</span></p></div>`; return; }
    const res = importHistory(r.history);
    M.refreshSnaps(); M.updateBadges();
    const a = res.added, k = res.skipped;
    hOut.innerHTML = `
      <dl class="facts">
        <div><dt>Weigh-ins</dt><dd>${a.weigh_ins} added, ${k.weigh_ins} skipped</dd></div>
        <div><dt>Runs</dt><dd>${a.runs} added, ${k.runs} skipped</dd></div>
        <div><dt>Sets</dt><dd>${a.sets} added, ${k.sets} skipped</dd></div>
        ${k.invalid ? `<div><dt>Invalid</dt><dd>${k.invalid} left out</dd></div>` : ''}
      </dl>
      ${r.warnings.length ? `<div class="warn is-open import__msg"><p>${ICON.warn}<span>${r.warnings.length} problem${r.warnings.length === 1 ? '' : 's'} found; those entries were left out.</span></p>
        <ul class="warn__list">${r.warnings.slice(0, 50).map((x) => `<li><code>${esc(x.path)}</code><span>${esc(x.msg)}</span></li>`).join('')}</ul>
        ${r.warnings.length > 50 ? `<p class="fine">${r.warnings.length - 50} more not shown.</p>` : ''}</div>` : ''}`;
    haptic(12); toast(`History imported: ${a.weigh_ins + a.runs + a.sets} added`);
    ctx.rerender();
  });

  const rOut = body.querySelector('[data-restore]');
  body.querySelector('[data-restore-file]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let text = '';
    try { text = await file.text(); } catch (err) { rOut.innerHTML = `<div class="warn is-open"><p>${ICON.warn}<span>The file could not be read (${esc(err?.message || err)}).</span></p></div>`; return; }
    const r = checkBackup(text);
    if (!r.ok) { rOut.innerHTML = `<div class="warn is-open" data-restore-error><p>${ICON.warn}<span>${esc(r.error)}</span></p></div>`; return; }
    const c = r.counts;
    rOut.innerHTML = `
      <div class="restore">
        <p>Backup from ${r.exportedAt ? esc(fmtDate(r.exportedAt.slice(0, 10), { year: true })) : 'an unknown date'} holds:</p>
        <dl class="facts" data-restore-counts>
          <div><dt>Days</dt><dd data-c="days">${c.days}</dd></div>
          <div><dt>Sets</dt><dd data-c="sets">${c.sets}</dd></div>
          <div><dt>Weigh-ins</dt><dd data-c="weighins">${c.weighins}</dd></div>
          <div><dt>Runs</dt><dd data-c="runs">${c.runs}</dd></div>
        </dl>
        ${r.problems.length ? `<p class="fine">${r.problems.length} record${r.problems.length === 1 ? '' : 's'} will be skipped: ${esc(r.problems.slice(0, 5).join('; '))}.</p>` : ''}
        <div class="set__row">
          <button class="btn btn--line" data-restore-mode="merge">Merge</button>
          <button class="btn btn--line btn--bad" data-restore-mode="replace">Replace</button>
        </div>
        <p class="fine">Merge adds what this phone does not have and keeps the newer copy of anything in both. Replace deletes this phone's history first.</p>
      </div>`;
    rOut.querySelectorAll('[data-restore-mode]').forEach((btn) => btn.addEventListener('click', async () => {
      const mode = btn.dataset.restoreMode;
      const q = mode === 'replace'
        ? `Replace ALL history on this phone with this backup (${c.days} days, ${c.sets} sets, ${c.weighins} weigh-ins, ${c.runs} runs)? This cannot be undone.`
        : `Merge this backup (${c.days} days, ${c.sets} sets, ${c.weighins} weigh-ins, ${c.runs} runs) into this phone's history?`;
      if (!confirm(q)) return;
      applyBackup(r.backup, mode);
      await store.flush();
      closeSheet();
      await ctx.reloadCycle();
      toast(mode === 'replace' ? 'History replaced from backup' : 'Backup merged');
    }));
  });

  body.querySelector('[data-theme-btn]').addEventListener('click', () => { ctx.toggleTheme(); closeSheet(); });
  return body;
}


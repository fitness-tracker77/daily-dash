// Settings sheet: import a cycle by pasting its JSON, reset to the example, theme.
import { checkImport } from '../data.js';
import * as store from '../store.js';
import * as M from '../model.js';
import { openSheet, closeSheet, toast, ICON } from '../ui.js';
import { esc, haptic } from '../util.js';

export function openSettings(ctx) {
  const C = M.cycle();
  const imported = ctx.source === 'imported';
  const when = ctx.importedAt ? new Date(ctx.importedAt) : null;
  const html = `
    <section class="set-block">
      <h3 class="h3">Cycle in use</h3>
      <p class="muted">${imported
        ? `Your imported cycle${C?.name ? ` <strong class="plain">“${esc(C.name)}”</strong>` : ''}${when ? `, imported ${when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.`
        : 'The built-in example (fake data). Import your own cycle below.'}</p>
    </section>

    <section class="set-block">
      <h3 class="h3">Import cycle</h3>
      <p class="fine">Paste the full text of your cycle.json. It is checked first, then stored only on this phone. Your ticks, sets, weigh-ins and pantry counts are kept.</p>
      <textarea class="import__text" data-import-text rows="7" placeholder='{ "schema_version": 1, "meta": { … } }' spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Cycle JSON"></textarea>
      <div class="set-row">
        <button class="btn btn--ghost" data-paste>Paste</button>
        <button class="btn btn--accent" data-import>Import cycle</button>
      </div>
      <div data-result aria-live="polite"></div>
    </section>

    ${imported ? `<section class="set-block">
      <h3 class="h3">Reset</h3>
      <p class="fine">Removes the imported cycle from this phone and goes back to the example. Your history is kept.</p>
      <button class="btn btn--ghost btn--block" data-reset>Reset to example</button>
    </section>` : ''}

    <section class="set-block">
      <h3 class="h3">Appearance</h3>
      <button class="btn btn--ghost btn--block" data-theme-btn>${ctx.theme === 'light' ? ICON.moon : ICON.sun} Switch to ${ctx.theme === 'light' ? 'dark' : 'light'} mode</button>
    </section>
    <p class="fine set-foot">${esc(ctx.appTitle)}</p>`;

  const body = openSheet(html, { title: 'Settings' });
  const ta = body.querySelector('[data-import-text]');
  const out = body.querySelector('[data-result]');
  let confirmedText = null; // text the user chose to import despite warnings

  body.querySelector('[data-paste]').addEventListener('click', async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { ta.value = t; out.innerHTML = ''; confirmedText = null; }
      else toast('The clipboard is empty.');
    } catch {
      toast('Paste was blocked. Long-press the box and choose Paste.');
      ta.focus();
    }
  });
  ta.addEventListener('input', () => { confirmedText = null; out.innerHTML = ''; });

  const doImport = () => {
    const r = checkImport(ta.value);
    if (!r.ok) {
      out.innerHTML = `<div class="card card--warn import__msg"><p>${ICON.warn}<span>${esc(r.error)}</span></p></div>`;
      haptic([30, 60, 30]);
      return;
    }
    if (r.warnings.length && confirmedText !== r.text) {
      confirmedText = r.text;
      out.innerHTML = `
        <div class="card card--warn import__msg">
          <p>${ICON.warn}<span><strong>${r.warnings.length} problem${r.warnings.length === 1 ? '' : 's'} found.</strong> Nothing is guessed: affected numbers would be left out. Fix the file, or import it anyway.</span></p>
          <ul class="warn-list">${r.warnings.slice(0, 40).map((x) => `<li><code>${esc(x.path)}</code><span>${esc(x.msg)}</span></li>`).join('')}</ul>
          ${r.warnings.length > 40 ? `<p class="fine">…and ${r.warnings.length - 40} more.</p>` : ''}
          <button class="btn btn--ghost btn--block" data-import-anyway>Import anyway</button>
        </div>`;
      out.querySelector('[data-import-anyway]').addEventListener('click', doImport);
      return;
    }
    if (!store.saveImported(r.text)) {
      out.innerHTML = `<div class="card card--warn import__msg"><p>${ICON.warn}<span>This phone would not store the cycle (storage is full or blocked, for example in Private Browsing). Nothing was changed.</span></p></div>`;
      return;
    }
    ctx.applyCycle(r.cycle, { source: 'imported', importedAt: new Date().toISOString() });
    closeSheet();
    haptic(15);
    toast(`Cycle imported${r.cycle?.meta?.cycle_name ? `: ${r.cycle.meta.cycle_name}` : ''}.`);
  };
  body.querySelector('[data-import]').addEventListener('click', doImport);

  body.querySelector('[data-reset]')?.addEventListener('click', async () => {
    if (!confirm('Remove the imported cycle from this phone and go back to the example? Your history is kept.')) return;
    if (!store.clearImported()) { toast('Could not remove it. Storage is blocked.'); return; }
    closeSheet();
    await ctx.reloadCycle();
    toast('Back to the built-in example.');
  });
  body.querySelector('[data-theme-btn]').addEventListener('click', () => { ctx.toggleTheme(); closeSheet(); });
}

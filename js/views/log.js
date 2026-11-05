import * as M from '../model.js';
import { esc, fmtNum, fmtKg, fmtDate, today, isNum, num, haptic, isValidDate, fmtClock, parseClock, fmtPace } from '../util.js';
import { openSheet, closeSheet, toast, ICON } from '../ui.js';
import { lineChart } from '../charts.js';
import { head, backupBanner, NL } from './common.js';

let exportRangeId = '7d';

export function renderLog(root, ctx) {
  const t = today();
  const dates = M.logDates();
  if (!ctx.logDate || !isValidDate(ctx.logDate)) ctx.logDate = dates.includes(t) || !dates.length ? t : dates[dates.length - 1];
  const date = ctx.logDate;
  const prev = [...dates].reverse().find((d) => d < date) || null;
  const next = dates.find((d) => d > date) || null;
  const bw = M.bodyweights();
  const last = bw[bw.length - 1] || null;
  const v = last ? M.vsPath(last) : null;
  const path = M.targetPath();
  const target = path ? { from: { date: path.start, y: path.from }, to: { date: path.end, y: path.to } } : null;

  root.innerHTML = `
    ${head(ctx, '<span>Log</span>')}
    ${backupBanner()}
    <section class="hero" aria-label="Bodyweight">
      <p class="hero__figure figure" data-hero>${last ? fmtKg(last.kg) : '—'}<span class="hero__of"> kg</span></p>
      <p class="hero__label">${last ? `latest weigh-in, ${fmtDate(last.date, { dow: true })}${v ? `, ${fmtNum(Math.abs(v.diff), 1)} kg ${v.side === 'on' ? 'on' : v.side} the target path` : ''}` : `bodyweight ${NL}`}</p>
    </section>
    <form class="form form--row" data-bw>
      <label class="field"><span>Date</span><input type="date" name="date" value="${t}" max="${t}" required></label>
      <label class="field"><span>Weight</span><input type="text" inputmode="decimal" name="kg" placeholder="kg" aria-label="Bodyweight in kg" data-focus-key="bwkg"><em>kg</em></label>
      <button class="btn btn--gold" type="submit">Save</button>
    </form>
    ${bw.length ? `<section class="chartblock" data-chart="bw-log">
      ${lineChart({ points: bw.map((b) => ({ date: b.date, y: b.kg, mark: M.vsPath(b)?.side })), target, unit: 'kg', minSpan: 2, tickStep: 0.5, tickDp: 1, label: 'Bodyweight and target path' })}
      <p class="fine">${target ? 'Dashed: the straight target path from cycle.json. Filled dots above it, hollow below.' : 'No target path in cycle.json.'}</p></section>` : ''}

    <section class="entries" aria-label="Entries">
      <h2 class="h2">Entries</h2>
      <div class="datenav">
        <button class="icon-btn" data-goto="${prev ?? ''}" ${prev ? '' : 'disabled'} aria-label="Earlier entry">${ICON.left}</button>
        <label class="datenav__pick"><span class="sr">Date</span><input type="date" value="${date}" max="${t}" data-pick></label>
        <button class="icon-btn" data-goto="${next ?? ''}" ${next ? '' : 'disabled'} aria-label="Later entry">${ICON.right}</button>
      </div>
      <p class="sub">${fmtDate(date, { dow: true, long: true, year: true })}${dates.length ? `. Entries go back to ${fmtDate(dates[0], { year: true })}.` : ''}</p>
      ${entriesHTML(date)}
    </section>

    <section class="export" aria-label="Export for Claude">
      <h2 class="h2">Export for Claude</h2>
      <nav class="range" aria-label="Export range">${M.EXPORT_RANGES.map(([id, l]) => `<button class="range__b${id === exportRangeId ? ' is-on' : ''}" data-xr="${id}" aria-pressed="${id === exportRangeId}">${l}</button>`).join('')}</nav>
      <p class="sub">Plain text: planned against eaten grams, sets, effort and notes, runs, bodyweight, pantry and streaks.</p>
      <button class="btn btn--gold btn--block" data-copy>Copy summary</button>
      <details class="preview"><summary>Preview</summary><pre data-export-text>${esc(M.exportText(exportRangeId))}</pre></details>
    </section>`;
  bind(root, ctx);
}

function entriesHTML(date) {
  const e = M.entriesFor(date);
  const parts = [];
  for (const tk of e.ticks) {
    parts.push(`<li class="row entry" data-entry="tick" data-key="${esc(tk.key)}">
      <div><p class="entry__k">${esc(tk.time ?? '')} ${esc(tk.type === 'meal' ? 'Meal' : tk.type)}</p><p class="entry__t">${esc(tk.title ?? '')}</p>
      ${tk.type === 'meal' ? `<p class="entry__d">${tk.items.map((i) => `${esc(i.name)} ${isNum(i.eaten_g) ? fmtKg(i.eaten_g) : '?'} g`).join(', ')}</p><p class="entry__d">${fmtNum(tk.kcal)} kcal, ${fmtNum(tk.protein, 1)} g protein</p>` : '<p class="entry__d">Ticked</p>'}</div>
      <div class="entry__acts">${tk.type === 'meal' ? '<button class="link" data-edit>Edit</button>' : ''}<button class="link link--quiet" data-del>Delete</button></div></li>`);
  }
  for (const x of e.exercises) {
    for (const s of x.sets) {
      parts.push(`<li class="row entry" data-entry="set" data-key="${esc(s.key)}">
        <div><p class="entry__k">${esc(x.name)}, set ${s.idx + 1}</p><p class="entry__t">${s.reps ?? '?'} × ${s.load != null ? `${fmtKg(s.load)} kg` : 'no load'}${M.prs().ids.has(s.key) ? ' <span class="pr">PR</span>' : ''}</p></div>
        <div class="entry__acts"><button class="link" data-edit>Edit</button><button class="link link--quiet" data-del>Delete</button></div></li>`);
    }
  }
  for (const xl of e.exlogs) {
    parts.push(`<li class="row entry" data-entry="exlog" data-key="${esc(xl.key)}">
      <div><p class="entry__k">${esc(xl.name)}</p><p class="entry__t">${isNum(xl.effort) ? `Effort ${xl.effort} of 10` : 'No effort score'}</p>${xl.note ? `<p class="entry__d">${esc(xl.note)}</p>` : ''}</div>
      <div class="entry__acts"><button class="link" data-edit>Edit</button><button class="link link--quiet" data-del>Delete</button></div></li>`);
  }
  if (e.run) {
    const p = M.paceOf(e.run);
    parts.push(`<li class="row entry" data-entry="run" data-key="${esc(e.run.key)}">
      <div><p class="entry__k">Run</p><p class="entry__t">${isNum(e.run.distance_km) ? `${fmtKg(e.run.distance_km)} km` : 'distance not logged'}, ${isNum(e.run.time_s) ? fmtClock(e.run.time_s) : 'time not logged'}</p>
      ${p ? `<p class="entry__d">Pace ${fmtPace(p)}</p>` : ''}${e.run.notes ? `<p class="entry__d">${esc(e.run.notes)}</p>` : ''}</div>
      <div class="entry__acts"><button class="link" data-edit>Edit</button><button class="link link--quiet" data-del>Delete</button></div></li>`);
  }
  if (e.bodyweight) {
    parts.push(`<li class="row entry" data-entry="bw" data-key="${esc(e.bodyweight.key)}">
      <div><p class="entry__k">Bodyweight</p><p class="entry__t">${fmtKg(e.bodyweight.kg)} kg</p></div>
      <div class="entry__acts"><button class="link" data-edit>Edit</button><button class="link link--quiet" data-del>Delete</button></div></li>`);
  }
  for (const pe of e.pantry) {
    parts.push(`<li class="row entry" data-entry="pantry" data-key="${esc(pe.key)}">
      <div><p class="entry__k">Pantry</p><p class="entry__t">${esc(pe.name)} ${pe.kind === 'bought' ? 'bought' : pe.kind === 'cooked' ? 'cooked' : 'recounted to'} ${fmtKg(pe.amount)} ${esc(pe.unit ?? '')}</p></div>
      <div class="entry__acts"><button class="link link--quiet" data-del>Delete</button></div></li>`);
  }
  return parts.length ? `<ul class="rows">${parts.join('')}</ul>` : '<p class="quiet">Nothing logged on this date.</p>';
}

function bind(root, ctx) {
  const date = ctx.logDate;
  root.querySelector('[data-bw]').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target; const kgv = num(f.kg.value); const d = f.date.value;
    if (!isValidDate(d)) { toast('Pick a date.'); return; }
    if (kgv == null || kgv <= 0 || kgv > 400) { toast('Type your weight in kg, for example 71.4.'); return; }
    M.addBodyweight(d, kgv); haptic(10);
    toast(`Saved ${fmtKg(kgv)} kg for ${fmtDate(d)}`);
    ctx.afterChange(d, ctx.before(d));
  });
  root.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.goto) { ctx.logDate = b.dataset.goto; ctx.rerender(); } }));
  root.querySelector('[data-pick]').addEventListener('change', (e) => { if (isValidDate(e.target.value)) { ctx.logDate = e.target.value; ctx.rerender(); } });
  root.querySelectorAll('[data-xr]').forEach((b) => b.addEventListener('click', () => { exportRangeId = b.dataset.xr; ctx.rerender(); }));
  root.querySelector('[data-copy]').addEventListener('click', async () => {
    const text = M.exportText(exportRangeId);
    try { await navigator.clipboard.writeText(text); toast('Summary copied'); }
    catch {
      const pre = root.querySelector('[data-export-text]');
      pre.closest('details').open = true;
      const r = document.createRange(); r.selectNodeContents(pre);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      toast('Copy was blocked. The text is selected: tap Copy.');
    }
  });

  root.querySelectorAll('.entry').forEach((li) => {
    const kind = li.dataset.entry; const key = li.dataset.key;
    li.querySelector('[data-del]')?.addEventListener('click', () => {
      const msg = kind === 'pantry' && M.pantryEvents().find((x) => x.key === key)?.kind === 'recount'
        ? 'Delete this recount from the log? The current pantry amount stays as it is, because the earlier number was replaced by your measurement.'
        : kind === 'tick' ? 'Delete this entry? It is unticked, and any pantry amount it subtracted is added back.' : 'Delete this entry?';
      if (!confirm(msg)) return;
      const before = ctx.before(date);
      if (kind === 'tick') M.deleteTick(key);
      else if (kind === 'set') M.deleteSet(key);
      else if (kind === 'exlog') M.deleteExLog(key);
      else if (kind === 'run') M.deleteRun(key);
      else if (kind === 'bw') M.deleteBodyweight(key);
      else if (kind === 'pantry') M.deletePantryEvent(key);
      haptic(6); toast('Deleted');
      ctx.afterChange(date, before);
    });
    li.querySelector('[data-edit]')?.addEventListener('click', () => editSheet(ctx, kind, key));
  });
}

function editSheet(ctx, kind, key) {
  const date = ctx.logDate;
  const e = M.entriesFor(date);
  let html = '', save;
  if (kind === 'tick') {
    const tk = e.ticks.find((x) => x.key === key); if (!tk) return;
    html = `<p class="sub">Grams actually eaten. kcal and protein are rescaled from the planned numbers.</p>
      ${tk.items.map((i, k) => `<label class="field"><span>${esc(i.name)}${isNum(i.planned_g) ? ` <small>planned ${fmtKg(i.planned_g)} g</small>` : ''}</span><input type="text" inputmode="decimal" name="g${k}" value="${i.eaten_g ?? ''}"><em>g</em></label>`).join('')}`;
    save = (f) => { const g = tk.items.map((_, k) => num(f[`g${k}`].value)); M.editTickGrams(key, g); };
  } else if (kind === 'set') {
    const s = e.exercises.flatMap((x) => x.sets).find((x) => x.key === key); if (!s) return;
    html = `<label class="field"><span>Reps</span><input type="text" inputmode="numeric" name="reps" value="${s.reps ?? ''}"></label>
      <label class="field"><span>Weight</span><input type="text" inputmode="decimal" name="load" value="${s.load ?? ''}"><em>kg</em></label>`;
    save = (f) => M.editSet(key, { reps: num(f.reps.value), load: num(f.load.value) });
  } else if (kind === 'exlog') {
    const xl = e.exlogs.find((x) => x.key === key); if (!xl) return;
    html = `<label class="field"><span>Effort, 1 to 10</span><input type="text" inputmode="numeric" name="effort" value="${xl.effort ?? ''}"></label>
      <label class="field field--wide"><span>Note</span><input type="text" name="note" value="${esc(xl.note ?? '')}" maxlength="280"></label>`;
    save = (f) => {
      const ef = num(f.effort.value);
      if (ef != null && (!Number.isInteger(ef) || ef < 1 || ef > 10)) { toast('Effort must be a whole number from 1 to 10.'); return false; }
      M.editExLog(key, { effort: ef, note: f.note.value.trim() });
    };
  } else if (kind === 'run') {
    const r = e.run;
    html = `<label class="field"><span>Distance</span><input type="text" inputmode="decimal" name="km" value="${r.distance_km ?? ''}"><em>km</em></label>
      <label class="field"><span>Time</span><input type="text" inputmode="numeric" name="time" value="${isNum(r.time_s) ? fmtClock(r.time_s) : ''}" placeholder="mm:ss"></label>
      <label class="field field--wide"><span>Notes</span><input type="text" name="notes" value="${esc(r.notes ?? '')}" maxlength="280"></label>`;
    save = (f) => {
      const tRaw = f.time.value.trim(); const ts = tRaw ? parseClock(tRaw) : null;
      if (tRaw && ts == null) { toast('Time must look like 25:30.'); return false; }
      M.saveRun(date, { distance_km: num(f.km.value), time_s: ts, notes: f.notes.value });
    };
  } else if (kind === 'bw') {
    const b = e.bodyweight;
    html = `<label class="field"><span>Weight</span><input type="text" inputmode="decimal" name="kg" value="${b.kg}"><em>kg</em></label>`;
    save = (f) => { const v = num(f.kg.value); if (v == null || v <= 0) { toast('Type a weight in kg.'); return false; } M.addBodyweight(date, v); };
  }
  const body = openSheet(`<form class="form" data-edit-form>${html}<button class="btn btn--gold btn--block" type="submit">Save changes</button></form>`, { title: 'Edit entry' });
  body.querySelector('[data-edit-form]').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const before = ctx.before(date);
    if (save(ev.target) === false) return;
    closeSheet(); haptic(8); toast('Saved');
    ctx.afterChange(date, before);
  });
}

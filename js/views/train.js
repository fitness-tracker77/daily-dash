import * as M from '../model.js';
import { exKey } from '../data.js';
import { esc, fmtNum, fmtKg, fmtDate, fmtDow, today, addDays, isNum, num, haptic, fmtClock, parseClock, fmtPace } from '../util.js';
import { openSheet, toast, ICON } from '../ui.js';
import { lineChart } from '../charts.js';
import { startRest, stopRest } from '../rest.js';
import { head } from './common.js';

export function renderTrain(root, ctx) {
  const C = M.cycle(); const date = ctx.date;
  const ses = C.session(date);
  const sp = M.sessionProgress(date);
  const upcoming = [...C.sessionMap.keys()].filter((d) => d > date && C.session(d)).sort();
  const sum = ses?.kind === 'lift' ? M.sessionSummary(date) : null;

  root.innerHTML = `
    ${head(ctx, `<span>Train</span>`)}
    <section class="dayhead">
      <div class="dayhead__row">
        <h1 class="display display--sm"><span class="dayhead__dow">${fmtDow(date)}</span>${fmtDate(date, { long: true })}</h1>
        <div class="dayhead__nav">
          <button class="icon-btn" data-day="-1" aria-label="Previous day">${ICON.left}</button>
          <button class="icon-btn" data-day="1" aria-label="Next day">${ICON.right}</button>
        </div>
      </div>
      ${date !== today() ? `<p class="dayhead__meta"><button class="link" data-today>Back to today</button></p>` : ''}
    </section>
    ${!ses ? `
      <p class="quiet">No session planned for ${fmtDate(date, { dow: true, long: true })}.</p>
      ${upcoming[0] ? `<button class="btn btn--line" data-goto="${upcoming[0]}">Next session, ${fmtDate(upcoming[0], { dow: true })}</button>` : ''}`
    : ses.kind === 'run' ? runBlock(date, ses) : `
      <section class="hero" aria-label="Session progress">
        <p class="hero__figure figure" data-hero>${sp.done}<span class="hero__of"> / ${sp.planned}</span></p>
        <p class="hero__label">sets done${ses.title ? `, ${esc(ses.title)}` : ''}</p>
        <p class="hero__sub">${sum.volume != null ? `${fmtNum(sum.volume)} kg volume so far` : 'Volume not logged yet'}${sum.prs.length ? `, ${sum.prs.length} PR${sum.prs.length === 1 ? '' : 's'}` : ''}</p>
      </section>
      <ol class="exercises">${ses.exercises.map((ex, xi) => exerciseBlock(date, ex, xi)).join('')}</ol>`}
  `;
  bind(root, ctx, ses);
}

function exerciseBlock(date, ex, xi) {
  const prIds = M.prs().ids;
  const last = M.lastLogged(date, ex);
  const xl = M.exLog(date, ex);
  const restS = ex.rest ?? M.settings().restDefault;
  let fromHistory = false;
  const sets = Array.from({ length: ex.sets }, (_, i) => {
    const r = M.setRec(date, ex, i);
    const pf = M.prefill(date, ex, i);
    if (!r?.done && pf.from === 'history') fromHistory = true;
    const reps = isNum(r?.reps) ? r.reps : pf.reps;
    const load = isNum(r?.load) ? r.load : pf.load;
    const done = !!r?.done;
    const pr = done && prIds.has(M.setKeyOf(date, ex, i));
    return `<li class="set${done ? ' is-done' : ''}">
      <button class="tick${done ? ' is-on' : ''}" data-set="${xi}:${i}" aria-pressed="${done}" aria-label="Set ${i + 1}${done ? ', done' : ''}">${ICON.check}</button>
      <span class="set__n">Set ${i + 1}</span>
      <label class="box"><input type="text" inputmode="numeric" value="${reps ?? ''}" placeholder="reps" data-f="reps" data-x="${xi}" data-i="${i}" data-focus-key="s:${date}:${xi}:${i}:reps" aria-label="Reps, set ${i + 1}"><span>reps</span></label>
      <label class="box"><input type="text" inputmode="decimal" value="${load ?? ''}" placeholder="—" data-f="load" data-x="${xi}" data-i="${i}" data-focus-key="s:${date}:${xi}:${i}:load" aria-label="Kilograms, set ${i + 1}"><span>kg</span></label>
      ${pr ? '<span class="pr" title="Heavier than your best on any earlier date">PR</span>' : '<span></span>'}
    </li>`;
  }).join('');
  return `
    <li class="ex" data-ex="${xi}">
      <button class="ex__name" data-detail="${esc(exKey(ex))}">${esc(ex.name)}</button>
      <p class="ex__plan">${ex.sets} × ${isNum(ex.reps) ? ex.reps : '?'}${isNum(ex.load_kg) ? ` at ${fmtKg(ex.load_kg)} kg` : ', no load'}, rest ${fmtClock(restS)}${ex.muscle ? `, ${esc(ex.muscle)}` : ''}</p>
      ${last ? `<p class="ex__last">last: ${last.load != null ? `${fmtKg(last.load)} kg` : 'no load'} × ${last.reps ?? '?'}<small>, ${fmtDate(last.date)}</small></p>` : ''}
      ${ex.notes ? `<p class="ex__notes">${esc(ex.notes)}</p>` : ''}
      <ol class="sets">${sets}</ol>
      <p class="fine">${fromHistory ? 'Boxes are prefilled from your last logged set.' : 'Boxes are prefilled from the plan.'}</p>
      <div class="effort" role="group" aria-label="Effort for ${esc(ex.name)}">
        <span class="effort__label">Effort</span>
        ${Array.from({ length: 10 }, (_, k) => `<button class="effort__b${xl?.effort === k + 1 ? ' is-on' : ''}" data-effort="${xi}:${k + 1}" aria-pressed="${xl?.effort === k + 1}">${k + 1}</button>`).join('')}
      </div>
      <label class="note"><span>Note</span><input type="text" value="${esc(xl?.note ?? '')}" data-note="${xi}" data-focus-key="n:${date}:${xi}" placeholder="Optional" maxlength="280"></label>
    </li>`;
}

function runBlock(date, ses) {
  const r = M.runRec(date);
  const pace = M.paceOf(r);
  return `
    <section class="hero" aria-label="Run">
      <p class="hero__figure figure" data-hero>${r && isNum(r.distance_km) ? fmtKg(r.distance_km) : ses.distance_km ? fmtKg(ses.distance_km) : '—'}<span class="hero__of"> km</span></p>
      <p class="hero__label">${r ? 'logged' : ses.distance_km ? 'planned' : 'no distance planned'}${ses.title ? `, ${esc(ses.title)}` : ''}</p>
      ${r ? `<p class="hero__sub">${isNum(r.time_s) ? fmtClock(r.time_s) : 'time not logged'}${pace ? `, pace ${fmtPace(pace)}` : ''}</p>` : ''}
    </section>
    ${ses.notes ? `<p class="ex__notes">${esc(ses.notes)}</p>` : ''}
    <form class="form" data-run>
      <label class="field"><span>Distance</span><input name="km" type="text" inputmode="decimal" value="${r?.distance_km ?? ''}" placeholder="km" aria-label="Distance in km"><em>km</em></label>
      <label class="field"><span>Time</span><input name="time" type="text" inputmode="numeric" value="${isNum(r?.time_s) ? fmtClock(r.time_s) : ''}" placeholder="mm:ss" aria-label="Time, minutes and seconds"><em>mm:ss</em></label>
      <label class="field field--wide"><span>Notes</span><input name="notes" type="text" value="${esc(r?.notes ?? '')}" placeholder="Optional" maxlength="280"></label>
      <p class="form__msg" data-run-msg aria-live="polite"></p>
      <button class="btn btn--gold" type="submit">${r ? 'Save changes' : 'Log run'}</button>
    </form>`;
}

function bind(root, ctx, ses) {
  const date = ctx.date;
  root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => ctx.setDate(addDays(date, Number(b.dataset.day)), Number(b.dataset.day))));
  root.querySelector('[data-today]')?.addEventListener('click', () => ctx.setDate(today()));
  root.querySelector('[data-goto]')?.addEventListener('click', (e) => ctx.setDate(e.currentTarget.dataset.goto, 1));
  root.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => exerciseSheet(b.dataset.detail)));
  if (!ses) return;

  if (ses.kind === 'run') {
    const f = root.querySelector('[data-run]');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (date > today()) { toast(`You can log this on ${fmtDate(date, { dow: true })}.`); return; }
      const km = num(f.km.value); const tRaw = f.time.value.trim(); const ts = tRaw ? parseClock(tRaw) : null;
      const msg = f.querySelector('[data-run-msg]');
      if (f.km.value.trim() && (km == null || km <= 0)) { msg.textContent = 'Distance must be a number above 0, in km.'; return; }
      if (tRaw && ts == null) { msg.textContent = 'Time must look like 25:30 (or 1:02:03).'; return; }
      if (km == null && ts == null) { msg.textContent = 'Type a distance or a time.'; return; }
      const before = ctx.before(date);
      M.saveRun(date, { distance_km: km, time_s: ts, notes: f.notes.value });
      haptic(12);
      ctx.afterChange(date, before);
      toast('Run logged');
    });
    return;
  }

  const exOf = (el) => ses.exercises[Number(el.dataset.x)];
  root.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', () => {
    const ex = exOf(inp); const i = Number(inp.dataset.i);
    M.setDraft(date, ex, i, inp.dataset.f, num(inp.value));
    if (M.setRec(date, ex, i)?.done) setTimeout(() => ctx.rerender(), 0);
  }));
  root.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
    if (date > today()) { toast(`You can log this on ${fmtDate(date, { dow: true })}.`); return; }
    const [xi, i] = b.dataset.set.split(':').map(Number);
    const ex = ses.exercises[xi];
    const rowEl = b.closest('.set');
    const typed = { reps: num(rowEl.querySelector('[data-f="reps"]').value), load: num(rowEl.querySelector('[data-f="load"]').value) };
    const before = ctx.before(date);
    const on = M.toggleSet(date, ex, i, typed);
    haptic(on ? 12 : 6);
    const sp = M.sessionProgress(date);
    const isPr = on && M.prs().ids.has(M.setKeyOf(date, ex, i));
    ctx.afterChange(date, before);
    if (isPr) toast(`PR: ${ex.name}, ${fmtKg(M.setRec(date, ex, i).load)} kg`);
    if (on && sp.done >= sp.planned) { stopRest(); summarySheet(date); return; }
    if (on && M.settings().autoRest) startRest(ex.rest ?? M.settings().restDefault, ex.name);
  }));
  root.querySelectorAll('[data-effort]').forEach((b) => b.addEventListener('click', () => {
    const [xi, v] = b.dataset.effort.split(':').map(Number);
    const ex = ses.exercises[xi];
    const cur = M.exLog(date, ex)?.effort;
    M.setExLog(date, ex, { effort: cur === v ? null : v });
    haptic(6); ctx.rerender();
  }));
  root.querySelectorAll('[data-note]').forEach((inp) => inp.addEventListener('change', () => {
    M.setExLog(date, ses.exercises[Number(inp.dataset.note)], { note: inp.value.trim() });
  }));
}

function summarySheet(date) {
  const s = M.sessionSummary(date);
  const f = s.fun;
  const html = `
    <section class="hero hero--sheet">
      <p class="hero__figure figure">${s.volume != null ? fmtNum(s.volume) : '—'}<span class="hero__of"> kg</span></p>
      <p class="hero__label">${s.volume != null ? 'total volume, sets × reps × kg as logged' : 'volume not logged (no sets with a load)'}</p>
    </section>
    <dl class="facts">
      <div><dt>Sets done</dt><dd>${s.setsDone} of ${s.setsPlanned ?? '—'}</dd></div>
      <div><dt>PRs</dt><dd>${s.prs.length}</dd></div>
    </dl>
    ${s.prs.length ? `<ul class="list">${s.prs.map((p) => `<li><span>${esc(p.name)}</span><span>${fmtKg(p.prev)} to ${fmtKg(p.load)} kg</span></li>`).join('')}</ul>` : ''}
    ${f ? `<p class="fun">That is ${fmtNum(f.count, 1)} ${esc(f.count === 1 ? f.name : f.plural)}.</p><p class="fine">${esc(f.note)}</p>` : ''}`;
  openSheet(html, { title: 'Session complete' });
}

export function exerciseSheet(key) {
  const d = M.exerciseDetail(key);
  const loads = d.days.filter((x) => x.maxLoad != null).map((x) => ({ date: x.date, y: x.maxLoad, mark: x.pr ? 'pr' : undefined }));
  const e1 = d.days.filter((x) => x.bestE1rm != null).map((x) => ({ date: x.date, y: x.bestE1rm }));
  const bestE1 = e1.length ? Math.max(...e1.map((x) => x.y)) : null;
  const html = `
    ${d.best ? `<section class="hero hero--sheet">
      <p class="hero__figure figure">${fmtKg(d.best.load)}<span class="hero__of"> kg × ${d.best.reps ?? '?'}</span></p>
      <p class="hero__label">best set, ${fmtDate(d.best.date, { year: true })}</p></section>` : `<p class="quiet">No logged sets with a load yet.</p>`}
    ${loads.length ? `<section class="chartblock"><h3 class="h3">Load</h3><p class="chartblock__key">${fmtKg(loads[loads.length - 1].y)} kg <small>heaviest set, last session</small></p>
      ${lineChart({ points: loads, highlight: 'max', unit: 'kg', label: 'Heaviest set per session' })}<p class="fine">Rings mark PR sessions.</p></section>` : ''}
    ${e1.length ? `<section class="chartblock"><h3 class="h3">Estimated 1RM</h3><p class="chartblock__key">${fmtNum(bestE1, 1)} kg <small>best estimate</small></p>
      ${lineChart({ points: e1, highlight: 'max', unit: 'kg estimate', label: 'Estimated 1RM per session' })}
      <p class="fine">Estimate (Epley): kg × (1 + reps ÷ 30), only from sets of 1 to 10 reps.</p></section>` : ''}
    ${d.days.length ? `<h3 class="h3">History</h3>
      <table class="tbl">
        <thead><tr><th>Date</th><th class="r">Sets</th><th class="r">Reps</th><th class="r">kg</th><th class="r">Effort</th></tr></thead>
        <tbody>${d.days.slice().reverse().map((x) => `
          <tr><td>${fmtDate(x.date, { year: x.date.slice(0, 4) !== today().slice(0, 4) })}${x.pr ? ' <span class="pr">PR</span>' : ''}</td>
          <td class="r">${x.sets.length}</td>
          <td class="r">${x.sets.map((s) => s.reps ?? '?').join(', ')}</td>
          <td class="r">${x.sets.map((s) => (s.load != null ? fmtKg(s.load) : '—')).join(', ')}</td>
          <td class="r">${x.effort ?? '—'}</td></tr>
          ${x.note ? `<tr class="tbl__note"><td colspan="5">${esc(x.note)}</td></tr>` : ''}`).join('')}
        </tbody>
      </table>` : ''}`;
  openSheet(html, { title: d.name });
}


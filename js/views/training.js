import * as M from '../model.js';
import { exKey } from '../data.js';
import { esc, fmtNum, fmtKg, fmtDate, today, addDays, isNum, haptic, beep, primeAudio, fmtClock, countUp } from '../util.js';
import { openSheet, toast, lineChart, ICON } from '../ui.js';
import { topbar } from './common.js';

const rest = { endAt: null, dur: 90 };
let restIv = null;
const openHist = new Set();
let eqOffset = 0;

export function renderTraining(root, ctx) {
  const C = M.cycle(); const date = ctx.date;
  const ses = C.session(date);
  const sp = M.sessionProgress(date);
  const prIds = M.prs().ids;
  const upcoming = [...C.sessionMap.keys()].filter((d) => d >= today() && C.session(d)).sort();
  const nextSes = upcoming.find((d) => d !== date);

  root.innerHTML = `
    ${topbar(ctx, '', 'Training')}
    <div class="daybar">
      <button class="icon-btn" data-day="-1" aria-label="Previous day">${ICON.left}</button>
      <div class="daybar__mid"><strong>${fmtDate(date, { dow: true })}</strong>${ses ? `<span class="muted">${esc(ses.title || 'Session')} <span class="num">${sp.done}/${sp.planned}</span> sets</span>` : ''}</div>
      <button class="icon-btn" data-day="1" aria-label="Next day">${ICON.right}</button>
    </div>
    ${restCard()}
    ${ses ? ses.exercises.map((ex, xi) => exerciseCard(date, ex, xi, prIds)).join('') : `
      <div class="empty card"><p>No session planned for ${fmtDate(date, { dow: true })}.</p>
      ${nextSes ? `<button class="btn btn--ghost" data-goto="${nextSes}">Go to ${fmtDate(nextSes, { dow: true })}</button>` : ''}</div>`}
    ${statsCard()}
  `;
  bind(root, ctx, ses);
  countUp(root);
  startRestLoop(root);
}

function exerciseCard(date, ex, xi, prIds) {
  const key = exKey(ex);
  const sets = Array.from({ length: ex.sets }, (_, i) => {
    const r = M.setRec(date, ex, i) || {};
    const reps = isNum(r.reps) ? r.reps : isNum(ex.reps) ? ex.reps : '';
    const load = isNum(r.load) ? r.load : isNum(ex.load_kg) ? ex.load_kg : '';
    const pr = r.done && prIds.has(`${date}|${key}|${i}`);
    return `<div class="set${r.done ? ' is-done' : ''}">
      <button class="set__chip" data-set="${xi}:${i}" aria-pressed="${!!r.done}" aria-label="Set ${i + 1}${r.done ? ', done' : ''}">${r.done ? ICON.check : `<span class="num">${i + 1}</span>`}</button>
      <label class="set__field"><input type="number" inputmode="numeric" min="0" step="1" value="${reps}" data-f="reps" data-x="${xi}" data-i="${i}" data-focus-key="s:${xi}:${i}:reps" aria-label="Reps for set ${i + 1}"><span>reps</span></label>
      <span class="set__x" aria-hidden="true">×</span>
      <label class="set__field"><input type="number" inputmode="decimal" min="0" step="0.5" value="${load}" placeholder="—" data-f="load" data-x="${xi}" data-i="${i}" data-focus-key="s:${xi}:${i}:load" aria-label="Kilograms for set ${i + 1}"><span>kg</span></label>
      ${pr ? '<span class="pr-badge">PR</span>' : ''}
    </div>`;
  }).join('');
  const hist = M.exerciseHistory(key);
  const histOpen = openHist.has(key);
  return `
    <section class="card ex">
      <header class="ex__head">
        <h2>${esc(ex.name)}</h2>
        <p class="ex__plan num">${ex.sets} × ${isNum(ex.reps) ? ex.reps : '?'}${isNum(ex.load_kg) ? ` × ${fmtKg(ex.load_kg)} kg` : ''}</p>
      </header>
      ${ex.notes ? `<p class="ex__notes">${esc(ex.notes)}</p>` : ''}
      <div class="sets">${sets}</div>
      <details class="hist" data-hist="${esc(key)}" ${histOpen ? 'open' : ''}>
        <summary>Load history</summary>
        ${hist.length ? lineChart(hist.map((h) => ({ date: h.date, y: h.load })), { unit: 'kg', dp: 1, height: 130 }) + `<p class="fine">Heaviest logged set per day.</p>` : '<p class="fine">No logged sets with a load yet.</p>'}
      </details>
    </section>`;
}

function restCard() {
  const left = rest.endAt ? Math.max(0, (rest.endAt - Date.now()) / 1000) : null;
  return `
    <section class="card rest${rest.endAt ? ' is-running' : ''}">
      <div class="rest__display"><span class="rest__label">Rest</span><span class="num rest__time" data-rest-time>${left != null ? fmtClock(left) : fmtClock(rest.dur)}</span></div>
      <div class="rest__btns">
        ${[60, 90, 120].map((s) => `<button class="chip chip--btn${rest.dur === s && rest.endAt ? ' is-on' : ''}" data-rest="${s}"><span class="num">${s}</span> s</button>`).join('')}
        ${rest.endAt ? `<button class="chip chip--btn" data-rest="stop">Stop</button>` : ''}
      </div>
    </section>`;
}

function startRestLoop(root) {
  clearInterval(restIv);
  if (!rest.endAt) return;
  restIv = setInterval(() => {
    const left = (rest.endAt - Date.now()) / 1000;
    const el = document.querySelector('[data-rest-time]');
    if (left <= 0) {
      clearInterval(restIv); rest.endAt = null;
      haptic([400, 120, 400]); beep(); toast('Rest is over.');
      document.querySelector('.rest')?.replaceWith(htmlToEl(restCard()));
      bindRest(document);
      return;
    }
    if (el) el.textContent = fmtClock(left);
  }, 250);
}
const htmlToEl = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };

function bindRest(root) {
  root.querySelectorAll('[data-rest]').forEach((b) => b.onclick = () => {
    primeAudio();
    if (b.dataset.rest === 'stop') rest.endAt = null;
    else { rest.dur = Number(b.dataset.rest); rest.endAt = Date.now() + rest.dur * 1000; }
    haptic(8);
    const card = document.querySelector('.rest');
    card?.replaceWith(htmlToEl(restCard()));
    bindRest(document);
    startRestLoop(document);
  });
}

function bind(root, ctx, ses) {
  root.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => ctx.setDate(addDays(ctx.date, Number(b.dataset.day))));
  root.querySelector('[data-goto]')?.addEventListener('click', (e) => ctx.setDate(e.currentTarget.dataset.goto));
  root.querySelector('[data-eq]')?.addEventListener('click', () => { eqOffset += 3; ctx.rerender(); });
  bindRest(root);
  root.querySelectorAll('[data-hist]').forEach((d) => d.addEventListener('toggle', () => { d.open ? openHist.add(d.dataset.hist) : openHist.delete(d.dataset.hist); }));
  if (!ses) return;
  const date = ctx.date;
  root.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', () => {
    const ex = ses.exercises[Number(inp.dataset.x)];
    const v = inp.value === '' ? null : Number(inp.value);
    M.setDraft(date, ex, Number(inp.dataset.i), inp.dataset.f, isNum(v) && v >= 0 ? v : null);
    if (M.setRec(date, ex, Number(inp.dataset.i))?.done) setTimeout(() => ctx.rerender(), 0); // PRs / stats may change
  }));
  root.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
    if (date > today()) { toast(`You can log this on ${fmtDate(date, { dow: true })}.`); return; }
    const [xi, i] = b.dataset.set.split(':').map(Number);
    const ex = ses.exercises[xi];
    // capture what is typed right now, even if the change event has not fired yet
    const row = b.closest('.set');
    ['reps', 'load'].forEach((f) => {
      const inp = row.querySelector(`[data-f="${f}"]`); const v = inp.value === '' ? null : Number(inp.value);
      M.setDraft(date, ex, i, f, isNum(v) && v >= 0 ? v : null);
    });
    const before = ctx.before(date);
    const prBefore = M.prs().ids.size;
    const on = M.toggleSet(date, ex, i);
    haptic(on ? 12 : 6);
    const sp = M.sessionProgress(date);
    const newPr = on && M.prs().ids.has(`${date}|${exKey(ex)}|${i}`) && M.prs().ids.size > prBefore;
    ctx.afterChange(date, before);
    if (newPr) toast(`PR: ${ex.name} ${fmtKg(M.setRec(date, ex, i).load)} kg`);
    if (on && sp.done === sp.planned) showSummary(date);
  }));
}

function showSummary(date) {
  const s = M.sessionSummary(date);
  const eq = s.volume != null ? M.equivalents(s.volume) : null;
  const line = eq && eq.length ? eq[0] : null;
  openSheet(`
    <dl class="stat-grid">
      <div><dt>Total volume</dt><dd>${s.volume != null ? `<span class="num">${fmtNum(s.volume, 1)}</span><small>kg</small>` : '<span class="not-logged">not logged</span>'}</dd></div>
      <div><dt>Sets done</dt><dd><span class="num">${s.setsDone}</span><small class="num">/ ${s.setsPlanned ?? '—'}</small></dd></div>
      <div><dt>PRs hit</dt><dd><span class="num">${s.prs.length}</span></dd></div>
    </dl>
    ${s.prs.length ? `<ul class="plain-list">${s.prs.map((p) => `<li>${esc(p.name)} <small class="num">${fmtKg(p.prev)} kg → ${fmtKg(p.load)} kg</small></li>`).join('')}</ul>` : ''}
    ${line && line.count != null ? `<p class="fun-line">That is <span class="num">${fmtNum(line.count, 1)}</span> ${esc(line.plural)} moved today.</p><p class="fine">${esc(line.note)}</p>` : ''}
  `, { title: 'Session complete' });
}

const NL = '<span class="not-logged">not logged</span>';
function statsCard() {
  const f = M.funStats();
  const eq = M.equivalents(f.totalAll, eqOffset);
  const n = (v, dp, key, unit = '') => (v == null ? NL : `<span class="num" data-count="${v}" data-dp="${dp}" data-count-key="${key}">${fmtNum(v, dp)}</span>${unit ? `<small>${unit}</small>` : ''}`);
  return `
    <section class="card stats">
      <header class="card__head"><h2>Stats</h2><span class="muted">from sets you ticked</span></header>
      <div class="stats__hero">
        <div><span class="stats__label">Lifted this cycle</span><span class="stats__big">${n(f.totalCycle, 0, 'tc', 'kg')}</span></div>
        <div><span class="stats__label">All time</span><span class="stats__big">${n(f.totalAll, 0, 'ta', 'kg')}</span></div>
      </div>
      ${eq ? `<div class="equiv">
          ${f.totalAll != null ? eq.map((e) => `<p>You have lifted <span class="num">${fmtNum(e.count, 1)}</span> ${esc(e.plural)}</p>`).join('') : `<p class="muted">Comparisons appear after your first logged set with a load.</p>`}
          ${f.totalAll != null ? `<p class="fine">${[...new Set(eq.map((e) => e.note).filter(Boolean))].map(esc).join(' ')}</p>` : ''}
          ${f.totalAll != null && M.cycle().funEq.length > 3 ? `<button class="link-btn" data-eq>Show other comparisons</button>` : ''}
        </div>` : ''}
      <dl class="stat-list">
        <div><dt>Heaviest single set</dt><dd>${f.heaviestSet ? `<span class="num">${f.heaviestSet.reps} × ${fmtKg(f.heaviestSet.load)} kg = ${fmtNum(f.heaviestSet.volume, 1)} kg</span><small>${esc(f.heaviestSet.name)}, ${fmtDate(f.heaviestSet.date)}</small>` : NL}</dd></div>
        <div><dt>Heaviest day</dt><dd>${f.heaviestDay ? `${n(f.heaviestDay.volume, 0, 'hd', 'kg')}<small>${fmtDate(f.heaviestDay.date, { dow: true })}</small>` : NL}</dd></div>
        <div><dt>Total sets</dt><dd>${n(f.setsCount, 0, 'ts')}</dd></div>
        <div><dt>Total reps</dt><dd>${n(f.repsCount, 0, 'tr')}</dd></div>
        <div><dt>Sessions logged</dt><dd>${n(f.sessions, 0, 'sl')}</dd></div>
        <div><dt>Most-trained exercise</dt><dd>${f.mostTrained ? `${esc(f.mostTrained.name)}<small class="num">${f.mostTrained.n} sets</small>` : NL}</dd></div>
        <div><dt>Biggest load jump</dt><dd>${f.biggestJump ? `${esc(f.biggestJump.name)}<small>from <span class="num">${fmtKg(f.biggestJump.first)}</span> kg to <span class="num">${fmtKg(f.biggestJump.last)}</span> kg</small>` : NL}</dd></div>
        <div><dt>Heaviest load vs bodyweight</dt><dd>${f.bwPct ? `${n(f.bwPct.pct, 0, 'bw', '%')}<small><span class="num">${fmtKg(f.heaviestLoad.load)}</span> kg vs <span class="num">${fmtKg(f.bwPct.bw.kg)}</span> kg (${fmtDate(f.bwPct.bw.date)})</small>` : NL}</dd></div>
      </dl>
    </section>`;
}

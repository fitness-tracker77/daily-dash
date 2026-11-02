import * as M from '../model.js';
import { esc, fmtNum, fmtKg, fmtDate, fmtDow, fmtMonth, parseDate, isoDate, today, isNum, sum, dow, isValidDate } from '../util.js';
import { miniRing, openSheet, ICON } from '../ui.js';
import { topbar } from './common.js';
import * as store from '../store.js';

let calMonth = null; // 'YYYY-MM'
let ctxRef = null;

export function renderWeek(root, ctx) {
  ctxRef = ctx;
  const C = M.cycle(); const t = today();
  const sk = M.streaks();
  const badges = M.updateBadges();
  if (!calMonth) calMonth = t.slice(0, 7);

  // strip
  const kT = C.kcalTarget;
  const plannedK = C.dates.map((d) => M.plannedDay(d).kcal).filter(isNum);
  const maxK = Math.max(kT || 0, ...plannedK, ...C.dates.map((d) => M.eaten(d).kcal), 1);
  const strip = C.dates.map((d) => {
    const p = M.plannedDay(d); const e = M.eaten(d); const pr = M.progress(d);
    return `<button class="strip__day${d === t ? ' is-today' : ''}${d === ctx.date ? ' is-sel' : ''}${pr.complete ? ' is-complete' : ''}" data-date="${d}" aria-label="${fmtDate(d, { dow: true })}">
      <span class="strip__dow">${fmtDow(d, true)}</span>
      <span class="strip__num num">${parseDate(d).getDate()}</span>
      <span class="strip__bar" aria-hidden="true">
        ${isNum(p.kcal) ? `<span class="strip__plan" style="height:${(p.kcal / maxK) * 100}%"></span>` : ''}
        ${e.meals ? `<span class="strip__eat" style="height:${(e.kcal / maxK) * 100}%"></span>` : ''}
        ${kT ? `<span class="strip__target" style="bottom:${(kT / maxK) * 100}%"></span>` : ''}
      </span>
      <span class="strip__k num">${isNum(p.kcal) ? fmtNum(p.kcal) : '—'}</span>
    </button>`;
  }).join('');

  // cycle averages from the JSON
  const mealDays = C.dates.filter((d) => C.mealSlots(d).length);
  const pk = mealDays.map((d) => M.plannedDay(d).kcal).filter(isNum);
  const pp = mealDays.map((d) => M.plannedDay(d).protein).filter(isNum);
  const sesDates = [...C.sessionMap.keys()].filter((d) => C.session(d));
  const plannedSets = sum(sesDates.map((d) => sum(C.session(d).exercises.map((e) => e.sets))));
  const anyMissing = mealDays.some((d) => M.plannedDay(d).missing);

  root.innerHTML = `
    ${topbar(ctx, '', 'Week')}
    <section class="strip" aria-label="Days of the cycle"><div class="strip__scroll">${strip || '<p class="empty">No days in cycle.json.</p>'}</div>
      <p class="fine strip__legend"><span class="key key--plan"></span>planned kcal <span class="key key--eat"></span>eaten <span class="key key--target"></span>target</p>
    </section>

    <section class="card">
      <header class="card__head"><h2>Cycle plan</h2><span class="muted">${C.start && C.end ? `${fmtDate(C.start)} – ${fmtDate(C.end)}` : 'dates missing'}</span></header>
      <dl class="stat-grid">
        <div><dt>Avg planned kcal</dt><dd>${pk.length ? `<span class="num">${fmtNum(sum(pk) / pk.length)}</span>` : '—'}<small class="num">${kT ? `target ${fmtNum(kT)}` : 'no target'}</small></dd></div>
        <div><dt>Avg planned protein</dt><dd>${pp.length ? `<span class="num">${fmtNum(sum(pp) / pp.length, 1)}</span><small>g</small>` : '—'}<small class="num">${C.proteinTarget ? `target ${fmtNum(C.proteinTarget)} g` : 'no target'}</small></dd></div>
        <div><dt>Days planned</dt><dd><span class="num">${C.dates.length}</span></dd></div>
        <div><dt>Sessions planned</dt><dd><span class="num">${sesDates.length}</span><small class="num">${plannedSets} sets</small></dd></div>
      </dl>
      ${anyMissing ? `<p class="fine warn-text">${ICON.warn} Some items have no kcal or protein, so those averages leave them out.</p>` : ''}
    </section>

    <section class="card cal">
      <header class="card__head cal__head">
        <button class="icon-btn" data-cal="-1" aria-label="Previous month">${ICON.left}</button>
        <h2>${calTitle()}</h2>
        <button class="icon-btn" data-cal="1" aria-label="Next month">${ICON.right}</button>
      </header>
      <div class="cal__grid" role="grid">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span class="cal__dow">${d.slice(0, 2)}</span>`).join('')}
        ${calCells()}
      </div>
      <dl class="streak-row">
        <div><dt>Current streak</dt><dd class="num">${sk.current}</dd></div>
        <div><dt>Best streak</dt><dd class="num">${sk.best}</dd></div>
        <div><dt>Completed this cycle</dt><dd class="num">${sk.completedThisCycle}</dd></div>
      </dl>
      <div class="badges" aria-label="Badges">
        ${badges.map((b) => `<div class="badge${b.date ? ' is-earned' : ''}"><span class="badge__mark">${b.date ? ICON.check : ''}</span><span class="badge__label">${esc(b.label)}</span><span class="badge__date num">${b.date ? fmtDate(b.date) : 'not yet'}</span></div>`).join('')}
      </div>
    </section>`;

  root.querySelectorAll('[data-date]').forEach((b) => b.addEventListener('click', () => { ctx.setDate(b.dataset.date); ctx.go('today'); }));
  root.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', () => {
    const [y, m] = calMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + Number(b.dataset.cal), 1);
    calMonth = isoDate(d).slice(0, 7); ctx.rerender();
  }));
  root.querySelectorAll('[data-cell]').forEach((b) => b.addEventListener('click', () => dayDetail(b.dataset.cell)));
  requestAnimationFrame(() => {
    const sel = root.querySelector('.strip__day.is-sel') || root.querySelector('.strip__day.is-today');
    sel?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });
  });
}

function calTitle() {
  const [y, m] = calMonth.split('-').map(Number);
  return `${fmtMonth(m - 1)} <span class="num">${y}</span>`;
}

function calCells() {
  const [y, m] = calMonth.split('-').map(Number);
  const first = `${calMonth}-01`;
  const lead = (dow(first) + 6) % 7;
  const n = new Date(y, m, 0).getDate();
  const t = today();
  let out = '';
  for (let i = 0; i < lead; i++) out += '<span class="cal__cell is-blank"></span>';
  for (let d = 1; d <= n; d++) {
    const date = `${calMonth}-${String(d).padStart(2, '0')}`;
    const p = M.progress(date);
    const pct = p.planned ? p.done / p.planned : 0;
    const cls = ['cal__cell', date === t ? 'is-today' : '', p.planned === 0 ? 'is-neutral' : '', p.complete ? 'is-complete' : '', date > t ? 'is-future' : ''].join(' ');
    out += `<button class="${cls}" data-cell="${date}" aria-label="${fmtDate(date, { dow: true })}: ${p.planned ? `${Math.round(pct * 100)}% done` : 'nothing planned'}">
      ${p.planned ? miniRing(pct, 36, p.complete) : ''}<span class="cal__n num">${d}</span></button>`;
  }
  return out;
}

function dayDetail(date) {
  const C = M.cycle();
  const p = M.progress(date);
  const ticks = Object.values(store.get().ticks?.[date] || {});
  const sets = M.loggedSets().filter((s) => s.date === date);
  const e = M.eaten(date);
  const byEx = new Map();
  sets.forEach((s) => { if (!byEx.has(s.name)) byEx.set(s.name, []); byEx.get(s.name).push(s); });
  const html = `
    <p class="detail__meta"><span>${p.planned ? `<span class="num">${p.done}/${p.planned}</span> planned items done` : 'Nothing planned'}</span>${p.complete ? '<span class="green-text">Complete</span>' : ''}</p>
    ${ticks.length ? `<h3 class="h3">Ticked</h3><ul class="plain-list">${ticks.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((x) => `<li><span class="num muted">${esc(x.time || '')}</span> ${esc(x.title)}${x.type === 'meal' ? `<small>${x.items.map((i) => `${esc(i.name)} <span class="num">${fmtKg(i.eaten_g)} g</span>`).join(', ')}</small>` : ''}</li>`).join('')}</ul>` : ''}
    ${e.meals ? `<p class="macros"><span><span class="num">${fmtNum(e.kcal)}</span> kcal eaten</span><span><span class="num">${fmtNum(e.protein, 1)}</span> g protein</span></p>` : ''}
    ${sets.length ? `<h3 class="h3">Sets</h3><ul class="plain-list">${[...byEx].map(([n, arr]) => `<li>${esc(n)}<small class="num">${arr.map((s) => `${s.reps ?? '?'} × ${s.load != null ? fmtKg(s.load) + ' kg' : 'no load'}`).join(', ')}</small></li>`).join('')}</ul>` : ''}
    ${!ticks.length && !sets.length ? `<p class="muted">Nothing ticked on this day.</p>` : ''}
    ${C.day(date) ? `<button class="btn btn--ghost btn--block" data-open-day="${date}">Open this day</button>` : ''}`;
  const body = openSheet(html, { title: fmtDate(date, { dow: true }) });
  body.querySelector('[data-open-day]')?.addEventListener('click', () => { ctxRef.setDate(date); ctxRef.go('today'); });
}

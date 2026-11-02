import * as M from '../model.js';
import { slotKey } from '../data.js';
import { esc, fmtNum, fmtKg, fmtDate, fmtDow, parseDate, fmtMonth, today, addDays, daysBetween, isNum, num, haptic } from '../util.js';
import { ringHTML, animateRings, openSheet, toast, ICON } from '../ui.js';
import { barChart, progressBar } from '../charts.js';
import { openCook } from '../cook.js';
import { head, warningBlock, backupBanner, recapBlock } from './common.js';

const editing = new Set();     // `${date}|${slotKey}` rows with gram inputs open
let justTicked = null;
const TYPE_LABEL = { meal: 'Meal', gym: 'Training', cook: 'Cook', freezer: 'Freezer', note: 'Note' };
const tickable = (s) => s.type === 'meal' || s.type === 'cook' || s.type === 'freezer';

export function renderToday(root, ctx) {
  const C = M.cycle(); const date = ctx.date; const t = today();
  const d = parseDate(date);
  const slots = C.slots(date);
  const e = M.eaten(date);
  const sk = M.streaks();
  const dayN = C.start && C.end && C.inCycle(date) ? daysBetween(C.start, date) + 1 : null;
  const dayY = C.start && C.end ? daysBetween(C.start, C.end) + 1 : null;
  const ses = C.session(date);
  const sp = M.sessionProgress(date);
  const prog = M.progress(date);
  const next = date === t ? nextUp(date, slots, sp) : null;

  root.innerHTML = `
    ${head(ctx, `<span class="streak" title="Days in a row with everything planned done">Streak <strong>${sk.current}</strong> day${sk.current === 1 ? '' : 's'}</span>`)}
    <section class="dayhead">
      <div class="dayhead__row">
        <h1 class="display"><span class="dayhead__dow">${fmtDow(date)}</span>${d.getDate()} ${fmtMonth(d.getMonth())}</h1>
        <div class="dayhead__nav">
          <button class="icon-btn" data-act="prev" aria-label="Previous day">${ICON.left}</button>
          <button class="icon-btn" data-act="next" aria-label="Next day">${ICON.right}</button>
        </div>
      </div>
      <p class="dayhead__meta">
        <span>${esc(C.name ?? 'cycle_name missing')}</span>
        ${dayN ? `<span>Day ${dayN} of ${dayY}</span>` : `<span>${C.inCycle(date) ? '' : 'Outside this cycle'}</span>`}
        ${date !== t ? `<button class="link" data-act="today">Back to today</button>` : ''}
      </p>
    </section>
    ${backupBanner()}
    ${warningBlock(ctx)}
    <section class="hero hero--rings" aria-label="Eaten">
      ${ringHTML({ id: 'kcal', value: e.kcal ?? 0, target: C.kcalTarget, unit: 'kcal', label: 'Energy' })}
      ${ringHTML({ id: 'protein', value: e.protein ?? 0, target: C.proteinTarget, unit: 'g', label: 'Protein', dp: 1 })}
    </section>
    ${e.partial ? `<p class="fine warn-text">${ICON.warn} Some ticked items have no kcal or protein in cycle.json, so they are not counted.</p>` : ''}
    ${prog.planned ? `<div class="dayprog">${progressBar(prog.done, prog.planned, { label: 'Planned items done today' })}<span>${prog.done} of ${prog.planned} done</span></div>` : ''}
    ${prog.complete ? `<p class="complete-line" data-complete>Day complete</p>`
      : next ? `<p class="nextup"><span class="nextup__label">Next up</span><span class="nextup__time">${esc(next.time ?? '')}</span><span>${esc(next.title ?? '')}</span></p>` : ''}
    <section class="timeline" aria-label="Plan for ${fmtDate(date, { dow: true, long: true })}">
      ${slots.length ? `<ol class="rows">${slots.map((s, i) => row(date, s, i, ses, sp)).join('')}</ol>`
        : `<p class="quiet">${C.inCycle(date) ? 'Nothing planned for this day.' : 'This date is outside the cycle.'}</p>`}
      ${ses && !slots.some((s) => s.type === 'gym') ? `<button class="btn btn--line" data-act="train">Open ${ses.kind === 'run' ? 'run' : 'training'}</button>` : ''}
    </section>
    ${weekBlock(date, C)}
    ${M.isRecapDay(date) && (prog.planned || M.logDates().length) ? recapBlock(M.weekRecap(date)) : ''}
  `;
  animateRings(root);
  if (justTicked) { root.querySelector(`[data-key="${CSS.escape(justTicked)}"]`)?.classList.add('just'); justTicked = null; }
  bind(root, ctx, slots);
}

// this week, Monday to Sunday: what you ate each day against the targets
function weekBlock(date, C) {
  const days = M.weekNutrition(date);
  if (!days.some((d) => d.kcal != null)) return '';
  const idx = days.findIndex((d) => d.date === date);
  const bars = (key) => days.map((d) => ({ key: d.date, label: fmtDow(d.date, true).slice(0, 2), stack: [{ v: d[key] ?? 0, name: key }] }));
  const logged = days.filter((d) => d.kcal != null);
  const avgK = logged.reduce((a, d) => a + d.kcal, 0) / logged.length;
  const avgP = logged.reduce((a, d) => a + d.protein, 0) / logged.length;
  return `
    <section class="panel week" aria-label="This week" data-chart="week">
      <h2 class="h2">This week</h2>
      <p class="sub">Average over ${logged.length} day${logged.length === 1 ? '' : 's'} with ticked meals: ${fmtNum(avgK)} kcal, ${fmtNum(avgP, 1)} g protein</p>
      <div class="week__grid">
        <figure><figcaption>Energy, kcal</figcaption>${barChart({ bars: bars('kcal'), highlight: idx, target: C.kcalTarget, height: 150, label: 'kcal per day this week' })}</figure>
        <figure><figcaption>Protein, g</figcaption>${barChart({ bars: bars('protein'), highlight: idx, target: C.proteinTarget, height: 150, label: 'Protein per day this week' })}</figure>
      </div>
      <p class="fine">Dashed line: your daily target.</p>
    </section>`;
}

function nextUp(date, slots, sp) {
  return slots.find((s) => (tickable(s) && !M.tick(date, s)) || (s.type === 'gym' && sp && sp.done < sp.planned)) || null;
}

function row(date, s, i, ses, sp) {
  const key = slotKey(s);
  const tk = M.tick(date, s);
  let done = !!tk;
  let body = '';
  if (s.type === 'meal') {
    const items = Array.isArray(s.items) ? s.items : [];
    const open = editing.has(`${date}|${key}`);
    let kc = 0, pr = 0, miss = false;
    const lines = items.map((it, k) => {
      const g = M.gramsFor(date, s, k);
      const edited = M.editedGrams(date, s, k) != null && M.editedGrams(date, s, k) !== it?.grams;
      const sc = M.scaled(it, g);
      if (isNum(sc.kcal)) kc += sc.kcal; else miss = true;
      if (isNum(sc.protein)) pr += sc.protein; else miss = true;
      return `<li><span>${esc(it?.name ?? 'Unnamed item')}</span>${open
        ? `<label class="grams"><input type="text" inputmode="decimal" value="${isNum(g) ? g : ''}" data-grams="${k}" data-focus-key="g:${esc(date)}:${esc(key)}:${k}" aria-label="Grams of ${esc(it?.name)} eaten"><span>g</span></label>`
        : `<span class="${edited ? 'is-edited' : ''}">${isNum(g) ? fmtKg(g) : '?'} g${edited ? ` <small>of ${fmtKg(it.grams)}</small>` : ''}</span>`}</li>`;
    }).join('');
    body = `<ul class="portions">${lines}</ul>
      <p class="row__foot"><span>${fmtNum(kc)} kcal, ${fmtNum(pr, 1)} g protein${miss ? ' <span class="warn-text">(numbers missing)</span>' : ''}</span>
      <button class="link" data-act="grams">${open ? 'Done' : 'Edit grams'}</button></p>`;
  } else if (s.type === 'gym') {
    done = !!sp && sp.planned > 0 && sp.done >= sp.planned;
    body = !ses ? `<p class="row__sub">No session for this date in cycle.json.</p>`
      : ses.kind === 'run' ? `<p class="row__sub">${ses.distance_km ? `${fmtKg(ses.distance_km)} km planned. ` : ''}${M.runRec(date) ? 'Run logged.' : 'Tap to log the run.'}</p>`
        : `<p class="row__sub">${sp.done} of ${sp.planned} sets. Tap to open.</p>`;
  } else if (s.type === 'cook') {
    const r = s.recipe_id ? M.cycle().recipe(s.recipe_id) : null;
    body = `${s.notes ? `<p class="row__sub">${esc(s.notes)}</p>` : ''}
      ${r ? `<button class="btn btn--line btn--sm" data-act="cook">Cook mode</button>` : s.recipe_id ? `<p class="fine warn-text">Recipe "${esc(s.recipe_id)}" is not in cycle.json.</p>` : ''}`;
  } else if (s.notes) body = `<p class="row__sub">${esc(s.notes)}</p>`;

  const canTick = tickable(s);
  return `
    <li class="row slot slot--${esc(s.type)}${done ? ' is-done' : ''}" data-key="${esc(key)}" data-i="${i}">
      <span class="row__time">${esc(s.time ?? '')}</span>
      <div class="row__main">
        <p class="row__kind">${esc(TYPE_LABEL[s.type] ?? s.type ?? '')}</p>
        <h3 class="row__title">${esc(s.title ?? 'Untitled')}</h3>
        ${body}
      </div>
      ${canTick ? `<button class="tick${done ? ' is-on' : ''}" data-act="tick" aria-pressed="${done}" aria-label="${done ? 'Untick' : 'Tick'} ${esc(s.title ?? '')}">${ICON.check}</button>`
        : s.type === 'gym' ? `<span class="tick tick--static${done ? ' is-on' : ''}" aria-hidden="true">${ICON.check}</span>` : '<span></span>'}
    </li>`;
}

function doTick(ctx, date, s) {
  if (date > today()) { toast(`You can tick this on ${fmtDate(date, { dow: true })}.`); return; }
  const before = ctx.before(date);
  const on = !M.tick(date, s);
  M.setTick(date, s, on);
  haptic(on ? 12 : 6);
  if (on) justTicked = slotKey(s);
  ctx.afterChange(date, before);
}

function bind(root, ctx, slots) {
  const date = ctx.date; const C = M.cycle();
  root.querySelector('[data-act="prev"]').onclick = () => ctx.setDate(addDays(date, -1), -1);
  root.querySelector('[data-act="next"]').onclick = () => ctx.setDate(addDays(date, 1), 1);
  root.querySelector('[data-act="today"]')?.addEventListener('click', () => ctx.setDate(today()));
  root.querySelector('[data-act="train"]')?.addEventListener('click', () => ctx.go('train'));

  root.querySelectorAll('.slot').forEach((li) => {
    const s = slots[Number(li.dataset.i)];
    const key = slotKey(s);
    li.querySelector('[data-act="tick"]')?.addEventListener('click', (ev) => { ev.stopPropagation(); doTick(ctx, date, s); });
    li.querySelector('[data-act="grams"]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const k = `${date}|${key}`;
      editing.has(k) ? editing.delete(k) : editing.add(k);
      ctx.rerender();
      if (editing.has(k)) root.querySelector(`[data-key="${CSS.escape(key)}"] input`)?.focus();
    });
    li.querySelectorAll('[data-grams]').forEach((inp) => {
      ['click', 'pointerdown', 'pointerup'].forEach((t) => inp.addEventListener(t, (ev) => ev.stopPropagation()));
      inp.addEventListener('change', () => {
        const before = ctx.before(date);
        const v = num(inp.value);
        M.setGrams(date, s, Number(inp.dataset.grams), v != null && v >= 0 ? v : null);
        ctx.afterChange(date, before, { keepFocus: true });
      });
    });
    li.querySelector('[data-act="cook"]')?.addEventListener('click', (ev) => { ev.stopPropagation(); const r = C.recipe(s.recipe_id); if (r) openCook(r); });

    // tap the row = tick (or open training); long press = detail
    let timer = null, longFired = false, sx = 0, sy = 0, moved = false;
    li.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button, input, label, a')) return;
      longFired = false; moved = false; sx = ev.clientX; sy = ev.clientY;
      li.classList.add('is-pressing');
      timer = setTimeout(() => { longFired = true; li.classList.remove('is-pressing'); haptic(12); detail(ctx, date, s); }, 480);
    });
    li.addEventListener('pointermove', (ev) => {
      if (timer && (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10)) { moved = true; clearTimeout(timer); timer = null; li.classList.remove('is-pressing'); }
    });
    const cancel = () => { clearTimeout(timer); timer = null; li.classList.remove('is-pressing'); };
    li.addEventListener('pointercancel', () => { moved = true; cancel(); });
    li.addEventListener('pointerleave', cancel);
    li.addEventListener('contextmenu', (ev) => ev.preventDefault());
    li.addEventListener('pointerup', (ev) => {
      const wasTimer = !!timer; cancel();
      if (longFired || moved || !wasTimer || ev.target.closest('button, input, label, a')) return;
      if (s.type === 'gym') { ctx.go('train'); return; }
      if (tickable(s)) doTick(ctx, date, s);
    });
  });

  // swipe to change day
  let tx = null, ty = 0;
  root.addEventListener('touchstart', (e) => { if (e.target.closest('input, .chart')) { tx = null; return; } tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) ctx.setDate(addDays(date, dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
}

function detail(ctx, date, s) {
  const C = M.cycle();
  const tk = M.tick(date, s);
  const items = Array.isArray(s.items) ? s.items : [];
  const r = s.recipe_id ? C.recipe(s.recipe_id) : null;
  const html = `
    <p class="sub">${esc(s.time ?? '')} ${esc(TYPE_LABEL[s.type] ?? s.type)}, ${fmtDate(date, { dow: true, long: true })}</p>
    ${items.length ? `
      <table class="tbl">
        <thead><tr><th>Item</th><th class="r">Planned</th><th class="r">kcal</th><th class="r">Protein</th></tr></thead>
        <tbody>${items.map((it) => `
          <tr><td>${esc(it?.name)}${it?.item_id ? `<small>${esc(it.item_id)}</small>` : ''}</td>
          <td class="r">${isNum(it?.grams) ? fmtKg(it.grams) + ' g' : 'missing'}</td>
          <td class="r">${isNum(it?.kcal) ? fmtNum(it.kcal) : 'missing'}</td>
          <td class="r">${isNum(it?.protein_g) ? fmtNum(it.protein_g, 1) + ' g' : 'missing'}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="fine">kcal and protein are for the planned portion. Eating a different amount scales them: kcal × grams eaten ÷ planned grams.</p>` : ''}
    ${s.notes ? `<p>${esc(s.notes)}</p>` : ''}
    ${tk ? `<div class="done-box"><p><strong>Ticked at ${new Date(tk.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</strong></p>
      ${tk.type === 'meal' ? `<p>${tk.items.map((i) => `${esc(i.name)} ${fmtKg(i.eaten_g)} g`).join(', ')}</p><p>${fmtNum(tk.kcal)} kcal, ${fmtNum(tk.protein, 1)} g protein</p>` : ''}</div>` : ''}
    ${r ? `<h3 class="h3">${esc(r.title)}</h3><ol class="steps">${r.steps.map((st) => `<li>${esc(st.text)}${isNum(st.timer_seconds) ? ` <small>${Math.round(st.timer_seconds / 60)} min timer</small>` : ''}${st.doneness_test ? `<div class="doneness">${esc(st.doneness_test)}</div>` : ''}</li>`).join('')}</ol>
      <button class="btn btn--gold btn--block" data-cook>Cook mode</button>` : ''}`;
  const body = openSheet(html, { title: s.title ?? 'Details' });
  body.querySelector('[data-cook]')?.addEventListener('click', () => openCook(r));
}

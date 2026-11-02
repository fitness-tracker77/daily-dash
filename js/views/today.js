import * as M from '../model.js';
import { slotKey } from '../data.js';
import { esc, fmtNum, fmtKg, fmtDate, fmtDow, parseDate, fmtMonth, today, addDays, daysBetween, isNum, haptic } from '../util.js';
import { ringHTML, animateRings, openSheet, toast, ICON } from '../ui.js';
import { openCook } from '../cook.js';
import { topbar, recapCard, warningCard } from './common.js';

const openEditors = new Set();
let justTicked = null;

const TYPE = {
  meal: { label: 'Meal', icon: ICON.meal },
  gym: { label: 'Training', icon: ICON.training },
  cook: { label: 'Cook', icon: ICON.pot },
  freezer: { label: 'Freezer', icon: ICON.snow },
  note: { label: 'Note', icon: ICON.note },
};

export function renderToday(root, ctx) {
  const C = M.cycle(); const date = ctx.date; const t = today();
  const d = parseDate(date);
  const slots = C.slots(date);
  const e = M.eaten(date);
  const sk = M.streaks();
  const inC = C.inCycle(date) && C.start && C.end;
  const dayN = inC ? daysBetween(C.start, date) + 1 : null;
  const dayY = C.start && C.end ? daysBetween(C.start, C.end) + 1 : null;
  const streakCls = sk.current >= 7 ? 'is-hot' : sk.current >= 3 ? 'is-warm' : '';
  const ses = C.session(date);
  const sp = M.sessionProgress(date);

  root.innerHTML = `
    ${topbar(ctx, `<span class="streak-chip ${streakCls}" title="Current streak">${ICON.flame}<span class="num">${sk.current}</span><span>day${sk.current === 1 ? '' : 's'}</span></span>`)}
    <header class="hero">
      <div class="hero__nav">
        <button class="icon-btn" data-act="prev" aria-label="Previous day">${ICON.left}</button>
        <h1 class="hero__date"><span class="hero__dow">${fmtDow(date)}</span><span class="hero__dm${`${d.getDate()} ${fmtMonth(d.getMonth())}`.length > 10 ? ' is-long' : ''}">${d.getDate()} ${fmtMonth(d.getMonth())}</span></h1>
        <button class="icon-btn" data-act="next" aria-label="Next day">${ICON.right}</button>
      </div>
      <p class="hero__meta">
        <span>${esc(C.name ?? 'Cycle name missing')}</span>
        ${dayN ? `<span>Day <span class="num">${dayN}</span> of <span class="num">${dayY}</span></span>` : `<span>${C.inCycle(date) ? '' : 'Outside this cycle'}</span>`}
      </p>
      ${date !== t ? `<button class="chip chip--btn" data-act="today">Back to today</button>` : ''}
    </header>
    ${warningCard(ctx)}
    <section class="rings" aria-label="Eaten today">
      ${ringHTML({ id: `kcal`, value: e.kcal, target: C.kcalTarget, unit: 'kcal', label: 'Energy', tone: 'accent' })}
      ${ringHTML({ id: `protein`, value: e.protein, target: C.proteinTarget, unit: 'g', label: 'Protein', tone: 'bronze', dp: 1 })}
    </section>
    ${e.partial ? `<p class="fine warn-text">${ICON.warn} Some ticked items have no kcal or protein in cycle.json, so they are not counted.</p>` : ''}
    ${M.isRecapDay(date) ? recapCard(M.weekRecap(date)) : ''}
    <section class="timeline" aria-label="Plan for the day">
      ${slots.length ? `<ol>${slots.map((s, i) => slotHTML(date, s, i, ses, sp)).join('')}</ol>`
        : `<div class="empty"><p>${C.inCycle(date) ? 'Nothing planned for this day in cycle.json.' : 'This date is outside the cycle in cycle.json.'}</p></div>`}
    </section>
    ${ses && !slots.some((s) => s.type === 'gym') ? `<button class="btn btn--ghost btn--block" data-act="training">Open training session</button>` : ''}
  `;
  animateRings(root);
  if (justTicked) { root.querySelector(`[data-key="${CSS.escape(justTicked)}"]`)?.classList.add('just-ticked'); justTicked = null; }
  bind(root, ctx, slots);
}

function slotHTML(date, s, i, ses, sp) {
  const key = slotKey(s);
  const ty = TYPE[s.type] || { label: s.type || 'Item', icon: ICON.note };
  const tk = M.tick(date, s);
  const tickable = s.type === 'meal' || s.type === 'cook' || s.type === 'freezer';
  let done = !!tk;
  let body = '';
  if (s.type === 'meal') {
    const items = Array.isArray(s.items) ? s.items : [];
    const editing = openEditors.has(`${date}|${key}`);
    let kc = 0, pr = 0, miss = false;
    const rows = items.map((it, k) => {
      const g = M.gramsFor(date, s, k);
      const edited = M.editedGrams(date, s, k) != null;
      const sc = M.scaled(it, g);
      if (isNum(sc.kcal)) kc += sc.kcal; else miss = true;
      if (isNum(sc.protein)) pr += sc.protein; else miss = true;
      return `<li>
        <span class="item__name">${esc(it?.name ?? 'Unnamed item')}</span>
        ${editing
          ? `<label class="gram-input"><input type="number" inputmode="decimal" min="0" step="1" value="${isNum(g) ? g : ''}" data-grams="${k}" data-focus-key="g:${esc(key)}:${k}" aria-label="Grams of ${esc(it?.name)}"><span>g</span></label>`
          : `<span class="num item__g${edited ? ' is-edited' : ''}">${isNum(g) ? fmtKg(g) : '—'} g</span>`}
      </li>`;
    }).join('');
    body = `
      <ul class="slot__items">${rows}</ul>
      <div class="slot__foot">
        <p class="macros"><span><span class="num">${fmtNum(kc)}</span> kcal</span><span><span class="num">${fmtNum(pr, 1)}</span> g protein</span>${miss ? `<span class="warn-text" title="Some numbers are missing in cycle.json">incomplete</span>` : ''}</p>
        <button class="link-btn" data-act="grams">${editing ? 'Done' : 'Edit grams'}</button>
      </div>
      ${editing ? `<button class="link-btn link-btn--muted" data-act="reset-grams">Reset to planned</button>` : ''}`;
  } else if (s.type === 'gym') {
    done = !!sp && sp.planned > 0 && sp.done >= sp.planned;
    body = ses
      ? `<p class="slot__sub">${esc(ses.title || '')} <span class="num">${sp.done}/${sp.planned}</span> sets</p><button class="btn btn--ghost btn--sm" data-act="training">Open session</button>`
      : `<p class="slot__sub">No session for this date in cycle.json.</p>`;
  } else if (s.type === 'cook') {
    const r = s.recipe_id ? M.cycle().recipe(s.recipe_id) : null;
    body = `${s.notes ? `<p class="slot__sub">${esc(s.notes)}</p>` : ''}
      ${r ? `<button class="btn btn--accent btn--sm" data-act="cook">${ICON.pot} Cook mode</button>` : s.recipe_id ? `<p class="fine warn-text">Recipe "${esc(s.recipe_id)}" not found in cycle.json.</p>` : ''}`;
  } else if (s.notes) {
    body = `<p class="slot__sub">${esc(s.notes)}</p>`;
  }
  return `
    <li class="slot slot--${esc(s.type)}${done ? ' is-done' : ''}" data-key="${esc(key)}" data-i="${i}">
      <div class="slot__rail"><span class="slot__time num">${esc(s.time ?? '')}</span><span class="slot__dot"></span></div>
      <article class="slot__card${tickable ? ' is-tickable' : ''}" data-card>
        <header class="slot__head">
          <span class="slot__type">${ty.icon}${ty.label}</span>
          ${tickable ? `<span class="tick" aria-hidden="true">${ICON.check}</span>` : s.type === 'gym' && done ? `<span class="tick" aria-hidden="true">${ICON.check}</span>` : ''}
        </header>
        <h3 class="slot__title">${esc(s.title ?? 'Untitled')}</h3>
        ${body}
      </article>
    </li>`;
}

function bind(root, ctx, slots) {
  const date = ctx.date; const C = M.cycle();
  root.querySelector('[data-act="prev"]').onclick = () => ctx.setDate(addDays(date, -1), -1);
  root.querySelector('[data-act="next"]').onclick = () => ctx.setDate(addDays(date, 1), 1);
  root.querySelector('[data-act="today"]')?.addEventListener('click', () => ctx.setDate(today()));
  root.querySelectorAll('[data-act="training"]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); ctx.go('training'); }));

  root.querySelectorAll('.slot').forEach((li) => {
    const s = slots[Number(li.dataset.i)];
    const card = li.querySelector('[data-card]');
    const key = slotKey(s);
    const tickable = card.classList.contains('is-tickable');

    li.querySelector('[data-act="grams"]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const k = `${date}|${key}`;
      openEditors.has(k) ? openEditors.delete(k) : openEditors.add(k);
      ctx.rerender();
      if (openEditors.has(k)) root.querySelector(`[data-key="${CSS.escape(key)}"] input`)?.focus();
    });
    li.querySelector('[data-act="reset-grams"]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      (s.items || []).forEach((_, k) => M.setGrams(date, s, k, null));
      ctx.afterChange(date, ctx.before(date));
    });
    li.querySelectorAll('[data-grams]').forEach((inp) => {
      inp.addEventListener('click', (ev) => ev.stopPropagation());
      inp.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      inp.addEventListener('change', () => {
        const before = ctx.before(date);
        const v = inp.value === '' ? null : Number(inp.value);
        M.setGrams(date, s, Number(inp.dataset.grams), isNum(v) && v >= 0 ? v : null);
        ctx.afterChange(date, before, { keepFocus: true });
      });
    });
    li.querySelector('[data-act="cook"]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const r = C.recipe(s.recipe_id); if (r) openCook(r);
    });

    // tap = tick, long press = details
    let timer = null, longFired = false, sx = 0, sy = 0, moved = false;
    card.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button, input, label')) return;
      longFired = false; moved = false; sx = ev.clientX; sy = ev.clientY;
      card.classList.add('is-pressing');
      timer = setTimeout(() => { longFired = true; card.classList.remove('is-pressing'); haptic(15); details(date, s); }, 480);
    });
    card.addEventListener('pointermove', (ev) => {
      if (timer && (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10)) { moved = true; clearTimeout(timer); timer = null; card.classList.remove('is-pressing'); }
    });
    const cancel = () => { clearTimeout(timer); timer = null; card.classList.remove('is-pressing'); };
    card.addEventListener('pointercancel', () => { moved = true; cancel(); });
    card.addEventListener('pointerleave', cancel);
    card.addEventListener('contextmenu', (ev) => ev.preventDefault());
    card.addEventListener('pointerup', (ev) => {
      const wasTimer = !!timer; cancel();
      if (longFired || moved || !wasTimer || ev.target.closest('button, input, label')) return;
      if (s.type === 'gym') { ctx.go('training'); return; }
      if (!tickable) return;
      if (date > today()) { toast(`You can tick this on ${fmtDate(date, { dow: true })}.`); return; }
      const before = ctx.before(date);
      const on = !M.tick(date, s);
      M.setTick(date, s, on);
      if (on) { haptic(12); justTicked = key; } else haptic(6);
      ctx.afterChange(date, before);
    });
  });

  // swipe to change day
  let tx = null, ty = 0;
  root.addEventListener('touchstart', (e) => { if (e.target.closest('input')) return; tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) ctx.setDate(addDays(date, dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
}

function details(date, s) {
  const C = M.cycle();
  const tk = M.tick(date, s);
  const items = Array.isArray(s.items) ? s.items : [];
  const r = s.recipe_id ? C.recipe(s.recipe_id) : null;
  const html = `
    <p class="detail__meta"><span class="num">${esc(s.time ?? '')}</span><span>${esc(TYPE[s.type]?.label ?? s.type)}</span><span>${fmtDate(date, { dow: true })}</span></p>
    ${items.length ? `
      <table class="table">
        <thead><tr><th>Item</th><th class="r">Planned</th><th class="r">kcal</th><th class="r">Protein</th></tr></thead>
        <tbody>${items.map((it, k) => `
          <tr><td>${esc(it?.name)}${it?.item_id ? `<small class="muted"> ${esc(it.item_id)}</small>` : ''}${M.editedGrams(date, s, k) != null ? `<small class="accent-text"> eating ${fmtKg(M.editedGrams(date, s, k))} g</small>` : ''}</td>
          <td class="r num">${isNum(it?.grams) ? fmtKg(it.grams) + ' g' : '—'}</td>
          <td class="r num">${isNum(it?.kcal) ? fmtNum(it.kcal) : 'missing'}</td>
          <td class="r num">${isNum(it?.protein_g) ? fmtNum(it.protein_g, 1) : 'missing'}</td></tr>`).join('')}
        </tbody>
      </table>` : ''}
    ${s.notes ? `<p>${esc(s.notes)}</p>` : ''}
    ${tk ? `<div class="detail__done"><strong>Ticked ${new Date(tk.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
      ${tk.type === 'meal' ? `<p>Eaten: ${tk.items.map((i) => `${esc(i.name)} <span class="num">${fmtKg(i.eaten_g)} g</span>`).join(', ')}</p>
      <p><span class="num">${fmtNum(tk.kcal)}</span> kcal, <span class="num">${fmtNum(tk.protein, 1)}</span> g protein</p>` : ''}</div>` : ''}
    ${r ? `<h3 class="h3">${esc(r.title)}</h3><ol class="steps">${r.steps.map((st) => `<li>${esc(st.text)}${isNum(st.timer_seconds) ? ` <span class="chip num">${Math.round(st.timer_seconds / 60)} min</span>` : ''}${st.doneness_test ? `<div class="test-box">${esc(st.doneness_test)}</div>` : ''}</li>`).join('')}</ol>
      <button class="btn btn--accent btn--block" data-cook>${ICON.pot} Cook mode</button>` : ''}`;
  const body = openSheet(html, { title: s.title ?? 'Details' });
  body.querySelector('[data-cook]')?.addEventListener('click', () => openCook(r));
}

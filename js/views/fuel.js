import * as M from '../model.js';
import { esc, fmtKg, fmtDate, isNum, num, haptic } from '../util.js';
import { openSheet, closeSheet, toast } from '../ui.js';
import { donut, haveNeed } from '../charts.js';
import { head } from './common.js';

const recounting = new Set();

const qty = (r) => (isNum(r.quantity) ? `${fmtKg(r.quantity)} ${esc(r.unit)}` : 'quantity missing');
const label = (src, asOf) => (src ? `${src}${asOf ? ` ${fmtDate(asOf)}` : ''}` : 'no count');

export function renderFuel(root, ctx) {
  const C = M.cycle();
  const board = M.pantryBoard();
  const plan = M.remainingPlan();
  const shop = M.shoppingList();
  const toBuy = shop.rows.length;
  const covered = board.filter((r) => isNum(r.need) && !r.short).length;
  const short = board.filter((r) => r.short).length;
  const other = board.length - covered - short;

  root.innerHTML = `
    ${head(ctx, '<span>Fuel</span>')}
    <section class="hero hero--split" aria-label="Shopping">
      <div>
        <p class="hero__figure figure${toBuy ? ' is-warm' : ''}" data-hero>${toBuy}</p>
        <p class="hero__label">${toBuy === 1 ? 'item' : 'items'} to buy for the rest of the cycle</p>
        <p class="hero__sub">${plan.days ? `${plan.days} day${plan.days === 1 ? '' : 's'} left, today to ${fmtDate(plan.to)}` : 'The cycle has ended.'}</p>
      </div>
      ${board.length ? `<div class="hero__graphic">${donut({ segments: [{ label: 'Covered', v: covered, gold: true }, { label: 'Short', v: short }, { label: 'No planned use', v: other }], tones: [0, 1, 3], size: 128, center: `${covered}/${board.length}`, sub: 'covered', label: 'Pantry items covered for the rest of the cycle' })}</div>` : ''}
    </section>

    <section class="panel" aria-label="Pantry">
      <h2 class="h2">Pantry</h2>
      <p class="sub">What you have, against what the rest of the plan needs.</p>
      <ul class="rows board">${board.map(boardRow).join('') || '<li class="quiet">No pantry list in cycle.json.</li>'}</ul>
    </section>

    <section class="panel" aria-label="Shopping list">
      <h2 class="h2">Shopping list</h2>
      <p class="sub">${shop.days ? `Planned use from today to ${fmtDate(shop.to)} minus what you have. Shortfalls only.` : 'The cycle has ended.'}</p>
      ${shop.rows.length ? `<ul class="rows shop">${shop.rows.map(shopRow).join('')}</ul>` : `<p class="quiet">${shop.days ? 'Nothing is short for the rest of the cycle.' : ''}</p>`}
      ${shop.untracked.length ? `<p class="fine">Not tracked (no item_id): ${shop.untracked.map(esc).join(', ')}.</p>` : ''}
    </section>`;
  bind(root, ctx);
}

function boardRow(r) {
  const open = recounting.has(r.id);
  const needTxt = r.noUse ? 'no planned use for the rest of the cycle'
    : r.noConversion ? `${esc(r.unit)} needs grams_per_unit to compare`
      : `needs ${fmtKg(r.need)} ${esc(r.unit)} for the rest of the cycle`;
  return `
    <li class="row board__row${r.short ? ' is-short' : ''}" data-item="${esc(r.id)}">
      <div class="board__main" data-open="${esc(r.id)}" role="button" tabindex="0" aria-label="${esc(r.name)} details">
        <span class="board__name">${esc(r.name)}</span>
        <span class="board__qty"><strong>${qty(r)}</strong><span class="board__src">, ${label(r.source, r.as_of)}</span></span>
        ${haveNeed(r.quantity, r.need)}
        <span class="board__need${r.short ? ' is-warm' : ''}">${needTxt}</span>
      </div>
      <div class="board__side">${open ? '' : `<button class="link" data-recount="${esc(r.id)}">Recount</button>`}</div>
      ${open ? `<form class="inline-form" data-recount-form="${esc(r.id)}">
        <label class="box box--wide"><input type="text" inputmode="decimal" name="q" placeholder="measured" aria-label="Measured ${esc(r.name)} in ${esc(r.unit)}" data-focus-key="rc:${esc(r.id)}"><span>${esc(r.unit)}</span></label>
        <button class="btn btn--gold btn--sm" type="submit">Save count</button>
        <button class="link" type="button" data-recount-cancel="${esc(r.id)}">Cancel</button></form>` : ''}
    </li>`;
}

function shopRow(r) {
  if (r.notInPantry) return `<li class="row shop__row"><span>${esc(r.name)}</span><span class="shop__amt">${fmtKg(r.grams)} g planned</span><span class="shop__basis">not in pantry list</span></li>`;
  if (r.noConversion) return `<li class="row shop__row"><span>${esc(r.name)}</span><span class="shop__amt">${fmtKg(r.grams)} g planned</span><span class="shop__basis">${esc(r.unit)} needs grams_per_unit to compare</span></li>`;
  return `<li class="row shop__row" data-shop="${esc(r.id)}"><span>${esc(r.name)}</span><span class="shop__amt">${fmtKg(r.deficit)} ${esc(r.unit)}</span>
    ${haveNeed(r.have, r.need)}
    <span class="shop__basis">based on ${esc(r.basis)}${r.as_of ? ` ${fmtDate(r.as_of)}` : ''}: need ${fmtKg(r.need)}, have ${fmtKg(r.have)}</span></li>`;
}

function bind(root, ctx) {
  root.querySelectorAll('[data-recount]').forEach((b) => b.addEventListener('click', () => {
    recounting.add(b.dataset.recount); ctx.rerender();
    root.querySelector(`[data-recount-form="${CSS.escape(b.dataset.recount)}"] input`)?.focus();
  }));
  root.querySelectorAll('[data-recount-cancel]').forEach((b) => b.addEventListener('click', () => { recounting.delete(b.dataset.recountCancel); ctx.rerender(); }));
  root.querySelectorAll('[data-recount-form]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = f.dataset.recountForm; const v = num(f.q.value);
    if (v == null || v < 0) { toast('Type the measured amount as a number.'); return; }
    M.recount(id, v); recounting.delete(id); haptic(10);
    toast(`${M.pantryLine(id)?.name ?? id} counted`);
    ctx.rerender();
  }));
  root.querySelectorAll('[data-open]').forEach((el) => {
    const open = () => itemSheet(ctx, el.dataset.open);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

function itemSheet(ctx, id) {
  const r = M.pantryBoard().find((x) => x.id === id);
  if (!r) return;
  const ev = M.pantryEvents(id);
  const html = `
    <section class="hero hero--sheet">
      <p class="hero__figure figure">${isNum(r.quantity) ? fmtKg(r.quantity) : '—'}<span class="hero__of"> ${esc(r.unit)}</span></p>
      <p class="hero__label">${label(r.source, r.as_of)}</p>
      ${haveNeed(r.quantity, r.need)}
    </section>
    <dl class="facts">
      <div><dt>Planned use, rest of cycle</dt><dd>${r.plannedG ? `${fmtKg(r.plannedG)} g over ${r.remainingDays} days` : 'none'}</dd></div>
      ${isNum(r.need) ? `<div><dt>In ${esc(r.unit)}</dt><dd>${fmtKg(r.need)} ${esc(r.unit)}${r.line.grams_per_unit ? ` <small>at ${fmtKg(r.line.grams_per_unit)} g each</small>` : ''}</dd></div>
      <div><dt>${r.short ? 'Short by' : 'Left over at the end'}</dt><dd>${fmtKg(Math.abs(r.need - r.quantity))} ${esc(r.unit)}</dd></div>` : ''}
    </dl>
    <form class="inline-form" data-bought>
      <label class="box box--wide"><input type="text" inputmode="decimal" name="q" placeholder="amount bought" aria-label="Amount bought in ${esc(r.unit)}"><span>${esc(r.unit)}</span></label>
      <button class="btn btn--gold btn--sm" type="submit">Add bought</button>
    </form>
    <p class="fine">Bought adds to the current amount and labels it calculated. Recount replaces it with a measured number.</p>
    ${ev.length ? `<h3 class="h3">History</h3><ul class="list">${ev.map((e) => `<li><span>${fmtDate(e.date)} ${e.kind === 'bought' ? 'bought' : 'recounted to'}</span><span>${fmtKg(e.amount)} ${esc(e.unit ?? '')}</span></li>`).join('')}</ul>` : ''}`;
  const body = openSheet(html, { title: r.name });
  body.querySelector('[data-bought]').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = num(e.target.q.value);
    if (v == null || v <= 0) { toast('Type the amount bought as a number above 0.'); return; }
    M.bought(id, v); haptic(10); closeSheet(); toast(`Added ${fmtKg(v)} ${r.unit} of ${r.name}`); ctx.rerender();
  });
}

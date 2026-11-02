import * as M from '../model.js';
import { esc, fmtNum, fmtDate, isNum, haptic } from '../util.js';
import { toast, ICON } from '../ui.js';
import { topbar } from './common.js';

let editing = null; // { id, kind: 'recount' | 'bought' }

const q = (v) => fmtNum(v, Number.isInteger(Math.round(v * 1000) / 1000) ? 0 : 1);

export function renderPantry(root, ctx) {
  const C = M.cycle();
  const lines = C.pantry;
  const shop = M.shoppingList();
  root.innerHTML = `
    ${topbar(ctx, '', 'Pantry')}
    <section class="card pantry">
      ${lines.length ? `<ul class="pantry__list">${lines.map((l) => lineHTML(l)).join('')}</ul>` : `<p class="empty">No pantry[] in cycle.json.</p>`}
      <p class="fine">Ticking a meal subtracts what you ate. Recount when you weigh something for real.</p>
    </section>
    <section class="card shop">
      <header class="card__head"><h2>Shopping list</h2><span class="muted">${C.end ? `today to ${fmtDate(C.end)}` : 'rest of cycle'}</span></header>
      ${shop.rows.length ? `<ul class="shop__list">${shop.rows.map(shopRow).join('')}</ul>` : `<p class="muted">Nothing to buy: the pantry covers every planned meal left in this cycle.</p>`}
      ${shop.untracked.length ? `<p class="fine">Not tracked (no item_id in cycle.json): ${shop.untracked.map(esc).join(', ')}.</p>` : ''}
      <p class="fine">Planned grams for the remaining days, minus what the pantry holds now.</p>
    </section>`;
  bind(root, ctx);
}

function lineHTML(l) {
  const cur = M.pantryState(l.item_id);
  if (!cur) return '';
  const ed = editing?.id === l.item_id ? editing.kind : null;
  return `
    <li class="pline${cur.quantity < 0 ? ' is-negative' : ''}" data-id="${esc(l.item_id)}">
      <div class="pline__main">
        <span class="pline__name">${esc(l.name)}</span>
        <span class="pline__qty"><span class="num">${q(cur.quantity)}</span> ${esc(l.unit)}</span>
      </div>
      <div class="pline__meta">
        <span class="label label--${cur.source}">${cur.source === 'counted' ? `counted <span class="num">${cur.as_of ? fmtDate(cur.as_of) : ''}</span>` : 'calculated'}</span>
        ${cur.quantity < 0 ? '<span class="warn-text fine">below zero: recount</span>' : ''}
        <span class="pline__btns">
          <button class="chip chip--btn${ed === 'recount' ? ' is-on' : ''}" data-edit="recount">Recount</button>
          <button class="chip chip--btn${ed === 'bought' ? ' is-on' : ''}" data-edit="bought">Bought</button>
        </span>
      </div>
      ${ed ? `<form class="pline__form" data-form>
          <label><span>${ed === 'recount' ? 'Measured now' : 'Amount bought'}</span>
            <input type="number" inputmode="decimal" min="0" step="any" required ${ed === 'recount' ? `value="${q(Math.max(0, cur.quantity)).replace(/,/g, '')}"` : ''} aria-label="${ed === 'recount' ? 'Measured quantity' : 'Quantity bought'} in ${esc(l.unit)}"><em>${esc(l.unit)}</em></label>
          <button class="btn btn--accent btn--sm" type="submit">${ed === 'recount' ? 'Save count' : 'Add'}</button>
          <button class="btn btn--ghost btn--sm" type="button" data-cancel>Cancel</button>
        </form>` : ''}
    </li>`;
}

function shopRow(r) {
  if (r.notInPantry) return `<li class="shop__row"><span>${esc(r.name)}</span><span class="shop__amt"><span class="num">${q(r.grams)}</span> g needed</span><span class="label label--none">not in pantry list</span></li>`;
  if (r.noConversion) return `<li class="shop__row"><span>${esc(r.name)}</span><span class="shop__amt"><span class="num">${q(r.grams)}</span> g needed</span><span class="label label--none">pantry is in ${esc(r.unit)}; add grams_per_unit to compare</span></li>`;
  // round up to something you can buy: whole g / pieces, or 0.1 for kg
  const deficit = String(r.unit).toLowerCase() === 'kg' ? Math.ceil(r.deficit * 10 - 1e-9) / 10 : Math.ceil(r.deficit - 1e-9);
  return `<li class="shop__row"><span>${esc(r.name)}</span>
    <span class="shop__amt"><span class="num">${q(deficit)}</span> ${esc(r.unit)}<small class="num">need ${q(r.need)}, have ${q(r.have)}</small></span>
    <span class="label label--${r.basis}">based on ${r.basis}</span></li>`;
}

function bind(root, ctx) {
  root.querySelectorAll('.pline').forEach((li) => {
    const id = li.dataset.id;
    li.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
      editing = editing?.id === id && editing.kind === b.dataset.edit ? null : { id, kind: b.dataset.edit };
      ctx.rerender();
      root.querySelector('.pline__form input')?.focus();
    });
    li.querySelector('[data-cancel]')?.addEventListener('click', () => { editing = null; ctx.rerender(); });
    li.querySelector('[data-form]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Number(e.target.querySelector('input').value);
      if (!isNum(v) || v < 0) { toast('Type a number of 0 or more.'); return; }
      if (editing.kind === 'recount') { M.recount(id, v); toast('Count saved.'); } else { M.bought(id, v); toast('Added to pantry.'); }
      haptic(10);
      editing = null; ctx.rerender();
    });
  });
}

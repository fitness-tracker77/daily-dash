import * as M from '../model.js';
import * as store from '../store.js';
import { esc, fmtNum, fmtKg, fmtDate, today, isNum, haptic } from '../util.js';
import { lineChart, openSheet, toast, ICON } from '../ui.js';
import { topbar } from './common.js';

export function renderLog(root, ctx) {
  const st = store.get();
  const bw = M.bodyweights();
  const tl = M.targetLine();
  const mark = (b) => { const l = tl?.at(b.date); return l == null ? null : b.kg > l ? 'above' : b.kg < l ? 'below' : 'on'; };
  const chart = bw.length || tl
    ? lineChart(bw.map((b) => ({ date: b.date, y: b.kg, cls: mark(b) ? `is-${mark(b)}` : '' })), {
        target: tl ? { from: { date: tl.start, y: tl.from }, to: { date: tl.end, y: tl.to } } : null,
        unit: 'kg', dp: 1, height: 170,
      })
    : '';

  // history by date
  const dates = new Set([...Object.keys(st.ticks || {}), ...Object.keys(st.sets || {}), ...bw.map((b) => b.date), ...(st.pantryEvents || []).map((e) => e.date)]);
  const sets = M.loggedSets(); const prIds = M.prs(sets).ids;
  const hist = [...dates].sort().reverse().map((d) => {
    const ticks = Object.values(st.ticks?.[d] || {}).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const ds = sets.filter((s) => s.date === d);
    const b = bw.find((x) => x.date === d);
    const pe = (st.pantryEvents || []).filter((e) => e.date === d);
    if (!ticks.length && !ds.length && !b && !pe.length) return '';
    const byEx = new Map();
    ds.forEach((s) => { if (!byEx.has(s.name)) byEx.set(s.name, []); byEx.get(s.name).push(s); });
    const e = M.eaten(d);
    return `<li class="hist-day">
      <h3>${fmtDate(d, { dow: true })}</h3>
      <ul>
        ${ticks.map((t) => `<li><span class="num muted">${esc(t.time || '')}</span><span>${esc(t.title)}${t.type === 'meal' ? `<small>${t.items.map((i) => `${esc(i.name)} <span class="num">${fmtKg(i.eaten_g)} g</span>`).join(', ')}</small>` : `<small>${esc(t.type)} done</small>`}</span></li>`).join('')}
        ${e.meals ? `<li class="hist-total"><span></span><span><span class="num">${fmtNum(e.kcal)}</span> kcal, <span class="num">${fmtNum(e.protein, 1)}</span> g protein eaten</span></li>` : ''}
        ${[...byEx].map(([n, arr]) => `<li><span class="muted">${ICON.training}</span><span>${esc(n)}<small class="num">${arr.sort((a, b) => a.idx - b.idx).map((s) => `${s.reps ?? '?'} × ${s.load != null ? fmtKg(s.load) + ' kg' : 'no load'}${prIds.has(`${s.date}|${s.ex}|${s.idx}`) ? ' PR' : ''}`).join(', ')}</small></span></li>`).join('')}
        ${b ? `<li><span class="muted">BW</span><span><span class="num">${fmtKg(b.kg)}</span> kg bodyweight</span></li>` : ''}
        ${pe.map((p) => `<li><span class="muted">${ICON.pantry}</span><span>${esc(p.name)}: ${p.kind === 'recount' ? 'recounted to' : 'bought'} <span class="num">${fmtNum(p.amount, Number.isInteger(p.amount) ? 0 : 1)}</span> ${esc(p.unit || '')}</span></li>`).join('')}
      </ul>
    </li>`;
  }).join('');

  root.innerHTML = `
    ${topbar(ctx, '', 'Log')}
    <section class="card bw">
      <header class="card__head"><h2>Bodyweight</h2>${tl ? `<span class="muted num">${fmtKg(tl.from)} → ${fmtKg(tl.to)} kg</span>` : ''}</header>
      <form class="bw__form" data-bw>
        <label><span>Date</span><input type="date" value="${today()}" max="${today()}" required data-bw-date></label>
        <label><span>Weight</span><span class="inp-unit"><input type="number" inputmode="decimal" step="0.1" min="20" max="400" required placeholder="—" data-bw-kg><em>kg</em></span></label>
        <button class="btn btn--accent" type="submit">Save</button>
      </form>
      ${chart}
      ${tl && chart ? `<p class="fine legend"><span class="key key--line"></span>your entries <span class="key key--dash"></span>target line from cycle.json</p>` : ''}
      ${bw.length ? `<ul class="bw__list">${bw.slice().reverse().slice(0, 12).map((b) => `
        <li><span>${fmtDate(b.date, { dow: true })}</span><span class="num">${fmtKg(b.kg)} kg</span>
        ${mark(b) ? `<span class="label label--${mark(b)}">${mark(b)} line</span>` : '<span></span>'}
        <button class="icon-btn icon-btn--sm" data-del="${b.date}" aria-label="Delete entry for ${fmtDate(b.date)}">${ICON.close}</button></li>`).join('')}</ul>` : '<p class="muted">No entries yet.</p>'}
    </section>

    <section class="card export">
      <header class="card__head"><h2>Export</h2></header>
      <p class="muted">Copies a plain-text summary: planned vs eaten, sets, bodyweight, pantry, stats and streaks.</p>
      <button class="btn btn--accent btn--block" data-export>${ICON.copy} Copy summary</button>
    </section>

    <section class="history">
      <h2 class="section-title">History</h2>
      ${hist ? `<ol class="hist-list">${hist}</ol>` : '<p class="muted">Nothing logged yet. Tick a meal or a set to start.</p>'}
    </section>`;

  root.querySelector('[data-bw]').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = root.querySelector('[data-bw-date]').value;
    const kg = Number(root.querySelector('[data-bw-kg]').value);
    if (!d || !isNum(kg) || kg <= 0) { toast('Type your weight in kg.'); return; }
    if (d > today()) { toast('That date is in the future.'); return; }
    M.addBodyweight(d, kg); M.updateBadges(); haptic(10); toast('Bodyweight saved.');
    ctx.rerender();
  });
  root.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    if (!confirm(`Delete the bodyweight entry for ${fmtDate(b.dataset.del)}?`)) return;
    M.addBodyweight(b.dataset.del, null); ctx.rerender();
  });
  root.querySelector('[data-export]').onclick = async () => {
    const text = M.exportText();
    try {
      await navigator.clipboard.writeText(text);
      toast('Summary copied to the clipboard.');
    } catch {
      const body = openSheet(`<p class="muted">Copy did not work here. Select the text below and copy it.</p><textarea class="export__text" readonly>${esc(text)}</textarea>`, { title: 'Export' });
      const ta = body.querySelector('textarea'); ta.focus(); ta.select();
    }
  };
}

import { esc, fmtNum, fmtDate } from '../util.js';
import { ICON } from '../ui.js';
import * as M from '../model.js';

export function topbar(ctx, extra = '', title = '') {
  const C = M.cycle();
  return `
    <div class="topbar">
      <div class="topbar__left">${title ? `<h1 class="topbar__title">${esc(title)}</h1>` : extra}</div>
      <div class="topbar__right">
        ${title ? extra : ''}
        <button class="icon-btn" data-settings aria-label="Settings">${ICON.settings}</button>
        <button class="icon-btn" data-theme-toggle aria-label="Switch to ${ctx.theme === 'light' ? 'dark' : 'light'} mode">${ctx.theme === 'light' ? ICON.moon : ICON.sun}</button>
      </div>
    </div>
    ${C?.isExample ? `<p class="example-flag">EXAMPLE — not real data. <button class="link-inline" data-settings>Import your cycle in Settings</button></p>` : ''}`;
}

export function warningCard(ctx) {
  const w = ctx.warnings || [];
  const extra = ctx.problem ? [{ path: 'imported cycle', msg: ctx.problem }] : [];
  const all = [...extra, ...w];
  if (!all.length) return '';
  return `
    <details class="card card--warn">
      <summary>${ICON.warn}<span><strong>${all.length} problem${all.length === 1 ? '' : 's'} in the cycle</strong><small>Tap to see which fields. Nothing is guessed: affected numbers are left out.</small></span></summary>
      <ul class="warn-list">${all.slice(0, 60).map((x) => `<li><code>${esc(x.path)}</code><span>${esc(x.msg)}</span></li>`).join('')}</ul>
      ${all.length > 60 ? `<p class="fine">…and ${all.length - 60} more.</p>` : ''}
    </details>`;
}

const nl = (v, fmt) => (v == null ? '<span class="not-logged">not logged</span>' : fmt(v));

export function recapCard(r) {
  return `
    <section class="card recap">
      <header class="card__head"><h2>Week recap</h2><span class="muted num">${fmtDate(r.from)} – ${fmtDate(r.to)}</span></header>
      <dl class="stat-grid">
        <div><dt>Days completed</dt><dd><span class="num">${r.completed}</span><small class="num">/ ${r.plannedDays}</small></dd></div>
        <div><dt>Sessions done</dt><dd>${nl(r.sessions, (v) => `<span class="num">${v}</span>`)}</dd></div>
        <div><dt>Avg kcal eaten</dt><dd>${nl(r.kcalAvg, (v) => `<span class="num">${fmtNum(v)}</span>`)}${r.mealDays ? `<small>over ${r.mealDays} day${r.mealDays === 1 ? '' : 's'}</small>` : ''}</dd></div>
        <div><dt>Avg protein eaten</dt><dd>${nl(r.proteinAvg, (v) => `<span class="num">${fmtNum(v, 1)}</span><small>g</small>`)}</dd></div>
        <div><dt>Weight lifted</dt><dd>${nl(r.lifted, (v) => `<span class="num">${fmtNum(v)}</span><small>kg</small>`)}</dd></div>
        <div><dt>PRs</dt><dd>${nl(r.prs, (v) => `<span class="num">${v}</span>`)}</dd></div>
      </dl>
    </section>`;
}

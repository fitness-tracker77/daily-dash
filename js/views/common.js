import { esc, fmtNum, fmtDate, daysAgoText, isNum } from '../util.js';
import { ICON } from '../ui.js';
import * as M from '../model.js';
import * as store from '../store.js';

export const NL = '<span class="nl">not logged</span>';
export const nl = (v, fmt) => (v == null ? NL : fmt(v));

// top of every screen: a quiet line of context on the left, Settings on the right
export function head(ctx, left = '') {
  const C = M.cycle();
  return `
    <header class="head">
      <div class="head__left">${left}</div>
      <button class="icon-btn" data-settings aria-label="Settings">${ICON.settings}</button>
    </header>
    ${C?.isExample ? `<p class="flag">EXAMPLE — not real data. <button class="link" data-settings>Import your cycle</button></p>` : ''}
    ${storageNote()}`;
}

function storageNote() {
  if (store.status.mode === 'fallback') {
    return `<p class="flag flag--bad">${ICON.warn}<span>This phone's database could not be opened (${esc(store.status.error)}). Showing data from older storage; new changes will not be saved.</span></p>`;
  }
  if (store.status.writeError) return `<p class="flag flag--bad">${ICON.warn}<span>The last change could not be saved: ${esc(store.status.writeError)}</span></p>`;
  return '';
}

export function warningBlock(ctx) {
  const all = [...(ctx.problem ? [{ path: 'imported cycle', msg: ctx.problem }] : []), ...(ctx.warnings || [])];
  if (!all.length) return '';
  return `
    <details class="warn">
      <summary>${ICON.warn}<span>${all.length} problem${all.length === 1 ? '' : 's'} in the cycle file. Affected numbers are left out, never guessed.</span></summary>
      <ul class="warn__list">${all.slice(0, 80).map((x) => `<li><code>${esc(x.path)}</code><span>${esc(x.msg)}</span></li>`).join('')}</ul>
      ${all.length > 80 ? `<p class="fine">${all.length - 80} more not shown.</p>` : ''}
    </details>`;
}

// "Last backup N days ago": hidden with nothing logged, neutral up to 7 days, warm after
export function backupBanner() {
  const b = M.backupStatus();
  if (!b) return '';
  const text = b.never
    ? `No backup yet. First entry ${daysAgoText(b.days)}.`
    : `Last backup ${daysAgoText(b.days)}.`;
  return `<div class="backup${b.warm ? ' is-warm' : ''}" data-backup-banner data-days="${b.days}">
    <span>${text}</span><button class="link" data-backup-now>Back up</button></div>`;
}

export function recapBlock(r) {
  const row = (label, v) => `<div><dt>${label}</dt><dd>${v}</dd></div>`;
  return `
    <section class="recap" aria-label="Week recap">
      <h2 class="h2">Week in review</h2>
      <p class="sub">${fmtDate(r.from)} to ${fmtDate(r.to)}, from what you logged</p>
      <dl class="facts">
        ${row('Days completed', `${r.completed} of ${r.plannedDays}`)}
        ${row('Average kcal', nl(r.kcalAvg, (v) => `${fmtNum(v)} <small>over ${r.mealDays} completed day${r.mealDays === 1 ? '' : 's'}</small>`))}
        ${row('Average protein', nl(r.proteinAvg, (v) => `${fmtNum(v, 1)} g`))}
        ${row('Protein target reached', r.proteinTargetDays ? `${r.proteinTargetDays.hit} of ${r.proteinTargetDays.of} <small>completed days</small>` : NL)}
        ${row('Sessions <small>incl. runs</small>', nl(r.sessions || null, (v) => fmtNum(v)))}
        ${row('Sets', nl(r.sets, (v) => fmtNum(v)))}
        ${row('Volume', nl(r.volume, (v) => `${fmtNum(v)} kg`))}
        ${row('PRs', nl(r.prs, (v) => fmtNum(v)))}
        ${row('Weight, 7-day average', r.weightAvgChange ? `${r.weightAvgChange.diff > 0 ? '+' : r.weightAvgChange.diff < 0 ? '−' : ''}${fmtNum(Math.abs(r.weightAvgChange.diff), 1)} kg <small>${fmtNum(r.weightAvgChange.then, 1)} to ${fmtNum(r.weightAvgChange.now, 1)}</small>` : NL)}
        ${r.todaySoFar ? row('Today so far', `${fmtNum(r.todaySoFar.kcal)} kcal, ${fmtNum(r.todaySoFar.protein, 1)} g protein`) : ''}
      </dl>
    </section>`;
}

export const kg = (v) => (isNum(v) ? `${fmtNum(v, Number.isInteger(v) ? 0 : 1)} kg` : NL);

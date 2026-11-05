import * as M from '../model.js';
import { UNGROUPED } from '../data.js';
import { esc, fmtNum, fmtKg, fmtDate, fmtMonthKey, isNum, sum, today, monthKey, addMonthKey, monthStart, monthEnd, dateRange, dow, addDays } from '../util.js';
import { openSheet } from '../ui.js';
import { lineChart, barChart, donut } from '../charts.js';
import { head, NL, nl, recapBlock } from './common.js';
import { bodyweightBlock as bwBlock, bindBodyweight, bodyweightTop } from './bwchart.js';
import { exerciseSheet } from './train.js';

const ui = { measure: 'sets', kind: 'Month', anchor: null, ex: null, heat: null, month: null, eqOffset: 0 };
export const insightsState = ui;

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

export function renderInsights(root, ctx) {
  const C = M.cycle();
  const t = today();
  const per = M.periodBounds(ui.kind, ui.anchor || t);
  const { from, to } = per;
  const lifted = M.liftedIn(from, to);

  root.innerHTML = `
    ${head(ctx, '<span>Insights</span>')}
    <nav class="range" aria-label="Period">${M.PERIODS.map((k) => `<button class="range__b${k === ui.kind ? ' is-on' : ''}" data-kind="${k}" aria-pressed="${k === ui.kind}">${k}</button>`).join('')}</nav>
    <div class="period" aria-label="Selected period">
      <button class="icon-btn" data-step="prev" ${per.canPrev ? '' : 'disabled'} aria-label="Earlier ${ui.kind.toLowerCase()}">‹</button>
      <span class="period__name">${esc(cap(per.label))}</span>
      <button class="icon-btn" data-step="next" ${per.canNext ? '' : 'disabled'} aria-label="Later ${ui.kind.toLowerCase()}">›</button>
    </div>
    <section class="hero" aria-label="Weight lifted">
      <p class="hero__figure figure" data-hero>${lifted ? `${fmtNum(lifted.volume)}<span class="hero__of"> kg</span>` : '—'}</p>
      <p class="hero__label">${lifted ? `lifted ${ui.kind === 'All' ? 'in all time' : `in ${esc(per.label)}`}, ${lifted.sessions} session${lifted.sessions === 1 ? '' : 's'} (incl. runs), ${lifted.sets} sets` : `lifted ${ui.kind === 'All' ? 'in all time' : `in ${esc(per.label)}`}: not logged yet`}</p>
    </section>
    ${M.isRecapDay(t) ? recapBlock(M.weekRecap(t)) : ''}
    ${muscleBlock(from, to, per)}
    ${setsBlock(from, to)}
    ${exerciseBlock()}
    ${effortBlock(from, to)}
    ${bodyweightBlock()}
    ${nutritionBlock(from, to, C)}
    ${adherenceBlock(from, to)}
    ${runBlock(from, to)}
    ${heatBlock(from, to)}
    ${reviewBlock(from, to)}
    ${prBlock(from, to, per.label)}
    ${badgesBlock()}
    ${funBlock(from, to, per.label)}
  `;
  bind(root, ctx, from, to);
}

// ---------------------------------------------------------------- weekly volume per muscle group
function muscleBlock(from, to, per) {
  const mv = M.muscleView(from, to, ui.measure, ui.kind === 'All' ? 'in all time' : `in ${per.label}`);
  const { total, totals, unit } = mv;
  const pr = mv.priority && totals.has(mv.priority) ? mv.priority : null;
  const order = mv.groups.filter((g) => g !== pr);
  const tones = mv.tones;
  const bars = mv.weeks.map((w) => ({
    key: w.week, label: fmtDate(w.week),
    stack: [...(pr && w.values[pr] ? [{ v: w.values[pr], gold: true, name: pr }] : []), ...order.map((g) => ({ v: w.values[g] || 0, name: g }))],
  }));
  const toneList = [...(pr ? [0] : []), ...order.map((g) => tones[g])];
  const label = `Weekly ${unit} by muscle group`;
  return `
    <section class="chartblock" data-chart="muscle" data-from="${from}" data-to="${to}">
      <h2 class="h2">Weekly volume by muscle group</h2>
      <nav class="range range--sm" aria-label="Measure">${[['sets', 'Sets'], ['kg', 'kg']].map(([id, t]) => `<button class="range__b${id === mv.measure ? ' is-on' : ''}" data-measure="${id}" aria-pressed="${id === mv.measure}">${t}</button>`).join('')}</nav>
      ${total ? `<p class="chartblock__key">${mv.headline}</p>
        ${barChart({ bars, label, tones: toneList })}
        <div class="split">
          ${donut({ segments: [...(pr ? [{ label: pr, v: totals.get(pr), gold: true }] : []), ...order.map((g) => ({ label: g, v: totals.get(g) }))], tones: toneList, size: 132, center: pr ? `${Math.round((totals.get(pr) / total) * 100)}%` : `${mv.groups.length}`, sub: pr ? esc(pr) : 'groups', label: `Share of ${unit} by muscle group` })}
          <ul class="legend">${[...(pr ? [pr] : []), ...order].map((g) => `<li class="${g === pr ? 'is-gold' : `tone-${tones[g]}`}"><span class="legend__sw"></span>${esc(cap(g))}${g === UNGROUPED ? ' <small>(no muscle_group in cycle.json)</small>' : ''}<span class="legend__v">${fmtNum(totals.get(g))} ${unit === 'sets' && totals.get(g) === 1 ? 'set' : unit} <small>${Math.round((totals.get(g) / total) * 100)}%</small></span></li>`).join('')}</ul>
        </div>
        <button class="link" data-more="muscle">Week by week</button>`
      : `<p class="quiet">${NL}: no ${unit === 'kg' ? 'sets with a load' : 'sets'} in this range.</p>`}
    </section>`;
}

// ---------------------------------------------------------------- weekly sets
function setsBlock(from, to) {
  const weeks = M.setsByWeek(from, to);
  const total = sum(weeks.map((w) => w.sets));
  return `
    <section class="chartblock" data-chart="sets" data-from="${from}" data-to="${to}">
      <h2 class="h2">Sets per week</h2>
      ${total ? `<p class="chartblock__key">${fmtNum(total)} sets <small>${fmtNum(sum(weeks.map((w) => w.reps)))} reps in this range</small></p>
        ${barChart({ bars: weeks.map((w) => ({ key: w.week, label: fmtDate(w.week), stack: [{ v: w.sets, name: 'sets' }] })), label: 'Sets per week', values: weeks.length <= 8 })}`
      : `<p class="quiet">${NL}: no sets ticked in this range.</p>`}
    </section>`;
}

// ---------------------------------------------------------------- effort trend
function effortBlock(from, to) {
  const pts = M.effortTrend(from, to);
  return `
    <section class="chartblock" data-chart="effort" data-from="${from}" data-to="${to}">
      <h2 class="h2">Effort</h2>
      ${pts.length ? `<p class="chartblock__key">${fmtNum(sum(pts.map((p) => p.y)) / pts.length, 1)} <small>average effort out of 10 over ${pts.length} session${pts.length === 1 ? '' : 's'} with a score</small></p>
        ${lineChart({ points: pts, x0: from, x1: to, dp: 1, label: 'Average effort per session', tickDp: 0 })}`
      : `<p class="quiet">${NL}: no effort scores in this range.</p>`}
    </section>`;
}

// ---------------------------------------------------------------- plan adherence
function adherenceBlock(from, to) {
  const weeks = M.adherenceByWeek(from, to).filter((w) => w.planned);
  if (!weeks.length) return `<section class="chartblock" data-chart="adherence" data-from="${from}" data-to="${to}"><h2 class="h2">Plan followed</h2><p class="quiet">${NL}: no planned days in this range.</p></section>`;
  const done = sum(weeks.map((w) => w.done)), planned = sum(weeks.map((w) => w.planned));
  return `
    <section class="chartblock" data-chart="adherence" data-from="${from}" data-to="${to}">
      <h2 class="h2">Plan followed</h2>
      ${(() => { const cp = M.cyclePosition(); return cp ? `<p class="fine">Day ${cp.day} of ${cp.of} of the cycle</p>` : ''; })()}
      <p class="chartblock__key">${Math.round((done / planned) * 100)}% <small>${done} of ${planned} planned meals, sets and runs ticked</small></p>
      ${barChart({ bars: weeks.map((w) => ({ key: w.week, label: fmtDate(w.week), stack: [{ v: Math.round(w.pct), name: '%' }] })), label: 'Share of the plan done per week', values: weeks.length <= 8, yMax: 100 })}
      <p class="fine">Past days count everything planned; today counts only what you've ticked.</p>
    </section>`;
}

// ---------------------------------------------------------------- load and estimated 1RM for one exercise
function exerciseBlock() {
  const to = today(), from = addDays(to, -83); // always the last 12 weeks, whatever period is selected
  const list = M.exercisesLogged();
  if (!list.length) return `<section class="chartblock" data-chart="exercise"><h2 class="h2">Load and estimated 1RM <small>last 12 weeks</small></h2><p class="quiet">${NL}: no sets ticked yet.</p></section>`;
  if (!ui.ex || !list.some((e) => e.ex === ui.ex)) ui.ex = list[0].ex;
  const days = M.exerciseTrend(ui.ex, from, to);
  const loads = days.filter((d) => d.maxLoad != null).map((d) => ({ date: d.date, y: d.maxLoad, mark: d.pr ? 'pr' : undefined }));
  const e1 = days.filter((d) => d.bestE1rm != null).map((d) => ({ date: d.date, y: d.bestE1rm }));
  return `
    <section class="chartblock" data-chart="exercise" data-from="${from}" data-to="${to}">
      <h2 class="h2">Load and estimated 1RM <small>last 12 weeks</small></h2>
      <label class="select"><span class="sr">Exercise</span><select data-ex>${list.map((e) => `<option value="${esc(e.ex)}"${e.ex === ui.ex ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
      ${loads.length ? `<p class="chartblock__key">${fmtKg(Math.max(...loads.map((p) => p.y)))} kg <small>heaviest set in range</small></p>
        ${loads.length > 1 ? lineChart({ points: loads, x0: from, x1: to, highlight: 'max', unit: 'kg', label: 'Heaviest set per session' }) : '<p class="fine">Chart appears after 2 sessions.</p>'}` : `<p class="quiet">Load ${NL} in this range.</p>`}
      ${e1.length ? `<p class="chartblock__key">${fmtNum(Math.max(...e1.map((p) => p.y)), 1)} kg <small>estimated 1RM (Epley)</small></p>
        ${e1.length > 1 ? lineChart({ points: e1, x0: from, x1: to, highlight: 'max', unit: 'kg estimate', label: 'Estimated 1RM per session' }) : '<p class="fine">Chart appears after 2 sessions.</p>'}
        <p class="fine">Epley: kg × (1 + reps ÷ 30), sets of 1 to 10 reps only. Rings on the load line mark PRs.</p>` : ''}
      <button class="link" data-more="exercise">Full history</button>
    </section>`;
}

// ---------------------------------------------------------------- bodyweight against the target path
function bodyweightBlock() {
  // always the last 12 weeks, whatever period is selected above
  const bw = M.bodyweights();
  const top = bodyweightTop(M.bodyweightSummary(bw));
  return `
    <section class="chartblock" data-chart="bodyweight">
      <h2 class="h2">Bodyweight <small>last 12 weeks</small></h2>
      ${bw.length ? `<p class="chartblock__key">${top.big} kg <small>${top.tag}${top.tag === 'latest' ? '' : ''} · ${esc(top.sub)}</small></p>
        ${bodyweightBlock12()}
        <button class="link" data-more="bodyweight">All entries</button>` : `<p class="quiet">${NL} yet.</p>`}
    </section>`;
}
const bodyweightBlock12 = () => bwBlock({ range: '12w', compact: true });

// ---------------------------------------------------------------- kcal and protein against targets
function nutritionBlock(from, to, C) {
  const days = M.nutritionIn(from, to);   // completed days only
  const sofar = M.todaySoFar();
  const showSofar = sofar && today() >= from && today() <= to;
  const sofarLine = showSofar ? `<p class="fine">Today so far: ${fmtNum(sofar.kcal)} kcal, ${fmtNum(sofar.protein, 1)} g protein (left out of the averages until the day is over)</p>` : '';
  if (!days.length) return `<section class="chartblock" data-chart="nutrition" data-from="${from}" data-to="${to}"><h2 class="h2">Energy and protein</h2><p class="quiet">${NL}: no completed days with ticked meals in this period.</p>${sofarLine}</section>`;
  const avgK = sum(days.map((d) => d.kcal)) / days.length, avgP = sum(days.map((d) => d.protein)) / days.length;
  return `
    <section class="chartblock" data-chart="nutrition" data-from="${from}" data-to="${to}">
      <h2 class="h2">Energy and protein</h2>
      <p class="chartblock__key">${fmtNum(avgK)} kcal <small>average over ${days.length} completed day${days.length === 1 ? '' : 's'} with logged meals${C.kcalTarget != null ? `, target ${fmtNum(C.kcalTarget)}` : ''}</small></p>
      ${lineChart({ points: days.map((d) => ({ date: d.date, y: d.kcal })), hLine: C.kcalTarget, x0: from, x1: to, dp: 0, unit: 'kcal', label: 'kcal per day' })}
      <p class="chartblock__key">${fmtNum(avgP, 1)} g <small>protein average${C.proteinTarget != null ? `, target ${fmtNum(C.proteinTarget)} g` : ''}</small></p>
      ${lineChart({ points: days.map((d) => ({ date: d.date, y: d.protein })), hLine: C.proteinTarget, x0: from, x1: to, dp: 0, unit: 'g', label: 'Protein per day' })}
      ${(() => { const p = M.proteinTargetDays(from, to); return p ? `<p class="chartblock__key">${p.hit} of ${p.of} <small>completed days reached the ${fmtNum(p.target)} g protein target</small></p>` : ''; })()}
      ${sofarLine}
      <p class="fine">Only completed days with at least one ticked meal. Dashed: the daily target.</p>
      <button class="link" data-more="nutrition">Day by day</button>
    </section>`;
}

// ---------------------------------------------------------------- weekly run distance
function runBlock(from, to) {
  const weeks = M.runsByWeek(from, to);
  const total = sum(weeks.map((w) => w.km)), count = sum(weeks.map((w) => w.runs));
  return `
    <section class="chartblock" data-chart="runs" data-from="${from}" data-to="${to}">
      <h2 class="h2">Weekly run distance</h2>
      ${count ? `<p class="chartblock__key">${fmtKg(total)} km <small>${count} run${count === 1 ? '' : 's'}</small></p>
        ${barChart({ bars: weeks.map((w) => ({ key: w.week, label: fmtDate(w.week), stack: [{ v: w.km, name: 'km' }] })), dp: 1, label: 'Kilometres per week' })}`
      : `<p class="quiet">${NL}: no runs in this range.</p>`}
    </section>`;
}

// ---------------------------------------------------------------- calendar heatmap, month by month
function heatBlock(from, to) {
  const first = monthKey(from), last = monthKey(to < today() ? to : today());
  if (!ui.heat || ui.heat > last || ui.heat < first) ui.heat = last;
  const mk = ui.heat;
  const days = dateRange(monthStart(mk), monthEnd(mk));
  const lead = (dow(days[0]) + 6) % 7;
  const t = today();
  const cells = days.map((d) => {
    const s = M.dayStatus(d);
    const cls = d > t ? 'is-future' : s.complete ? 'is-complete' : s.trained ? 'is-trained' : s.planned ? 'is-planned' : 'is-empty';
    return `<span class="heat__c ${cls}${d === t ? ' is-today' : ''}${d < from || d > to ? ' is-out' : ''}" data-day="${d}" title="${fmtDate(d, { dow: true })}">${Number(d.slice(8))}</span>`;
  }).join('');
  let trained = 0, complete = 0;
  for (const d of dateRange(from, to < t ? to : t)) { const s = M.dayStatus(d); if (s.trained) trained++; if (s.complete) complete++; }
  return `
    <section class="chartblock" data-chart="heatmap" data-from="${from}" data-to="${to}">
      <h2 class="h2">Training and complete days</h2>
      <p class="chartblock__key">${trained} training day${trained === 1 ? '' : 's'} <small>${complete} complete day${complete === 1 ? '' : 's'}, ${fmtDate(from)} to ${fmtDate(to)}</small></p>
      <div class="heat__nav">
        <button class="icon-btn" data-heat="-1" ${mk <= first ? 'disabled' : ''} aria-label="Earlier month">‹</button>
        <span class="heat__month">${fmtMonthKey(mk)}</span>
        <button class="icon-btn" data-heat="1" ${mk >= last ? 'disabled' : ''} aria-label="Later month">›</button>
      </div>
      <div class="heat" role="grid" aria-label="${fmtMonthKey(mk)}">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span class="heat__h">${x}</span>`).join('')}
        ${'<span></span>'.repeat(lead)}${cells}
      </div>
      <ul class="legend legend--inline"><li class="heat-key is-complete"><span class="legend__sw"></span>Complete day</li><li class="heat-key is-trained"><span class="legend__sw"></span>Trained</li><li class="heat-key is-planned"><span class="legend__sw"></span>Planned, not complete</li></ul>
    </section>`;
}

// ---------------------------------------------------------------- monthly review
function reviewBlock(from, to) {
  const months = M.monthsWithData().filter((m) => monthEnd(m) >= from && monthStart(m) <= to);
  if (!months.length) return '';
  if (!ui.month || !months.includes(ui.month)) ui.month = months[0];
  const r = M.monthReview(ui.month);
  const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  return `
    <section class="review" data-review="${ui.month}">
      <h2 class="h2">Monthly review</h2>
      ${months.length > 1 ? `<label class="select"><span class="sr">Month</span><select data-month>${months.map((m) => `<option value="${m}"${m === ui.month ? ' selected' : ''}>${fmtMonthKey(m)}</option>`).join('')}</select></label>` : `<p class="sub">${fmtMonthKey(ui.month)}</p>`}
      <dl class="facts">
        ${row('Sessions <small>incl. runs</small>', nl(r.sessions, (v) => fmtNum(v)))}
        ${row('Total volume', nl(r.volume, (v) => `${fmtNum(v)} kg`))}
        ${row('PRs', nl(r.prs, (v) => fmtNum(v)))}
        ${row('Weight change', r.bwChange ? `${r.bwChange.diff > 0 ? '+' : ''}${fmtNum(r.bwChange.diff, 1)} kg <small>${fmtDate(r.bwChange.from.date)} to ${fmtDate(r.bwChange.to.date)}</small>` : `${NL}${r.bwCount === 1 ? ' <small>(one weigh-in)</small>' : ''}`)}
        ${row('Average kcal', nl(r.kcalAvg, (v) => `${fmtNum(v)} <small>over ${r.mealDays} completed day${r.mealDays === 1 ? '' : 's'}</small>`))}
        ${row('Average protein', nl(r.proteinAvg, (v) => `${fmtNum(v, 1)} g`))}
        ${r.todaySoFar ? row('Today so far', `${fmtNum(r.todaySoFar.kcal)} kcal, ${fmtNum(r.todaySoFar.protein, 1)} g protein`) : ''}
        ${row('Runs', nl(r.runs, (v) => `${v.count}${v.withDistance ? `, ${fmtKg(v.km)} km` : ''}`))}
      </dl>
    </section>`;
}

function prBlock(from, to, label) {
  const list = M.recentPrs(5, from, to);
  return `
    <section class="badges" aria-label="Recent PRs">
      <h2 class="h2">PRs in ${esc(label)}</h2>
      ${list.length ? `<ul class="list">${list.map((h) => `<li class="is-earned"><span>${esc(h.name)} <strong>${fmtKg(h.load)} kg</strong></span><span>up from ${fmtKg(h.prev)} kg, ${fmtDate(h.date)}</span></li>`).join('')}</ul>
      <p class="fine">A PR is a heavier set than your best on any earlier date.</p>` : '<p class="quiet">No PRs logged in this period.</p>'}
    </section>`;
}

function badgesBlock() {
  const b = M.updateBadges();
  return `
    <section class="badges">
      <h2 class="h2">Badges <small>all time</small></h2>
      <ul class="list">${b.map((x) => `<li class="${x.date ? 'is-earned' : ''}"><span>${esc(x.label)}</span><span>${x.date ? fmtDate(x.date, { year: true }) : 'not yet'}</span></li>`).join('')}</ul>
    </section>`;
}

function funBlock(from, to, label) {
  const f = M.funStats(from, to);
  const C = M.cycle();
  const eqs = C.funEq && C.funEq.length && f.total != null
    ? [0, 1, 2].slice(0, Math.min(3, C.funEq.length)).map((k) => M.funLine(f.total, today(), ui.eqOffset + k)) : null;
  const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  return `
    <section class="fun-stats">
      <h2 class="h2">For fun, in ${esc(label)}</h2>
      ${eqs ? `<div class="fun">${eqs.map((e) => `<p>You have lifted ${fmtNum(e.count, 1)} ${esc(e.count === 1 ? e.name ?? e.plural : e.plural)}.</p>`).join('')}
        <p class="fine">${[...new Set(eqs.map((e) => e.note).filter(Boolean))].map(esc).join(' ')}</p>
        ${C.funEq.length > 3 ? '<button class="link" data-eq>Other comparisons</button>' : ''}</div>` : ''}
      <dl class="facts">
        ${row('Total lifted', nl(f.total, (v) => `${fmtNum(v)} kg`))}
        ${row('Heaviest single set', f.heaviestSet ? `${f.heaviestSet.reps} × ${fmtKg(f.heaviestSet.load)} kg = ${fmtNum(f.heaviestSet.volume)} kg <small>${esc(f.heaviestSet.name)}, ${fmtDate(f.heaviestSet.date)}</small>` : NL)}
        ${row('Heaviest day', f.heaviestDay ? `${fmtNum(f.heaviestDay.volume)} kg <small>${fmtDate(f.heaviestDay.date, { dow: true })}</small>` : NL)}
        ${row('Total sets', nl(f.setsCount, (v) => fmtNum(v)))}
        ${row('Total reps', nl(f.repsCount, (v) => fmtNum(v)))}
        ${row('Most-trained exercise', f.mostTrained ? `${esc(f.mostTrained.name)} <small>${f.mostTrained.n} sets</small>` : NL)}
        ${row('Biggest load jump', f.biggestJump ? `${esc(f.biggestJump.name)} <small>${fmtKg(f.biggestJump.first)} to ${fmtKg(f.biggestJump.last)} kg</small>` : NL)}
      </dl>
    </section>`;
}

// ---------------------------------------------------------------- detail sheets ("one tap deeper")
function more(kind, from, to) {
  const C = M.cycle();
  if (kind === 'exercise') { exerciseSheet(ui.ex); return; }
  let html = '', title = '';
  if (kind === 'muscle') {
    const wm = M.weeklyMuscle(from, to);
    title = 'Volume by week';
    html = `<table class="tbl"><thead><tr><th>Week of</th>${wm.groups.map((g) => `<th class="r">${esc(cap(g))}</th>`).join('')}<th class="r">Total</th></tr></thead>
      <tbody>${wm.weeks.slice().reverse().map((w) => `<tr><td>${fmtDate(w.week)}</td>${wm.groups.map((g) => `<td class="r">${w.muscle[g] ? fmtNum(w.muscle[g]) : '—'}</td>`).join('')}<td class="r">${w.volume ? fmtNum(w.volume) : '—'}</td></tr>`).join('')}</tbody></table>
      <p class="fine">kg = sets × reps × kg of ticked sets. Weeks start on Monday.</p>`;
  } else if (kind === 'bodyweight') {
    title = 'Bodyweight';
    html = `<table class="tbl"><thead><tr><th>Date</th><th class="r">kg</th><th class="r">Path</th><th class="r">Difference</th></tr></thead>
      <tbody>${M.bodyweights().slice().reverse().map((b) => { const v = M.vsPath(b); return `<tr><td>${fmtDate(b.date, { year: true })}</td><td class="r">${fmtKg(b.kg)}</td><td class="r">${v ? fmtNum(v.line, 1) : '—'}</td><td class="r">${v ? `${v.diff > 0 ? '+' : ''}${fmtNum(v.diff, 1)} ${v.side}` : 'outside cycle'}</td></tr>`; }).join('')}</tbody></table>`;
  } else if (kind === 'nutrition') {
    title = 'Energy and protein';
    html = `<table class="tbl"><thead><tr><th>Date</th><th class="r">kcal</th><th class="r">Protein</th></tr></thead>
      <tbody>${M.nutritionIn(from, to).reverse().map((d) => `<tr><td>${fmtDate(d.date, { dow: true })}</td><td class="r">${fmtNum(d.kcal)}${C.kcalTarget ? ` <small>of ${fmtNum(C.kcalTarget)}</small>` : ''}</td><td class="r">${fmtNum(d.protein, 1)} g</td></tr>`).join('')}</tbody></table>`;
  }
  openSheet(html, { title });
}

function bind(root, ctx, from, to) {
  bindBodyweight(root);
  root.querySelectorAll('[data-measure]').forEach((b) => b.addEventListener('click', () => { ui.measure = b.dataset.measure; ctx.rerender(); }));
  root.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { ui.kind = b.dataset.kind; ui.anchor = null; ui.heat = null; ui.month = null; ctx.rerender(); }));
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const per = M.periodBounds(ui.kind, ui.anchor || today());
    ui.anchor = b.dataset.step === 'prev' ? per.prev : per.next; ui.heat = null; ui.month = null; ctx.rerender();
  }));
  root.querySelector('[data-ex]')?.addEventListener('change', (e) => { ui.ex = e.target.value; ctx.rerender(); });
  root.querySelector('[data-month]')?.addEventListener('change', (e) => { ui.month = e.target.value; ctx.rerender(); });
  root.querySelectorAll('[data-heat]').forEach((b) => b.addEventListener('click', () => { ui.heat = addMonthKey(ui.heat, Number(b.dataset.heat)); ctx.rerender(); }));
  root.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => more(b.dataset.more, from, to)));
  root.querySelector('[data-eq]')?.addEventListener('click', () => { ui.eqOffset += 3; ctx.rerender(); });
  root.querySelectorAll('.heat__c[data-day]').forEach((c) => c.addEventListener('click', () => { ctx.logDate = c.dataset.day; ctx.go('log'); }));
}


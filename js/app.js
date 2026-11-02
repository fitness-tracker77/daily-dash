// App controller: boot, tabs, re-rendering, celebrations, cycle import.
import * as store from './store.js';
import { loadCycle, validate, Cycle } from './data.js';
import * as M from './model.js';
import { today, esc, fmtDate, haptic } from './util.js';
import { ICON, closeSheet, confetti, banner, pulseRing, toast } from './ui.js';
import { renderToday } from './views/today.js';
import { renderWeek } from './views/week.js';
import { renderTraining } from './views/training.js';
import { renderPantry } from './views/pantry.js';
import { renderLog } from './views/log.js';
import { openSettings } from './views/settings.js';

// The only place the in-app display title appears.
const APP_TITLE = 'Segovia OS';

const VIEWS = { today: renderToday, week: renderWeek, training: renderTraining, pantry: renderPantry, log: renderLog };
const TABS = [['today', 'Today'], ['week', 'Week'], ['training', 'Training'], ['pantry', 'Pantry'], ['log', 'Log']];

const ctx = {
  tab: 'today',
  date: today(),
  todayAtBoot: today(),
  source: null,       // 'imported' | 'example'
  importedAt: null,
  warnings: [],
  problem: null,
  theme: 'dark',
  appTitle: APP_TITLE,
  openSettings() { openSettings(ctx); },
  toggleTheme() { toggleTheme(); },
  // install a cycle object (already parsed) and redraw
  applyCycle(raw, { source, importedAt = null, problem = null } = {}) {
    ctx.source = source; ctx.importedAt = importedAt; ctx.problem = problem;
    ctx.warnings = validate(raw);
    M.setCycle(new Cycle(raw));
    M.syncPantry();
    M.refreshSnaps();
    M.updateBadges();
    document.body.classList.remove('booting');
    render({ scrollTop: true });
  },
  async reloadCycle() {
    const res = await loadCycle();
    if (!res.cycle) { showFatal(res.fatal); return; }
    ctx.applyCycle(res.cycle, { source: res.source, importedAt: res.importedAt, problem: res.problem });
  },
  go(tab) {
    if (!VIEWS[tab]) return;
    closeSheet(true);
    const changed = tab !== ctx.tab;
    ctx.tab = tab;
    try { history.replaceState(null, '', `#${tab}`); } catch { /* file:// or sandbox */ }
    render({ scrollTop: changed });
  },
  setDate(d, dir = 0) { ctx.date = d; render({ scrollTop: true, dir }); },
  rerender() { render(); },
  before(date) {
    const e = M.eaten(date); const C = M.cycle();
    return {
      kcal: C.kcalTarget != null && e.kcal >= C.kcalTarget,
      protein: C.proteinTarget != null && e.protein >= C.proteinTarget,
      complete: M.progress(date).complete,
      badges: M.updateBadges().filter((b) => b.date).map((b) => b.id),
    };
  },
  afterChange(date, before, opts = {}) {
    const go = () => {
      render();
      const after = ctx.before(date);
      if (ctx.tab === 'today' && ctx.date === date) {
        const main = document.getElementById('main');
        if (!before.kcal && after.kcal && M.celebrateOnce(date, 'kcal')) { pulseRing(main, 'kcal'); haptic([10, 30, 10]); }
        if (!before.protein && after.protein && M.celebrateOnce(date, 'protein')) { pulseRing(main, 'protein'); haptic([10, 30, 10]); }
      }
      if (!before.complete && after.complete && M.celebrateOnce(date, 'day')) {
        confetti(); haptic([20, 40, 20, 40, 60]);
        banner('Day complete', fmtDate(date, { dow: true }));
      }
      const fresh = after.badges.filter((b) => !before.badges.includes(b));
      if (fresh.length) {
        const label = M.BADGES.find((b) => b.id === fresh[0])?.label;
        setTimeout(() => toast(`Badge earned: ${label}`), 900);
      }
    };
    opts.keepFocus ? setTimeout(go, 0) : go();
  },
};

function render({ scrollTop = false, dir = 0 } = {}) {
  const main = document.getElementById('main');
  const focusKey = document.activeElement?.dataset?.focusKey;
  const y = window.scrollY;
  const view = document.createElement('div');
  view.className = `view view--${ctx.tab}${dir ? (dir > 0 ? ' slide-next' : ' slide-prev') : ''}`;
  try {
    VIEWS[ctx.tab](view, ctx);
  } catch (e) {
    console.error(e);
    view.innerHTML = errorCard('This screen hit an error', String(e?.message || e));
  }
  main.replaceChildren(view);
  view.querySelectorAll('[data-theme-toggle]').forEach((b) => b.addEventListener('click', toggleTheme));
  view.querySelectorAll('[data-settings]').forEach((b) => b.addEventListener('click', () => ctx.openSettings()));
  document.querySelectorAll('.tabbar__btn').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === ctx.tab ? 'page' : 'false'));
  window.scrollTo(0, scrollTop ? 0 : y);
  if (focusKey) view.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function errorCard(title, msg) {
  return `<div class="card card--warn fatal"><h2>${ICON.warn} ${esc(title)}</h2><p>${esc(msg)}</p>
    <div class="set-row"><button class="btn btn--ghost" onclick="location.reload()">Reload</button><button class="btn btn--accent" data-settings>Settings</button></div></div>`;
}
// no cycle at all: still never a blank screen, and Import stays reachable
function showFatal(msg) {
  document.body.classList.add('booting');
  const main = document.getElementById('main');
  main.innerHTML = errorCard('No cycle loaded', msg);
  main.querySelector('[data-settings]').addEventListener('click', () => ctx.openSettings());
}

// ------------------------------------------------------------ theme
function applyTheme(t) {
  ctx.theme = t;
  document.documentElement.dataset.theme = t;
  const color = t === 'light' ? '#F3F2EF' : '#1B1C1F';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}
function toggleTheme() {
  applyTheme(ctx.theme === 'light' ? 'dark' : 'light');
  store.get().prefs = { ...(store.get().prefs || {}), theme: ctx.theme };
  store.save();
  render();
}

// ------------------------------------------------------------ tab bar
function buildTabbar() {
  const nav = document.getElementById('tabbar');
  nav.innerHTML = TABS.map(([id, label]) => `<button class="tabbar__btn" data-tab="${id}">${ICON[id]}<span>${label}</span></button>`).join('');
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    haptic(5);
    if (b.dataset.tab === ctx.tab && ctx.tab === 'today' && ctx.date !== today()) { ctx.setDate(today()); return; }
    ctx.go(b.dataset.tab);
  });
}

// ------------------------------------------------------------ boot
async function boot() {
  store.load();
  applyTheme(store.get().prefs?.theme === 'light' ? 'light' : 'dark');
  buildTabbar();
  const fromHash = location.hash.replace('#', '');
  if (VIEWS[fromHash]) ctx.tab = fromHash;

  await ctx.reloadCycle();
}

// a new calendar day while the app stayed open
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !M.cycle()) return;
  const t = today();
  if (t !== ctx.todayAtBoot) {
    if (ctx.date === ctx.todayAtBoot) ctx.date = t;
    ctx.todayAtBoot = t;
    M.refreshSnaps();
    render();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e)));
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('main').innerHTML = errorCard(`${APP_TITLE} could not start`, String(e?.message || e));
});

// App controller: boot, tabs, re-rendering, day-complete moment, cycle import.
import * as store from './store.js';
import { loadCycle, validate, Cycle } from './data.js';
import * as M from './model.js';
import { today, esc, haptic } from './util.js';
import { ICON, closeSheet, confetti, toast } from './ui.js';
import { saveBackupFile } from './backup.js';
import { renderToday } from './views/today.js';
import { renderTrain } from './views/train.js';
import { renderFuel } from './views/fuel.js';
import { renderInsights } from './views/insights.js';
import { renderLog } from './views/log.js';
import { openSettings } from './views/settings.js';

// The only place the in-app display title appears. Tab and home-screen label stay "Daily Dash".
const APP_TITLE = 'Segovia OS';
export const APP_VERSION = 'v8'; // keep in step with VERSION in sw.js

const VIEWS = { today: renderToday, train: renderTrain, fuel: renderFuel, insights: renderInsights, log: renderLog };
const TABS = [['today', 'Today'], ['train', 'Train'], ['fuel', 'Fuel'], ['insights', 'Insights'], ['log', 'Log']];

const ctx = {
  tab: 'today',
  date: today(),
  logDate: null,
  todayAtBoot: today(),
  source: null,
  importedAt: null,
  warnings: [],
  problem: null,
  theme: 'dark',
  appTitle: APP_TITLE,
  version: APP_VERSION,
  persist: null,
  openSettings() { openSettings(ctx); },
  toggleTheme() { toggleTheme(); },
  applyCycle(raw, { source, importedAt = null, problem = null } = {}) {
    ctx.source = source; ctx.importedAt = importedAt; ctx.problem = problem;
    ctx.warnings = validate(raw);
    M.setCycle(new Cycle(raw));
    M.migratePositionKeys();
    M.cleanExampleData();
    M.syncPantry();
    M.backfillMuscles();
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
    try { history.replaceState(null, '', `#${tab}`); } catch { /* sandboxed */ }
    render({ scrollTop: changed });
  },
  setDate(d, dir = 0) { ctx.date = d; render({ scrollTop: true, dir }); },
  rerender() { render(); },
  before(date) {
    return { complete: M.progress(date).complete, badges: M.updateBadges().filter((b) => b.date).map((b) => b.id) };
  },
  afterChange(date, before, opts = {}) {
    const go = () => {
      render();
      const after = ctx.before(date);
      if (!before.complete && after.complete && M.celebrateOnce(date, 'day')) {
        confetti(document.querySelector('.hero--rings') || document.querySelector('.hero'));
        haptic([15, 40, 15]);
      }
      const fresh = after.badges.filter((b) => !before.badges.includes(b));
      if (fresh.length) setTimeout(() => toast(`Badge: ${M.BADGES.find((b) => b.id === fresh[0])?.label}`), 700);
    };
    opts.keepFocus ? setTimeout(go, 0) : go();
  },
};
if (typeof window !== 'undefined') window.__dashCtx = ctx; // read-only handle for tests and debugging

function render({ scrollTop = false, dir = 0 } = {}) {
  const main = document.getElementById('main');
  const focusKey = document.activeElement?.dataset?.focusKey;
  const y = window.scrollY;
  const view = document.createElement('div');
  view.className = `view view--${ctx.tab}${dir ? (dir > 0 ? ' from-right' : ' from-left') : ''}`;
  try {
    VIEWS[ctx.tab](view, ctx);
  } catch (e) {
    console.error(e);
    view.innerHTML = errorBlock('This screen hit an error', String(e?.message || e));
  }
  main.replaceChildren(view);
  view.querySelectorAll('[data-settings]').forEach((b) => b.addEventListener('click', () => ctx.openSettings()));
  view.querySelectorAll('[data-backup-now]').forEach((b) => b.addEventListener('click', async () => {
    const r = await saveBackupFile().catch((e) => { toast(`Backup failed: ${e?.message || e}`); return null; });
    if (r && r !== 'cancelled') { toast(r === 'shared' ? 'Backup saved' : 'Backup downloaded'); render(); }
  }));
  document.querySelectorAll('.tabbar__b').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === ctx.tab ? 'page' : 'false'));
  window.scrollTo(0, scrollTop ? 0 : y);
  if (focusKey) view.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function errorBlock(title, msg) {
  return `<section class="fatal"><h2 class="h2">${ICON.warn} ${esc(title)}</h2><p>${esc(msg)}</p>
    <div class="set__row"><button class="btn btn--line" onclick="location.reload()">Reload</button><button class="btn btn--gold" data-settings>Settings</button></div></section>`;
}
// no cycle at all: never a blank screen, and Import stays reachable
function showFatal(msg) {
  document.body.classList.remove('booting');
  const main = document.getElementById('main');
  main.innerHTML = errorBlock('No cycle loaded', msg);
  main.querySelector('[data-settings]').addEventListener('click', () => ctx.openSettings());
}

// ------------------------------------------------------------ theme
function applyTheme(t) {
  ctx.theme = t === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = ctx.theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', ctx.theme === 'light' ? '#F4EEE2' : '#0C0B09'));
}
function toggleTheme() {
  applyTheme(ctx.theme === 'light' ? 'dark' : 'light');
  M.setSetting('theme', ctx.theme);
  render();
}

// ------------------------------------------------------------ tab bar
function buildTabbar() {
  const nav = document.getElementById('tabbar');
  nav.innerHTML = TABS.map(([id, label]) => `<button class="tabbar__b" data-tab="${id}">${ICON[id]}<span>${label}</span></button>`).join('');
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    haptic(5);
    if (b.dataset.tab === ctx.tab && (ctx.tab === 'today' || ctx.tab === 'train') && ctx.date !== today()) { ctx.setDate(today()); return; }
    ctx.go(b.dataset.tab);
  });
}

// ------------------------------------------------------------ boot
async function boot() {
  await store.init();
  applyTheme(M.settings().theme);
  buildTabbar();
  const fromHash = location.hash.replace('#', '');
  if (VIEWS[fromHash]) ctx.tab = fromHash;
  M.initRollups();
  await ctx.reloadCycle();
  store.requestPersist().then((r) => { ctx.persist = r; const el = document.querySelector('[data-persist]'); if (el) el.textContent = r; });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !M.cycle()) return;
  const t = today();
  if (t !== ctx.todayAtBoot) { // a new calendar day while the app stayed open
    if (ctx.date === ctx.todayAtBoot) ctx.date = t;
    ctx.todayAtBoot = t;
    M.refreshSnaps();
    render();
  }
});

// Service worker: offline shell. When a new version activates, reload once so the new code runs.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    store.flush().finally(() => location.reload());
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((reg) => reg?.update?.()).catch((e) => console.warn('SW registration failed', e)));
}

boot().catch((e) => {
  console.error(e);
  document.body.classList.remove('booting');
  document.getElementById('main').innerHTML = errorBlock(`${APP_TITLE} could not start`, String(e?.message || e));
});

// Rest timer: a slim bar above the tab bar that survives screen changes.
// Updates exactly when the shown second changes; vibrates and beeps at the end.
import { fmtClock, haptic, beep, primeAudio } from './util.js';
import { toast } from './ui.js';

const st = { endAt: null, total: 0, label: '' };
let timer = null;
let bar = null;

export const restState = () => ({ running: !!st.endAt, left: st.endAt ? Math.max(0, (st.endAt - Date.now()) / 1000) : 0, total: st.total, label: st.label });

export function startRest(seconds, label = '') {
  primeAudio();
  st.total = seconds; st.label = label;
  st.endAt = Date.now() + Math.round(seconds * 1000);
  draw(); schedule();
}
export function stopRest() {
  st.endAt = null; clearTimeout(timer); timer = null; draw();
}
export function addRest(seconds) {
  if (!st.endAt) return;
  st.endAt += seconds * 1000; st.total += seconds; draw(); schedule();
}

function schedule() {
  clearTimeout(timer); timer = null;
  if (!st.endAt) return;
  const ms = st.endAt - Date.now();
  timer = setTimeout(tick, ms <= 0 ? 0 : (ms % 1000 || 1000));
}
function tick() {
  if (st.endAt && Date.now() >= st.endAt) {
    st.endAt = null;
    haptic([300, 120, 300]); beep();
    toast('Rest over');
    draw();
    return;
  }
  draw(); schedule();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st.endAt) tick(); });

function draw() {
  if (!st.endAt) { bar?.remove(); bar = null; document.body.classList.remove('has-rest'); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'restbar';
    bar.setAttribute('role', 'timer');
    bar.innerHTML = `<span class="restbar__label"></span><span class="restbar__time" data-rest-time></span>
      <button class="link" data-rest-add>+30 s</button><button class="link" data-rest-stop>Skip</button>
      <span class="restbar__track"><span class="restbar__fill"></span></span>`;
    bar.querySelector('[data-rest-stop]').addEventListener('click', stopRest);
    bar.querySelector('[data-rest-add]').addEventListener('click', () => addRest(30));
    document.body.appendChild(bar);
    document.body.classList.add('has-rest');
  }
  const left = Math.max(0, (st.endAt - Date.now()) / 1000);
  bar.querySelector('.restbar__label').textContent = st.label ? `Rest, ${st.label}` : 'Rest';
  bar.querySelector('[data-rest-time]').textContent = fmtClock(left);
  bar.querySelector('.restbar__fill').style.transform = `scaleX(${st.total ? left / st.total : 0})`;
}

/* =====================================================================
 * Test mode overlay: exit, short controls help, live state, and touch
 * controls (joystick + jump) on touch screens.
 * ===================================================================== */
import { h, btn, iconBtn, num } from './dom.js';
import { icon } from './icons.js';
import { round } from '../core/math.js';

const STATE_LABEL = { ground: 'على الأرض', jump: 'قفز', fall: 'سقوط', land: 'هبوط' };

export function mountTestHud(stage, s) {
  const hud = h('div.test-hud', { hidden: true });
  const exit = btn('العودة إلى التحرير', { icon: 'exit', cls: 'primary', kbd: 'Esc', tip: 'الخروج من التجربة', onClick: () => s.exitTest() });
  const stateEl = h('div.test-state', { 'aria-live': 'off' });
  const help = h('div.test-help', null,
    h('div.th-row.kb', null, h('kbd', null, 'W A S D'), h('span', null, 'أو الأسهم للحركة')),
    h('div.th-row.kb', null, h('kbd', null, 'Shift'), h('span', null, 'ركض')),
    h('div.th-row.kb', null, h('kbd', null, 'Space'), h('span', null, 'قفز')),
    h('div.th-row', null, icon('hand', 16), h('span', null, 'اسحب لتدوير الكاميرا')),
    h('div.th-row.touch', null, icon('hand', 16), h('span', null, 'عصا التحكم للحركة — دفعها للحافة للركض')));
  const helpBtn = iconBtn({ icon: 'info', label: 'تعليمات التحكم', cls: 'tg', onClick: () => { help.hidden = !help.hidden; helpBtn.setAttribute('aria-pressed', String(!help.hidden)); } });
  helpBtn.setAttribute('aria-pressed', 'true');
  const respawn = iconBtn({ icon: 'home', label: 'العودة لنقطة البداية', onClick: () => s.arena.respawn() });
  hud.append(h('div.test-top', null, exit, h('div.test-tools', null, helpBtn, respawn)), stateEl, help);

  // touch controls
  const stick = h('div.stick', { 'aria-label': 'عصا التحكم بالحركة', role: 'application' }, h('div.stick-knob'));
  const jump = h('button.jump-btn', { type: 'button', 'aria-label': 'قفز' }, icon('jump', 28));
  hud.append(h('div.touch-ctl', null, stick, jump));
  stage.append(hud);

  const keys = new Set();
  let stickV = [0, 0], stickId = null;
  const knob = stick.firstChild;
  function push() {
    let x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    let y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    let run = keys.has('shift');
    if (stickId !== null) { x = stickV[0]; y = stickV[1]; run = Math.hypot(x, y) > 0.82; }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    s.arena.setInput({ move: [x, y], run });
  }
  const onKey = (e, down) => {
    if (!s.ui.testing) return;
    const k = e.key.toLowerCase();
    const map = { 'ش': 'a', 'س': 's', 'ي': 'd', 'ص': 'w' };          // Arabic keyboard layout
    const kk = map[k] || k;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(kk)) {
      e.preventDefault(); down ? keys.add(kk) : keys.delete(kk); push();
    } else if (kk === ' ' && down) { e.preventDefault(); if (!e.repeat) s.arena.setInput({ jump: true }); }
  };
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));
  window.addEventListener('blur', () => { keys.clear(); if (s.ui.testing) push(); });

  stick.addEventListener('pointerdown', e => { stickId = e.pointerId; (() => { try { stick.setPointerCapture(e.pointerId); } catch { /* synthetic or finished pointer */ } })(); move(e); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) move(e); });
  const release = e => { if (e.pointerId !== stickId) return; stickId = null; stickV = [0, 0]; knob.style.transform = ''; push(); };
  stick.addEventListener('pointerup', release); stick.addEventListener('pointercancel', release);
  function move(e) {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    stickV = [x, y];
    knob.style.transform = `translate(${x * R * 0.55}px, ${y * R * 0.55}px)`;
    push();
  }
  jump.addEventListener('pointerdown', e => { e.preventDefault(); s.arena.setInput({ jump: true }); jump.classList.add('down'); });
  jump.addEventListener('pointerup', () => jump.classList.remove('down'));
  jump.addEventListener('pointercancel', () => jump.classList.remove('down'));

  function update(f) {
    hud.hidden = !s.ui.testing;
    if (!s.ui.testing) { keys.clear(); stickId = null; return; }
    if (f.testing) { help.hidden = false; helpBtn.setAttribute('aria-pressed', 'true'); setTimeout(() => exit.focus({ preventScroll: true }), 50); }
    const st = s.arena.state || {};
    stateEl.replaceChildren(h('span.ts-state', null, STATE_LABEL[st.state] || '—'), num(round(st.speed || 0, 1), 'م/ث'));
  }
  s.subscribe(f => { if (f.all || f.testing || f.test) update(f); });
  update({});
}

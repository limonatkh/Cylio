/* =====================================================================
 * Responsive layout.
 *  desktop  : right panel | scene (+ timeline) | left panel
 *  phone    : scene on top, sections in a bottom bar, panels in one
 *             draggable bottom sheet (peek / half / full)
 *  phone landscape : sections rail + side sheet, the timeline under the scene
 * ===================================================================== */
import { h } from './dom.js';
import { icon } from './icons.js';
import { SECTIONS } from './sidepanel.js';

const MQ_PHONE = '(max-width: 760px)';
const MQ_LAND = '(max-height: 520px) and (orientation: landscape) and (max-width: 1100px)';
const PEEK = 158;

export function mountLayout(app, s) {
  const dock = app.querySelector('.dock');
  const handle = dock.querySelector('.sheet-handle');
  const nav = app.querySelector('.bottom-nav');
  const navBtns = SECTIONS.map(sec => {
    const b = h('button.nav-btn', { type: 'button', 'data-sec': sec.id, onclick: () => { const same = s.ui.section === sec.id; s.setSection(sec.id); if (sec.id !== 'anim' && (state === 'peek' || same)) setState(same && state !== 'peek' ? 'peek' : 'half'); } }, icon(sec.icon, 22), h('span', null, sec.label));
    nav.append(b); return b;
  });
  const testBtn = h('button.nav-btn.test', { type: 'button', onclick: () => (s.ui.testing ? s.exitTest() : s.enterTest()) }, icon('test', 22), h('span', null, 'تجربة'));
  nav.append(testBtn);

  const mPhone = matchMedia(MQ_PHONE), mLand = matchMedia(MQ_LAND);
  let kind = '', state = 'peek';
  function apply() {
    const k = mLand.matches ? 'land' : mPhone.matches ? 'phone' : 'desktop';
    if (k !== kind) { kind = k; app.dataset.layout = k; if (k === 'phone') setState(state, true); else dock.style.removeProperty('--sheet-h'); s.vp?.resize(); }
  }
  const heights = () => {
    const H = app.clientHeight;
    return { peek: PEEK, half: Math.round(H * 0.46), full: Math.round(H - 96) };
  };
  function setState(st, instant) {
    state = st; dock.dataset.sheet = st;
    dock.style.setProperty('--sheet-h', heights()[st] + 'px');
    handle.setAttribute('aria-expanded', String(st !== 'peek'));
    handle.setAttribute('aria-label', st === 'peek' ? 'فتح لوحة الخصائص' : 'تصغير لوحة الخصائص');
    if (instant) dock.classList.add('no-anim'), requestAnimationFrame(() => dock.classList.remove('no-anim'));
    if (st === 'peek') dock.scrollTop = 0;
  }
  // drag the sheet
  let drag = null;
  handle.addEventListener('pointerdown', e => {
    if (kind !== 'phone') return;
    (() => { try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic or finished pointer */ } })();
    drag = { y0: e.clientY, h0: dock.getBoundingClientRect().height, moved: false };
    dock.classList.add('no-anim');
  });
  handle.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = drag.y0 - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    const hs = heights();
    dock.style.setProperty('--sheet-h', Math.max(hs.peek - 30, Math.min(hs.full, drag.h0 + dy)) + 'px');
  });
  const end = e => {
    if (!drag) return;
    dock.classList.remove('no-anim');
    const hNow = dock.getBoundingClientRect().height, hs = heights();
    if (!drag.moved) setState(state === 'peek' ? 'half' : 'peek');
    else {
      const v = drag.h0 - hNow;          // >0 shrinking
      let best = Object.entries(hs).sort((a, b) => Math.abs(a[1] - hNow) - Math.abs(b[1] - hNow))[0][0];
      if (Math.abs(v) > 60) best = v > 0 ? (hNow < hs.half ? 'peek' : 'half') : (hNow > hs.half ? 'full' : 'half');
      setState(best);
    }
    drag = null; void e;
  };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setState(state === 'peek' ? 'half' : state === 'half' ? 'full' : 'peek'); } });

  function update(f) {
    for (const b of navBtns) { const on = b.dataset.sec === s.ui.section; b.setAttribute('aria-current', on ? 'page' : 'false'); b.classList.toggle('on', on); }
    testBtn.classList.toggle('on', s.ui.testing);
    testBtn.querySelector('span').textContent = s.ui.testing ? 'تحرير' : 'تجربة';
    testBtn.replaceChild(icon(s.ui.testing ? 'exit' : 'test', 22), testBtn.querySelector('svg'));
    app.classList.toggle('is-testing', s.ui.testing);
    app.dataset.section = s.ui.section;
    if (kind === 'phone' && (f.select && s.ui.selected)) {
      if (state === 'peek' && s.ui.section !== 'anim') setState('half');
      if (s.ui.section !== 'anim') requestAnimationFrame(() => { const p = dock.querySelector('.props'); if (p && state !== 'peek') dock.scrollTo({ top: p.offsetTop - 8, behavior: 'smooth' }); });
    }
    if (f.section && kind === 'phone' && s.ui.section === 'anim') setState('peek');
    if (f.testing) s.vp?.resize();
  }
  s.subscribe(f => { if (f.all || f.section || f.select || f.testing || f.ui) update(f); });
  mPhone.addEventListener('change', apply); mLand.addEventListener('change', apply);
  window.addEventListener('resize', () => { if (kind === 'phone') setState(state, true); });
  apply(); update({});
  return { setState, get kind() { return kind; } };
}

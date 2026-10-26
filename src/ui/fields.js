/* =====================================================================
 * Property fields. Each field reads its value through get() and writes
 * through the callbacks, so panels can refresh values in place
 * (field.update()) without rebuilding — a slider being dragged is never
 * replaced under the finger.
 *
 *   live(v)   called while the value changes (slider drag, colour picker)
 *   commit()  called once when the change is finished (one undo step)
 * ===================================================================== */
import { h, iconBtn, num } from './dom.js';
import { icon } from './icons.js';
import { normHex, SWATCHES } from '../core/appearance.js';
import { round, clamp } from '../core/math.js';

let uid = 0;
const fid = () => 'f' + (++uid);

/**
 * Slider + precise number + reset.
 * o: { label, get, live, commit, min, max, step, scale (display = value × scale), decimals, unit, def, hint, disabled }
 */
export function numField(o) {
  const id = fid(), sc = o.scale || 1, dec = o.decimals ?? 1;
  const disp = v => round(v * sc, dec);
  const range = h('input.range', { type: 'range', id: id + 'r', min: o.min * sc, max: o.max * sc, step: o.step || Math.pow(10, -dec), 'aria-label': o.label, dir: 'ltr' });
  const box = h('input.numbox', { type: 'number', id, min: o.min * sc, max: o.max * sc, step: o.step || Math.pow(10, -dec), inputmode: 'decimal', dir: 'ltr', 'aria-label': `${o.label}${o.unit ? ' (' + o.unit + ')' : ''}` });
  const reset = iconBtn({ icon: 'reset', label: 'إعادة القيمة الأصلية', cls: 'reset', size: 16, onClick: () => { o.live(o.def); o.commit(); update(); } });
  const row = h('div.field.num-field', { class: o.cls },
    h('div.field-top', null, h('label.field-label', { for: id }, o.label, o.hint ? h('small', null, o.hint) : null), o.def !== undefined ? reset : null),
    h('div.field-ctl', null, range, h('div.numwrap', null, box, o.unit ? h('span.unit', null, o.unit) : null)));
  let dragging = false;
  const setFill = v => { const p = (v - o.min * sc) / ((o.max - o.min) * sc || 1) * 100; range.style.setProperty('--p', clamp(p, 0, 100) + '%'); };
  range.addEventListener('pointerdown', () => { dragging = true; });
  range.addEventListener('input', () => { const v = +range.value / sc; box.value = disp(v); setFill(+range.value); o.live(v); });
  range.addEventListener('change', () => { dragging = false; o.commit(); update(); });
  range.addEventListener('pointerup', () => { dragging = false; });
  box.addEventListener('change', () => {
    if (box.value === '' || !Number.isFinite(+box.value)) { update(); return; }
    o.live(clamp(+box.value / sc, o.min, o.max)); o.commit(); update();
  });
  box.addEventListener('keydown', e => { if (e.key === 'Enter') box.blur(); if (e.key === 'Escape') { update(); box.blur(); } });
  function update() {
    const v = o.get();
    const off = o.disabled ? o.disabled() : false;
    range.disabled = box.disabled = !!off; row.classList.toggle('disabled', !!off);
    if (!dragging && document.activeElement !== range) { range.value = v * sc; setFill(v * sc); }
    if (document.activeElement !== box) box.value = disp(v);
    if (o.def !== undefined) reset.classList.toggle('on', Math.abs(v - o.def) > Math.pow(10, -dec - 1) / sc && !off);
  }
  row.update = update; update();
  return row;
}

/** Two-way toggle switch. o: { label, get, set, hint, icon } */
export function toggle(o) {
  const id = fid();
  const sw = h('button.switch', { type: 'button', role: 'switch', id, 'aria-label': o.label, onclick: () => { o.set(!o.get()); update(); } }, h('span.knob'));
  const row = h('div.field.toggle-field', { class: o.cls }, h('label.field-label', { for: id }, o.icon ? icon(o.icon, 16) : null, h('span', null, o.label), o.hint ? h('small', null, o.hint) : null), sw);
  function update() { const v = !!o.get(); sw.setAttribute('aria-checked', String(v)); const off = o.disabled ? o.disabled() : false; sw.disabled = !!off; row.classList.toggle('disabled', !!off); }
  row.update = update; update();
  return row;
}

/** Segmented choice. o: { label, options: [{ v, label, icon }], get, set, compact } */
export function segmented(o) {
  const g = h('div.seg', { role: 'radiogroup', 'aria-label': o.label, class: o.compact ? 'compact' : '' });
  const bs = o.options.map(opt => {
    const b = h('button.seg-btn', { type: 'button', role: 'radio', 'data-v': opt.v, 'data-tip': opt.tip, 'data-kbd': opt.kbd, onclick: () => { o.set(opt.v); update(); } });
    if (opt.icon) b.append(icon(opt.icon, 18));
    if (opt.label) b.append(h('span', null, opt.label));
    if (!opt.label) b.setAttribute('aria-label', opt.tip);
    g.append(b); return b;
  });
  g.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = o.options.findIndex(x => x.v === o.get());
    const d = (e.key === 'ArrowLeft') ? 1 : -1;                // RTL: left = next
    const n = o.options[(i + d + o.options.length) % o.options.length];
    o.set(n.v); update(); bs[o.options.indexOf(n)].focus(); e.preventDefault();
  });
  const row = o.label && !o.bare ? h('div.field', null, h('div.field-label', null, o.label), g) : g;
  function update() { const v = o.get(); bs.forEach((b, i) => { const on = o.options[i].v === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); }
  row.update = update; update();
  return row;
}

/** Native select with the studio look. o: { label, options: [{ v, label }], get, set } */
export function selectField(o) {
  const id = fid();
  const s = h('select.select', { id }, o.options.map(x => h('option', { value: x.v }, x.label)));
  s.addEventListener('change', () => o.set(s.value));
  const row = h('div.field', { class: o.cls }, h('label.field-label', { for: id }, o.label), h('div.select-wrap', null, s, icon('chevronDown', 16)));
  row.update = () => { s.value = o.get(); }; row.update();
  return row;
}

/* ------------------------------------------------------------------ colour */
const RECENT_KEY = 'cylio.recentColors';
export function recentColors() { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter(c => normHex(c)).slice(0, 8) : []; } catch { return []; } }
export function pushRecent(c) { try { const a = [c, ...recentColors().filter(x => x !== c)].slice(0, 8); localStorage.setItem(RECENT_KEY, JSON.stringify(a)); } catch { /* storage off */ } }

/**
 * Colour field: current swatch + hex; opens an inline palette (swatches,
 * recent colours, hex input and the system picker).
 * o: { label, get, live, commit }
 */
export function colorField(o) {
  const id = fid();
  const chip = h('span.chip');
  const hex = h('input.hexbox', { id, dir: 'ltr', maxlength: 7, spellcheck: 'false', autocomplete: 'off', 'aria-label': o.label + ' (HEX)' });
  const toggleBtn = h('button.color-btn', { type: 'button', 'aria-expanded': 'false', 'aria-label': 'لوحة الألوان: ' + o.label }, chip, icon('chevronDown', 16));
  const pal = h('div.palette', { hidden: true });
  const native = h('input', { type: 'color', class: 'native-color', 'aria-label': 'لون مخصص' });
  const apply = c => { o.live(c); o.commit(); pushRecent(c); update(); };
  const sw = c => h('button.sw', { type: 'button', style: { '--c': c }, 'aria-label': c, 'data-tip': c, onclick: () => apply(c) });
  function fillPalette() {
    const rec = recentColors();
    pal.replaceChildren(...[
      rec.length ? h('div.pal-label', null, 'المستخدمة مؤخراً') : null,
      rec.length ? h('div.swatches', null, rec.map(sw)) : null,
      h('div.pal-label', null, 'ألوان جاهزة'),
      h('div.swatches', null, SWATCHES.map(sw)),
      h('label.btn.small.native-wrap', null, icon('palette', 16), h('span', null, 'لون مخصص…'), native),
    ].filter(Boolean));
    markCurrent();
  }
  const markCurrent = () => { const v = o.get(); pal.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.getAttribute('aria-label') === v)); };
  toggleBtn.addEventListener('click', () => { const open = pal.hidden; if (open) fillPalette(); pal.hidden = !open; toggleBtn.setAttribute('aria-expanded', String(open)); });
  hex.addEventListener('change', () => { const c = normHex(hex.value); if (c) apply(c); else { hex.classList.add('bad'); setTimeout(() => hex.classList.remove('bad'), 900); update(); } });
  hex.addEventListener('keydown', e => { if (e.key === 'Enter') hex.blur(); });
  native.addEventListener('input', () => { const c = normHex(native.value); if (c) { o.live(c); chip.style.background = c; hex.value = c; } });
  native.addEventListener('change', () => { const c = normHex(native.value); if (c) apply(c); });
  const row = h('div.field.color-field', { class: o.cls },
    h('div.field-top', null, h('label.field-label', { for: id }, o.label)),
    h('div.color-row', null, toggleBtn, hex), pal);
  function update() { const v = o.get(); chip.style.background = v; if (document.activeElement !== hex) hex.value = v; native.value = v.toLowerCase(); if (!pal.hidden) markCurrent(); }
  row.update = update; update();
  return row;
}

/* ------------------------------------------------------------------ collapsible group */
const openState = new Map();
export function group(title, kids, o = {}) {
  const key = o.id || title;
  const open = openState.has(key) ? openState.get(key) : !!o.open;
  const body = h('div.group-body', { hidden: !open }, kids);
  const head = h('button.group-head', { type: 'button', 'aria-expanded': String(open) }, o.icon ? icon(o.icon, 16) : null, h('span', null, title), o.badge ? h('span.badge', null, o.badge) : null, icon('chevronDown', 16));
  head.addEventListener('click', () => { const v = body.hidden; body.hidden = !v; head.setAttribute('aria-expanded', String(v)); openState.set(key, v); if (v) g.update(); });
  const g = h('section.group', { class: o.cls }, head, body);
  g.update = () => body.querySelectorAll('.field').forEach(f => f.update?.());
  return g;
}

/** Read-only value row. */
export function readout(label, value, unit) { return h('div.readout', null, h('span', null, label), num(value, unit)); }

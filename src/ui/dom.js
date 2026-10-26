/* =====================================================================
 * DOM helpers: element builder, tooltips, toasts, menus and dialogs.
 * ===================================================================== */
import { icon } from './icons.js';

export function h(tag, attrs, ...kids) {
  const [t, ...cls] = tag.split('.');
  const el = document.createElement(t || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Numbers and Latin terms inside Arabic text: isolate them so RTL never reorders them. */
export const num = (v, unit) => h('span.num', null, h('bdi', { dir: 'ltr' }, String(v)), unit ? '\u00A0' + unit : null);

/**
 * Icon button. o: { icon, label (accessible name + tooltip), kbd, onClick, cls, pressed, disabled, text }
 */
export function iconBtn(o) {
  const b = h('button.ibtn', { type: 'button', class: o.cls, 'aria-label': o.label, 'data-tip': o.tip === false ? null : o.label, 'data-kbd': o.kbd, onclick: o.onClick, disabled: o.disabled });
  b.append(icon(o.icon, o.size || 20));
  if (o.text) b.append(h('span.ibtn-text', null, o.text));
  if (o.pressed !== undefined) b.setAttribute('aria-pressed', String(!!o.pressed));
  return b;
}
export function btn(text, o = {}) {
  const b = h('button.btn', { type: 'button', class: o.cls, onclick: o.onClick, disabled: o.disabled, 'data-tip': o.tip, 'data-kbd': o.kbd, 'aria-label': o.label });
  if (o.icon) b.append(icon(o.icon, 18));
  if (text) b.append(h('span', null, text));
  return b;
}

/* ------------------------------------------------------------------ tooltips (desktop / mouse only) */
export function initTooltips() {
  const tip = h('div.tooltip', { role: 'tooltip', 'aria-hidden': 'true' });
  document.body.append(tip);
  let cur = null, timer = 0;
  const hide = () => { clearTimeout(timer); tip.classList.remove('show'); cur = null; };
  const show = el => {
    const label = el.getAttribute('data-tip'); if (!label) return;
    tip.replaceChildren(h('span', null, label));
    const k = el.getAttribute('data-kbd');
    if (k) tip.append(h('kbd', { dir: 'ltr' }, k));
    const r = el.getBoundingClientRect();
    tip.style.left = '0px'; tip.style.top = '0px'; tip.classList.add('show');
    const tr = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2, y = r.bottom + 8;
    if (y + tr.height > innerHeight - 6) y = r.top - tr.height - 8;
    x = Math.max(6, Math.min(innerWidth - tr.width - 6, x));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest?.('[data-tip]');
    if (el === cur) return;
    hide();
    if (!el) return;
    cur = el; timer = setTimeout(() => cur === el && el.isConnected && show(el), 450);
  });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  window.addEventListener('blur', hide);
  document.addEventListener('scroll', hide, true);
}

/* ------------------------------------------------------------------ toasts */
let toastBox;
export function toast(text, o = {}) {
  if (!toastBox) { toastBox = h('div.toasts', { 'aria-live': 'polite' }); document.body.append(toastBox); }
  const t = h('div.toast', { class: o.kind ? 'toast-' + o.kind : '' });
  if (o.kind === 'error') t.append(icon('alert', 18)); else if (o.kind === 'ok') t.append(icon('check', 18));
  t.append(h('span.toast-text', null, text));
  if (o.action) t.append(h('button.toast-action', { type: 'button', onclick: () => { o.action.run(); close(); } }, o.action.label));
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 180); };
  toastBox.append(t);
  while (toastBox.children.length > 3) toastBox.firstChild.remove();
  setTimeout(close, o.ms || (o.action ? 6000 : 2600));
  return close;
}

/* ------------------------------------------------------------------ menus
 * items: [{ label, icon, kbd, onClick, disabled, danger, checked, hint } | '-' | { heading }]
 */
let openMenu = null;
export function closeMenu() { if (openMenu) { openMenu.close(); openMenu = null; } }
export function menu(anchor, items, o = {}) {
  closeMenu();
  const m = h('div.menu', { role: 'menu' });
  const close = () => { m.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); anchor.setAttribute('aria-expanded', 'false'); if (o.onClose) o.onClose(); };
  for (const it of items) {
    if (it === '-') { m.append(h('div.menu-sep', { role: 'separator' })); continue; }
    if (it.heading) { m.append(h('div.menu-head', null, it.heading)); continue; }
    const b = h('button.menu-item', { type: 'button', role: it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem', disabled: it.disabled, class: it.danger ? 'danger' : '' });
    if (it.checked !== undefined) b.setAttribute('aria-checked', String(!!it.checked));
    b.append(it.icon ? icon(it.icon, 18) : it.checked !== undefined ? icon(it.checked ? 'check' : 'dot', 18) : h('span.ic-space'));
    const txt = h('span.menu-label', null, it.label);
    if (it.hint) txt.append(h('small', null, it.hint));
    b.append(txt);
    if (it.kbd) b.append(h('kbd', { dir: 'ltr' }, it.kbd));
    if (it.checked !== undefined && !it.checked) b.querySelector('.ic').style.opacity = '0';
    b.addEventListener('click', () => { closeMenu(); it.onClick?.(); });
    m.append(b);
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
  // RTL: by default the menu's right edge lines up with the anchor's right edge
  let x = o.align === 'end' ? r.left : r.right - mr.width;
  x = Math.max(6, Math.min(innerWidth - mr.width - 6, x));
  let y = r.bottom + 6;
  if (y + mr.height > innerHeight - 6) y = Math.max(6, r.top - mr.height - 6);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  const outside = e => { if (!m.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
  const key = e => {
    const list = [...m.querySelectorAll('.menu-item:not([disabled])')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Tab') closeMenu();
  };
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true); });
  anchor.setAttribute('aria-expanded', 'true');
  openMenu = { close };
  if (o.focus !== false) m.querySelector('.menu-item:not([disabled])')?.focus({ preventScroll: true });
  return m;
}

/* ------------------------------------------------------------------ dialogs */
export function dialog(o) {
  const prev = document.activeElement;
  const back = h('div.modal-back');
  const box = h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-title', class: o.cls });
  const close = v => { back.classList.add('out'); setTimeout(() => back.remove(), 150); document.removeEventListener('keydown', key, true); prev?.focus?.({ preventScroll: true }); o.onClose?.(v); };
  const head = h('div.modal-head', null, h('h2', { id: 'dlg-title' }, o.title), iconBtn({ icon: 'close', label: 'إغلاق', onClick: () => close(null), tip: false }));
  const body = h('div.modal-body');
  if (o.body) body.append(...[].concat(o.body(close)));
  box.append(head, body);
  if (o.actions) {
    const foot = h('div.modal-foot');
    for (const a of o.actions) foot.append(btn(a.label, { cls: a.cls || (a.primary ? 'primary' : a.danger ? 'danger' : ''), onClick: () => { const r = a.onClick ? a.onClick(close) : undefined; if (r !== false) close(a.value ?? a.label); } }));
    box.append(foot);
  }
  back.append(box);
  back.addEventListener('pointerdown', e => { if (e.target === back) close(null); });
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
    if (e.key === 'Tab') {
      const f = [...box.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', key, true);
  document.body.append(back);
  const first = box.querySelector('[autofocus]') || box.querySelector('.modal-foot .primary') || box.querySelector('.modal-body button, .modal-body input');
  setTimeout(() => (first || box.querySelector('button'))?.focus({ preventScroll: true }));
  return { close, box };
}
export function confirmDialog(title, text, o = {}) {
  return new Promise(res => dialog({
    title, cls: 'modal-sm',
    body: () => [h('p.modal-text', null, text)],
    actions: [{ label: o.cancel || 'إلغاء', value: false }, { label: o.ok || 'تأكيد', danger: o.danger, primary: !o.danger, value: true }],
    onClose: v => res(v === true),
  }));
}
export function promptDialog(title, value, o = {}) {
  return new Promise(res => {
    let input;
    dialog({
      title, cls: 'modal-sm',
      body: () => [h('label.field-label', { for: 'dlg-input' }, o.label || 'الاسم'), input = h('input.text', { id: 'dlg-input', value, maxlength: o.max || 60, autofocus: true, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.closest('.modal').querySelector('.modal-foot .primary').click(); } } })],
      actions: [{ label: 'إلغاء', value: null }, { label: o.ok || 'حفظ', primary: true, onClick: () => { if (!input.value.trim()) { input.focus(); return false; } }, value: '__ok' }],
      onClose: v => res(v === '__ok' ? input.value.trim() : null),
    });
    setTimeout(() => input.select());
  });
}

/* ------------------------------------------------------------------ files */
export function downloadBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function pickFile(accept) {
  return new Promise(res => {
    const i = h('input', { type: 'file', accept, style: { display: 'none' } });
    i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); });
    document.body.append(i); i.click();
  });
}
export const safeName = s => (s || 'cylio').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 50) || 'cylio';

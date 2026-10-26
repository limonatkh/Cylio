/* =====================================================================
 * Timeline (Animation section). Time always runs left → right, also in
 * the Arabic interface; the track area is LTR, the controls stay RTL.
 *
 *  header : clip picker, transport, loop, preview speed, time, auto-key,
 *           key actions (add / delete / copy / paste), easing, collapse
 *  banner : pending (unrecorded) change → add a key / discard
 *  tracks : ruler + a summary row + one row per joint; keys are diamonds
 *           that can be selected (Shift/Ctrl = add) and dragged; click or
 *           drag on empty space scrubs; double-click adds a key there.
 * ===================================================================== */
import { h, iconBtn, btn, menu, toast, num } from './dom.js';
import { icon } from './icons.js';
import { JOINT_IDS, JOINT_INFO } from '../core/rig.js';
import { EASES, EASE_IDS, keyCount } from '../core/anim.js';
import { round, clamp } from '../core/math.js';
import { keyId } from '../app/studio.js';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
const H_KEY = 'cylio.timelineHeight', C_KEY = 'cylio.timelineCollapsed';
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };

export function mountTimeline(el, s, io) {
  el.classList.add('timeline');
  el.setAttribute('aria-label', 'الخط الزمني');
  const grip = h('div.tl-grip', { role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': 'تغيير ارتفاع الخط الزمني', tabindex: 0 });
  const header = h('div.tl-head');
  const banner = h('div.tl-banner', { hidden: true, role: 'status' });
  const area = h('div.tl-area', { dir: 'ltr' });
  const empty = h('div.tl-empty', { hidden: true });
  el.append(grip, header, banner, area, empty);

  /* -------------------------------------------------------------- header */
  const clipBtn = h('button.tl-clip', { type: 'button', 'aria-haspopup': 'menu', 'data-tip': 'الحركات المحفوظة' }, h('span.tl-clip-name'), h('span.dirty-dot', { title: 'تعديلات غير محفوظة' }), icon('chevronDown', 14));
  const play = iconBtn({ icon: 'play', label: 'تشغيل', kbd: 'Space', cls: 'tl-play', onClick: () => s.togglePlay() });
  const toStart = iconBtn({ icon: 'toStart', label: 'إلى البداية', size: 18, onClick: () => { s.ui.anim.playing = false; s.setTime(0); } });
  const prev = iconBtn({ icon: 'stepBack', label: 'الإطار السابق', kbd: '←', size: 18, onClick: () => s.stepFrame(-1) });
  const next = iconBtn({ icon: 'stepFwd', label: 'الإطار التالي', kbd: '→', size: 18, onClick: () => s.stepFrame(1) });
  const loop = iconBtn({ icon: 'loop', label: 'تكرار المعاينة', cls: 'tg', size: 18, onClick: () => { s.ui.anim.loopPreview = !s.ui.anim.loopPreview; s.emit('anim'); } });
  const speedBtn = h('button.tl-speed', { type: 'button', 'data-tip': 'سرعة المعاينة', 'aria-haspopup': 'menu', dir: 'ltr' });
  speedBtn.addEventListener('click', () => menu(speedBtn, SPEEDS.map(v => ({ label: `×${v}`, checked: s.ui.anim.speed === v, onClick: () => { s.ui.anim.speed = v; s.emit('anim'); } }))));
  const timeEl = h('span.tl-time', { dir: 'ltr', 'aria-label': 'الوقت الحالي' });
  const auto = h('button.tl-auto', { type: 'button', role: 'switch', 'data-tip': 'عند التشغيل: أي تعديل يُسجَّل إطاراً مباشرة', onclick: () => { s.ui.anim.autoKey = !s.ui.anim.autoKey; s.discardPending(true); s.emit({ anim: true, ui: true }); toast(s.ui.anim.autoKey ? 'التسجيل التلقائي مُفعّل: التعديلات تُسجَّل إطارات' : 'التسجيل التلقائي متوقف', { ms: 1800 }); } }, icon('record', 16), h('span', null, 'تسجيل تلقائي'));
  const addK = iconBtn({ icon: 'keyAdd', label: 'إضافة إطار', kbd: 'K', onClick: () => s.addKey() });
  const delK = iconBtn({ icon: 'keyDel', label: 'حذف الإطارات المحددة', kbd: 'Delete', onClick: () => { const n = s.deleteKeys(); if (n) toast(`حُذف ${n === 1 ? 'إطار' : n + ' إطارات'}`, { action: { label: 'تراجع', run: () => s.undo() } }); } });
  const copyK = iconBtn({ icon: 'copy', label: 'نسخ الإطارات', kbd: 'Ctrl+C', onClick: () => { const n = s.copyKeys(); if (n) toast(`نُسخ ${n} إطار`); update(); } });
  const pasteK = iconBtn({ icon: 'paste', label: 'لصق عند الوقت الحالي', kbd: 'Ctrl+V', onClick: () => s.pasteKeys() });
  const easeBtn = h('button.tl-ease', { type: 'button', 'aria-haspopup': 'menu', 'data-tip': 'نوع الانتقال' }, icon('speed', 16), h('span'), icon('chevronDown', 12));
  easeBtn.addEventListener('click', () => menu(easeBtn, [{ heading: 'الانتقال إلى الإطار التالي' }, ...EASE_IDS.map(e => ({ label: EASES[e].label, checked: s.currentEase() === e, onClick: () => s.setEase(e) }))]));
  const collapse = iconBtn({ icon: 'chevronDown', label: 'طي الخط الزمني', cls: 'tl-collapse', onClick: () => setCollapsed(!el.classList.contains('collapsed')) });
  header.append(
    h('div.tl-group', null, clipBtn),
    h('div.tl-group.transport', null, toStart, prev, play, next, loop, speedBtn, timeEl),
    h('div.tl-group.keys', null, auto, addK, delK, copyK, pasteK, easeBtn),
    h('div.tl-spacer'), collapse);
  clipBtn.addEventListener('click', () => {
    const items = s.project.animations.map(c => ({ label: c.name, checked: c.id === s.ui.anim.clipId, hint: `${round(c.duration, 2)} ث${c.loop ? ' · متكررة' : ''}`, onClick: () => s.openClip(c.id) }));
    menu(clipBtn, [{ heading: 'الحركات' }, ...items, '-', { label: 'حركة جديدة', icon: 'plus', onClick: () => s.newClip() }, { label: 'استيراد حركة…', icon: 'upload', onClick: () => io.importAnimationFile() }]);
  });

  /* -------------------------------------------------------------- height & collapse */
  const setH = v => { const max = Math.max(160, (el.parentElement?.clientHeight || 600) * 0.62); const hh = clamp(v, 120, max); el.style.setProperty('--tl-h', hh + 'px'); return hh; };
  setH(ls.get(H_KEY, 300));
  function setCollapsed(v) { el.classList.toggle('collapsed', v); collapse.setAttribute('aria-label', v ? 'فتح الخط الزمني' : 'طي الخط الزمني'); collapse.setAttribute('data-tip', v ? 'فتح الخط الزمني' : 'طي الخط الزمني'); collapse.replaceChildren(icon(v ? 'chevronUp' : 'chevronDown', 20)); ls.set(C_KEY, v); s.vp?.resize(); }
  setCollapsed(ls.get(C_KEY, false));
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); (() => { try { grip.setPointerCapture(e.pointerId); } catch { /* synthetic or finished pointer */ } })();
    if (el.classList.contains('collapsed')) setCollapsed(false);
    const y0 = e.clientY, h0 = el.getBoundingClientRect().height;
    const mv = ev => { setH(h0 + (y0 - ev.clientY)); s.vp?.resize(); };
    const up = () => { grip.removeEventListener('pointermove', mv); ls.set(H_KEY, parseFloat(el.style.getPropertyValue('--tl-h'))); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up, { once: true }); grip.addEventListener('pointercancel', up, { once: true });
  });
  grip.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { const cur = el.getBoundingClientRect().height; ls.set(H_KEY, setH(cur + (e.key === 'ArrowUp' ? 20 : -20))); s.vp?.resize(); e.preventDefault(); } });

  /* -------------------------------------------------------------- tracks */
  const labels = h('div.tl-labels');
  const lanesWrap = h('div.tl-lanes');
  const ruler = h('div.tl-ruler');
  const rowsEl = h('div.tl-rows');
  const playhead = h('div.tl-playhead', null, h('span.tl-ph-knob'));
  lanesWrap.append(ruler, rowsEl, playhead);
  const scroller = h('div.tl-scroll', null, labels, lanesWrap);
  area.append(scroller);
  const ROWS = ['*', ...JOINT_IDS];
  let lanes = {}, labelEls = {}, builtFor = null;

  function buildRows() {
    labels.replaceChildren(h('div.tl-label.ruler-pad'));
    rowsEl.replaceChildren(); lanes = {}; labelEls = {};
    for (const id of ROWS) {
      const name = id === '*' ? 'كل المفاصل' : id === 'root' ? 'الجذر' : JOINT_INFO[id].label;
      const lb = h('button.tl-label', { type: 'button', dir: 'rtl', 'data-j': id, 'data-tip': id === '*' ? 'كل الإطارات' : `${name} — ${id === 'root' ? 'الشخصية كاملة' : 'يدور حول ' + JOINT_INFO[id].hint}`, onclick: () => { if (id !== '*') s.select(id); else s.select(null); } },
        id === '*' ? icon('key', 14) : icon('part:' + id, 18), h('span', null, name));
      labels.append(lb); labelEls[id] = lb;
      const lane = h('div.tl-lane', { 'data-j': id, class: id === '*' ? 'summary' : '' });
      rowsEl.append(lane); lanes[id] = lane;
    }
  }
  const W = () => lanesWrap.clientWidth || 1;
  const xOf = t => (s.clip ? t / s.clip.duration : 0) * 100 + '%';
  const tOf = clientX => { const r = lanesWrap.getBoundingClientRect(); return clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * (s.clip ? s.clip.duration : 1); };

  function drawRuler() {
    const c = s.clip; if (!c) return;
    ruler.replaceChildren();
    const w = W(), d = c.duration;
    const steps = [0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5];
    const minor = steps.find(st => (st / d) * w >= 9) || 5, major = steps.find(st => st >= minor * 4 && (st / d) * w >= 54) || 5;
    for (let t = 0; t <= d + 1e-6; t = round(t + minor, 4)) {
      const isMaj = Math.abs(t / major - Math.round(t / major)) < 1e-4;
      const tick = h('span.tick', { class: isMaj ? 'major' : '', style: { left: xOf(t) } });
      if (isMaj) tick.append(h('span.tick-label', null, round(t, 2) + (t === 0 ? ' s' : '')));
      ruler.append(tick);
    }
    ruler.append(h('span.tick.end', { style: { left: '100%' } }));
  }

  function drawKeys() {
    const c = s.clip; if (!c) return;
    const sel = s.ui.anim.sel;
    for (const id of ROWS) lanes[id].replaceChildren();
    const all = new Map();
    for (const jid of JOINT_IDS) {
      const tr = c.tracks[jid] || [];
      for (let i = 0; i < tr.length; i++) {
        const k = tr[i], kid = keyId(jid, k.t);
        const d = h('button.key', { type: 'button', tabindex: -1, 'data-k': kid, class: `${sel.has(kid) ? 'sel' : ''} ease-${k.ease}`, style: { left: xOf(k.t) }, 'aria-label': `إطار ${JOINT_INFO[jid].label} عند ${round(k.t, 2)} ث` });
        lanes[jid].append(d);
        if (i < tr.length - 1 && k.ease !== 'linear') {/* segment shading only for non-linear */}
        if (i < tr.length - 1) lanes[jid].append(h('span.seg-line', { class: 'ease-' + k.ease, style: { left: xOf(k.t), width: `calc(${xOf(tr[i + 1].t)} - ${xOf(k.t)})` } }));
        const at = all.get(round(k.t, 4)) || []; at.push(kid); all.set(round(k.t, 4), at);
      }
    }
    for (const [t, ids] of all) {
      const allSel = ids.every(i => sel.has(i));
      lanes['*'].append(h('button.key.sum', { type: 'button', tabindex: -1, 'data-sum': ids.join(','), class: allSel ? 'sel' : ids.some(i => sel.has(i)) ? 'part' : '', style: { left: xOf(t) }, 'aria-label': `${ids.length} إطار عند ${t} ث` }));
    }
    if (!c.loop) lanesWrap.classList.remove('looping'); else lanesWrap.classList.add('looping');
  }

  /* pointer: keys select / drag, empty space scrubs */
  let drag = null;
  lanesWrap.addEventListener('pointerdown', e => {
    if (!s.clip || e.button > 0) return;
    const k = e.target.closest('.key');
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    (() => { try { lanesWrap.setPointerCapture(e.pointerId); } catch { /* synthetic or finished pointer */ } })();
    if (k) {
      const ids = k.dataset.sum ? k.dataset.sum.split(',') : [k.dataset.k];
      const already = ids.every(i => s.ui.anim.sel.has(i));
      if (!already || add) s.setKeySel(ids, add);
      if (!k.dataset.sum) { const j = k.dataset.k.split('|')[0]; if (s.ui.selected !== j) s.select(j); }
      drag = { kind: 'key', x0: e.clientX, started: false, t0: tOf(e.clientX) };
    } else {
      if (!add) s.setKeySel([], false);
      s.ui.anim.playing = false;
      s.setTime(tOf(e.clientX));
      drag = { kind: 'scrub' };
    }
  });
  lanesWrap.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.kind === 'scrub') s.setTime(tOf(e.clientX));
    else {
      if (!drag.started && Math.abs(e.clientX - drag.x0) > 4) drag.started = s.beginKeyDrag();
      if (drag.started) { const st = s.dragKeys(tOf(e.clientX) - drag.t0); showDragTip(e.clientX, st); }
    }
  });
  const endDrag = () => { if (drag && drag.kind === 'key' && drag.started) s.endKeyDrag(); drag = null; dragTip.hidden = true; };
  lanesWrap.addEventListener('pointerup', endDrag);
  lanesWrap.addEventListener('pointercancel', endDrag);
  lanesWrap.addEventListener('dblclick', e => {
    if (!s.clip || e.target.closest('.key')) return;
    const lane = e.target.closest('.tl-lane'); if (!lane || lane.dataset.j === '*') return;
    s.setTime(tOf(e.clientX));
    s.select(lane.dataset.j);
    s.addKey();
  });
  const dragTip = h('div.tl-dragtip', { hidden: true, dir: 'ltr' });
  area.append(dragTip);
  function showDragTip(x, st) {
    const r = area.getBoundingClientRect();
    dragTip.hidden = false; dragTip.textContent = (st >= 0 ? '+' : '') + round(st, 3) + ' s';
    dragTip.style.left = (x - r.left) + 'px';
  }

  /* -------------------------------------------------------------- update */
  function update(f = {}) {
    const c = s.clip, a = s.ui.anim;
    el.hidden = s.ui.section !== 'anim' || s.ui.testing;
    if (el.hidden) return;
    empty.hidden = !!c; area.hidden = !c; header.classList.toggle('no-clip', !c);
    if (!c) {
      empty.replaceChildren(icon('film', 24), h('span', null, 'لا توجد حركة مفتوحة.'), btn('حركة جديدة', { icon: 'plus', cls: 'small primary', onClick: () => s.newClip() }));
      clipBtn.querySelector('.tl-clip-name').textContent = 'بدون حركة';
      banner.hidden = true;
      return;
    }
    if (builtFor !== s.project.meta.id || !lanes.root) { buildRows(); builtFor = s.project.meta.id; }
    clipBtn.querySelector('.tl-clip-name').textContent = c.name;
    clipBtn.classList.toggle('dirty', s.clipDirty(c));
    play.replaceChildren(icon(a.playing ? 'pause' : 'play', 20));
    play.setAttribute('aria-label', a.playing ? 'إيقاف مؤقت' : 'تشغيل'); play.setAttribute('data-tip', a.playing ? 'إيقاف مؤقت' : 'تشغيل');
    loop.setAttribute('aria-pressed', String(a.loopPreview || c.loop));
    loop.setAttribute('data-tip', c.loop ? 'الحركة متكررة (من إعدادات الحركة)' : 'تكرار المعاينة');
    loop.disabled = c.loop;
    speedBtn.textContent = `×${a.speed}`;
    timeEl.replaceChildren(h('b', null, round(a.time, 2).toFixed(2)), ` / ${round(c.duration, 2).toFixed(2)} s`);
    auto.setAttribute('aria-checked', String(a.autoKey));
    auto.classList.toggle('on', a.autoKey);
    el.classList.toggle('autokey', a.autoKey);
    const nSel = s.selectedKeys().length;
    delK.disabled = !nSel; copyK.disabled = !nSel; pasteK.disabled = !a.clipboard;
    const ce = s.currentEase();
    easeBtn.querySelector('span').textContent = ce === 'mixed' ? 'مختلط' : ce ? EASES[ce].label : 'الانتقال';
    easeBtn.disabled = !ce;
    playhead.style.left = xOf(a.time);
    // labels
    const sel = s.ui.selected;
    for (const [id, lb] of Object.entries(labelEls)) {
      lb.classList.toggle('on', id === sel);
      lb.classList.toggle('pending', !!a.pending[id]);
      lanes[id].classList.toggle('on', id === sel);
    }
    // pending banner
    const pend = Object.keys(a.pending);
    banner.hidden = !pend.length;
    if (pend.length) {
      banner.replaceChildren(icon('alert', 16), h('span', null, 'تعديل غير مسجّل على ', h('strong', null, pend.map(j => j === 'root' ? 'الجذر' : JOINT_INFO[j].label).join('، ')), ' عند ', num(round(a.time, 2), 'ث')),
        btn('إضافة إطار', { icon: 'keyAdd', cls: 'small primary', kbd: 'K', onClick: () => s.commitPending() }),
        btn('تجاهل', { cls: 'small ghost', onClick: () => s.discardPending() }));
    }
    if (!f.tick && !f.time) { drawRuler(); drawKeys(); }
    el.dataset.keys = keyCount(c);
  }
  s.subscribe(f => {
    if (f.discarded) toast('أُلغي التعديل غير المسجّل');
    if (f.all || f.section || f.anim || f.clip || f.time || f.tick || f.play || f.select || f.pending || f.keysel || f.testing || f.ui || f.save) update(f);
  });
  new ResizeObserver(() => { if (!el.hidden && s.clip) drawRuler(); }).observe(lanesWrap);
  update();
  return { update };
}

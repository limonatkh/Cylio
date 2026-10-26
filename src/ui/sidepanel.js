/* =====================================================================
 * Right panel: the three sections (Character / Appearance / Animation).
 * Character — Shape | Pose switch, body-part list (synced with the scene),
 *             symmetric editing, pose presets.
 * Appearance — part list with colours, "all parts", face shortcut.
 * Animation — the clip library (preview, open, manage), test-mode clips.
 * ===================================================================== */
import { h, iconBtn, btn, menu, promptDialog, toast, num } from './dom.js';
import { icon } from './icons.js';
import { segmented, toggle, group, selectField } from './fields.js';
import { PART_IDS, PART_INFO } from '../core/character.js';
import { JOINT_INFO, POSE_PRESETS } from '../core/rig.js';
import { LOCOMOTION_ROLES, ROLE_LABELS } from '../core/builtins.js';
import { clipSpeed, keyCount, LIMITS } from '../core/anim.js';
import { round } from '../core/math.js';

export const SECTIONS = [
  { id: 'character', label: 'الشخصية', icon: 'body' },
  { id: 'look', label: 'المظهر', icon: 'palette' },
  { id: 'anim', label: 'التحريك', icon: 'film' },
];

export function mountSidePanel(el, s, io) {
  const tabs = h('div.sec-tabs', { role: 'tablist', 'aria-label': 'أقسام المحرّر' });
  const tabBtns = SECTIONS.map(sec => {
    const b = h('button.sec-tab', { type: 'button', role: 'tab', id: 'tab-' + sec.id, 'aria-controls': 'side-body', onclick: () => s.setSection(sec.id) }, icon(sec.icon, 18), h('span', null, sec.label));
    tabs.append(b); return b;
  });
  tabs.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = SECTIONS.findIndex(x => x.id === s.ui.section), d = e.key === 'ArrowLeft' ? 1 : -1;
    const n = SECTIONS[(i + d + 3) % 3]; s.setSection(n.id); tabBtns[SECTIONS.indexOf(n)].focus(); e.preventDefault();
  });
  const body = h('div.side-body', { id: 'side-body', role: 'tabpanel' });
  el.append(tabs, body);

  let key = '', fields = [], rows = {};
  function ctxKey() { return [s.ui.section, s.ui.edit, s.project.meta.id, s.ui.section === 'anim' ? s.project.animations.map(c => c.id + c.name + (c.role || '')).join() : ''].join('|'); }

  function partList(o) {
    const list = h('div.part-list', { role: 'listbox', 'aria-label': 'أجزاء الجسم' });
    rows = {};
    const ids = o.ids;
    for (const id of ids) {
      const label = id === 'root' ? 'الشخصية كاملة' : id === '*' ? 'كل الأجزاء' : PART_INFO[id].label;
      const r = h('button.part-row', { type: 'button', role: 'option', 'data-part': id, onclick: () => s.select(id === '*' ? null : id) },
        icon('part:' + (id === '*' ? 'root' : id), 22), h('span.part-label', null, label), h('span.part-info'));
      list.append(r); rows[id] = r;
    }
    list.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const keys = Object.keys(rows), cur = keys.indexOf(document.activeElement?.dataset.part);
      const n = keys[(cur + (e.key === 'ArrowDown' ? 1 : -1) + keys.length) % keys.length];
      rows[n].focus(); rows[n].click(); e.preventDefault();
    });
    return list;
  }

  function build() {
    key = ctxKey(); fields = [];
    body.replaceChildren();
    tabBtns.forEach((b, i) => { const on = SECTIONS[i].id === s.ui.section; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    const sec = s.ui.section;
    if (sec === 'character') buildCharacter();
    else if (sec === 'look') buildLook();
    else buildAnim();
    update();
  }

  function buildCharacter() {
    const modeSeg = segmented({
      label: 'نوع التعديل', bare: true,
      options: [{ v: 'shape', label: 'الشكل', icon: 'shape', tip: 'تعديل أبعاد الأجزاء' }, { v: 'pose', label: 'الوضعية', icon: 'pose', tip: 'تعديل وضعية العرض' }],
      get: () => s.ui.edit, set: v => s.setEdit(v),
    });
    fields.push(modeSeg);
    body.append(h('div.side-block', null, modeSeg, h('p.side-hint', null, s.ui.edit === 'shape' ? 'تغيير الأبعاد لا يؤثر على الحركات.' : 'وضعية العرض فقط — الحركات تُعدّل من قسم «التحريك».')));
    body.append(h('div.side-label', null, 'أجزاء الجسم'), partList({ ids: s.ui.edit === 'pose' ? ['root', ...PART_IDS] : PART_IDS }));
    const opts = [toggle({ label: 'تعديل الجهتين معاً', icon: 'mirror', hint: 'الذراعان والرجلان بشكل متناظر', get: () => s.ui.symmetric, set: v => { s.ui.symmetric = v; s.emit('ui'); } })];
    fields.push(...opts);
    body.append(h('div.side-block.opts', null, opts));
    if (s.ui.edit === 'pose') {
      const g = h('div.preset-grid', null, Object.entries(POSE_PRESETS).map(([id, p]) => btn(p.label, { cls: 'small', onClick: () => s.applyPreset(id) })));
      body.append(group('وضعيات جاهزة', [g], { open: true, icon: 'pose' }));
    }
  }

  function buildLook() {
    body.append(h('div.side-label', null, 'الأجزاء'), partList({ ids: ['*', ...PART_IDS] }));
    const face = btn('الوجه', { icon: 'face', cls: 'small wide', onClick: () => { s.ui.focusFace = true; s.select('head'); s.emit('ui'); } });
    const sym = toggle({ label: 'تعديل الجهتين معاً', icon: 'mirror', get: () => s.ui.symmetric, set: v => { s.ui.symmetric = v; s.emit('ui'); } });
    fields.push(sym);
    body.append(h('div.side-block', null, face), h('div.side-block.opts', null, sym));
  }

  function buildAnim() {
    const head = h('div.lib-head', null, h('div.side-label', null, 'مكتبة الحركات', h('small', null, num(`${s.project.animations.length}/${LIMITS.clips}`))),
      h('div.lib-actions', null,
        iconBtn({ icon: 'plus', label: 'حركة جديدة', onClick: () => { if (!s.newClip()) toast(`الحد الأقصى ${LIMITS.clips} حركة.`); } }),
        iconBtn({ icon: 'upload', label: 'استيراد حركة (JSON)', onClick: () => io.importAnimationFile() })));
    body.append(head);
    if (!s.project.animations.length) {
      body.append(h('div.empty.small', null, icon('film', 26), h('p', null, 'لا توجد حركات في هذا المشروع.'), btn('إنشاء حركة', { icon: 'plus', cls: 'small primary', onClick: () => s.newClip() })));
    } else {
      const list = h('div.clip-list', { role: 'listbox', 'aria-label': 'الحركات' });
      rows = {};
      for (const c of s.project.animations) {
        const play = iconBtn({ icon: 'play', label: 'معاينة', cls: 'clip-play', size: 16, onClick: e => { e.stopPropagation(); if (s.ui.anim.clipId === c.id && s.ui.anim.playing) s.togglePlay(); else s.previewClip(c.id); } });
        const more = iconBtn({ icon: 'more', label: 'خيارات الحركة', cls: 'clip-more', size: 16, onClick: e => { e.stopPropagation(); clipMenu(more, c); } });
        const r = h('div.clip-row', { role: 'option', tabindex: 0, 'data-clip': c.id, onclick: () => s.openClip(c.id), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.openClip(c.id); } } },
          play,
          h('div.clip-meta', null, h('span.clip-name', null, c.name, h('span.dirty-dot', { title: 'تعديلات غير محفوظة' })), h('small', null, c.role ? h('span.role', null, ROLE_LABELS[c.role] || 'تلويح') : null, num(round(c.duration, 2), 'ث'), c.loop ? icon('loop', 12) : null)),
          more);
        list.append(r); rows[c.id] = r;
      }
      body.append(list);
    }
    // test-mode clips
    const opts = [{ v: '', label: '— بدون —' }, ...s.project.animations.map(c => ({ v: c.id, label: c.name }))];
    const sel = LOCOMOTION_ROLES.map(r => selectField({ label: ROLE_LABELS[r], options: opts, get: () => s.project.locomotion[r] || '', set: v => s.setLocomotion(r, v) }));
    fields.push(...sel);
    const leg = s.layout.legLength;
    const walk = s.project.animations.find(c => c.id === s.project.locomotion.walk), run = s.project.animations.find(c => c.id === s.project.locomotion.run);
    const speeds = h('p.side-hint', null, 'سرعة بلا انزلاق للقدمين: المشي ', num(walk ? round(clipSpeed(walk, leg), 2) : '—', 'م/ث'), '، الركض ', num(run ? round(clipSpeed(run, leg), 2) : '—', 'م/ث'));
    body.append(group('حركات وضع التجربة', [h('p.side-hint', null, 'الحركات التي تستخدمها الشخصية في الساحة.'), ...sel, speeds], { icon: 'test' }));
  }

  function clipMenu(anchor, c) {
    menu(anchor, [
      { label: 'فتح في الخط الزمني', icon: 'film', onClick: () => s.openClip(c.id) },
      { label: 'إعادة تسمية…', icon: 'edit', onClick: async () => { const n = await promptDialog('اسم الحركة', c.name, { max: LIMITS.name }); if (n) s.renameClip(c.id, n); } },
      { label: 'نسخ الحركة', icon: 'duplicate', onClick: () => { if (!s.duplicateClip(c.id)) toast(`الحد الأقصى ${LIMITS.clips} حركة.`); } },
      { label: 'تصدير JSON', icon: 'download', onClick: () => io.exportAnimation(c.id) },
      c.role ? { label: 'استعادة الحركة الأصلية', icon: 'reset', onClick: () => { s.restoreBuiltin(c.id); toast('استُعيدت الحركة الأصلية', { action: { label: 'تراجع', run: () => s.undo() } }); } } : null,
      '-',
      { label: 'حذف الحركة', icon: 'trash', danger: true, onClick: () => { const n = s.deleteClip(c.id); if (n) toast(`حُذفت «${n}»`, { action: { label: 'تراجع', run: () => s.undo() } }); } },
    ].filter(Boolean));
  }

  function update() {
    for (const f of fields) f.update?.();
    const sel = s.ui.selected;
    if (s.ui.section === 'anim') {
      for (const [id, r] of Object.entries(rows)) {
        const c = s.project.animations.find(x => x.id === id); if (!c) continue;
        const open = s.ui.anim.clipId === id, playing = open && s.ui.anim.playing;
        r.setAttribute('aria-selected', String(open));
        r.classList.toggle('playing', playing);
        r.classList.toggle('dirty', s.clipDirty(c));
        const pb = r.querySelector('.clip-play');
        pb.replaceChildren(icon(playing ? 'pause' : 'play', 16));
        pb.setAttribute('aria-label', playing ? 'إيقاف المعاينة' : 'معاينة'); pb.setAttribute('data-tip', playing ? 'إيقاف المعاينة' : 'معاينة');
        r.querySelector('small').title = `${keyCount(c)} إطار مفتاحي`;
      }
      return;
    }
    for (const [id, r] of Object.entries(rows)) {
      const on = id === '*' ? sel === null : sel === id;
      r.setAttribute('aria-selected', String(on));
      r.classList.toggle('hover', s.ui.hovered === id);
      r.classList.toggle('mirror', !!(sel && s.ui.symmetric && PART_INFO[sel]?.mirror === id));
      const info = r.querySelector('.part-info');
      if (s.ui.section === 'look') {
        if (id === '*') { info.replaceChildren(); continue; }
        const a = s.project.appearance.parts[id];
        info.replaceChildren(h('span.color-dot', { style: { background: a.color } }));
      } else if (s.ui.edit === 'shape') {
        const p = s.project.shape.parts[id];
        info.replaceChildren(num(`${round(p.w * 100, 0)}×${round(p.h * 100, 0)}`, 'سم'));
      } else {
        const j = s.project.pose[id], moved = j.rot.some(v => Math.abs(v) > 0.05) || (j.pos && j.pos.some(v => Math.abs(v) > 1e-4));
        info.replaceChildren(moved ? h('span.changed', { title: 'مختلف عن الوضعية الأساسية' }) : '');
      }
    }
  }

  s.subscribe(f => {
    if (f.all || f.section || f.clip || ctxKey() !== key) build();
    else if (f.ui || f.select || f.hover || f.shape || f.look || f.pose || f.anim || f.save || f.play) update();
  });
  build();
  return { build };
}
export { JOINT_INFO };

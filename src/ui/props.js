/* =====================================================================
 * Left panel: properties of the current part for the current tool.
 * Only what applies is shown: dimensions in Shape, rotations in Pose,
 * colour and material in Appearance, key values and clip settings in
 * Animation.
 * ===================================================================== */
import { h, btn, iconBtn, num, toast } from './dom.js';
import { icon } from './icons.js';
import { numField, toggle, segmented, selectField, colorField, group, readout } from './fields.js';
import { PART_INFO, SHAPE_LIMITS, LAYOUT_LIMITS, DEFAULT_SHAPE } from '../core/character.js';
import { JOINT_INFO, ROT_LIMITS, POS_LIMITS } from '../core/rig.js';
import { MATERIALS, MATERIAL_IDS, MOUTHS, FACE_LIMITS, defaultAppearance } from '../core/appearance.js';
import { EASES, EASE_IDS, LIMITS, findKey, snapTime, clipSpeed, gaitOf } from '../core/anim.js';
import { round } from '../core/math.js';

const AXES = [
  { i: 0, label: 'أمام / خلف', ax: 'X' },
  { i: 1, label: 'التفاف', ax: 'Y' },
  { i: 2, label: 'جانبي', ax: 'Z' },
];
const DIMS = [
  { k: 'w', label: 'العرض' }, { k: 'd', label: 'العمق' }, { k: 'h', label: 'الارتفاع' },
];
const LAYOUT_FIELDS = [
  { k: 'neckGap', label: 'الرقبة', hint: 'بين الجذع والرأس' },
  { k: 'shoulderGap', label: 'الكتفان', hint: 'بين الجذع والذراع' },
  { k: 'shoulderDrop', label: 'انخفاض الكتف', hint: 'من أعلى الجذع' },
  { k: 'hipGap', label: 'الورك', hint: 'بين الرجلين والجذع' },
  { k: 'legSpread', label: 'المسافة بين الرجلين' },
];
const FACE_FIELDS = [
  { k: 'eyeSize', label: 'حجم العين', pct: true }, { k: 'eyeSpacing', label: 'المسافة بين العينين', pct: true }, { k: 'eyeHeight', label: 'ارتفاع العينين', pct: true }, { k: 'glow', label: 'توهّج العينين', pct: true },
];
const MOUTH_FIELDS = [
  { k: 'mouthWidth', label: 'عرض الفم', pct: true }, { k: 'mouthHeight', label: 'ارتفاع الفم', pct: true }, { k: 'mouthCurve', label: 'انحناء الفم', pct: true }, { k: 'mouthThickness', label: 'سماكة الخط', mm: true },
];

export function mountProps(el, s) {
  const head = h('div.props-head');
  const body = h('div.props-body');
  el.append(head, body);
  let key = '', fields = [];
  const F = f => { fields.push(f); return f; };
  const ctxKey = () => [s.ui.section, s.ui.edit, s.ui.selected, s.ui.anim.clipId, s.project.meta.id, s.ui.symmetric, s.ui.section === 'look' && s.ui.selected ? s.project.appearance.parts[s.ui.selected].material : '', s.ui.section === 'look' ? s.project.appearance.face.visible + s.project.appearance.face.mouth : ''].join('|');

  function header(title, sub, ic) {
    head.replaceChildren(h('div.ph-icon', null, icon(ic, 26)), h('div.ph-text', null, h('h2', null, title), sub ? h('small', null, sub) : null));
  }
  const mirrorNote = id => (s.ui.symmetric && PART_INFO[id]?.mirror ? `مع ${PART_INFO[PART_INFO[id].mirror].label}` : null);

  function build() {
    key = ctxKey(); fields = [];
    body.replaceChildren();
    const sec = s.ui.section, sel = s.ui.selected;
    if (sec === 'character' && s.ui.edit === 'shape') shapeProps(sel);
    else if (sec === 'character') poseProps(sel);
    else if (sec === 'look') lookProps(sel);
    else animProps(sel);
    update();
    if (s.ui.focusFace) { s.ui.focusFace = false; body.querySelector('.group.face')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }

  /* ---------------------------------------------------------------- shape */
  function shapeProps(id) {
    if (!id) {
      header('الشخصية كاملة', 'الشكل', 'part:root');
      const L = () => s.layout;
      body.append(h('div.readouts', null, readout('الطول الكلي', round(L().height * 100, 1), 'سم'), readout('طول الرجل حتى المفصل', round(L().legLength * 100, 1), 'سم')));
      body.append(h('p.props-hint', null, icon('info', 16), 'اختر جزءاً من المشهد أو من القائمة لتعديل أبعاده.'));
      body.append(layoutGroup(true));
      body.append(h('div.props-actions', null, btn('إعادة شكل الشخصية الأصلي', { icon: 'reset', cls: 'small', onClick: () => s.resetShape(null) })));
      return;
    }
    header(PART_INFO[id].label, mirrorNote(id) || 'الأبعاد', 'part:' + id);
    const lim = SHAPE_LIMITS[id];
    const dim = d => F(numField({ label: d.label, unit: 'سم', scale: 100, decimals: 1, step: 0.5, min: lim[d.k][0], max: lim[d.k][1], def: DEFAULT_SHAPE.parts[id][d.k],
      get: () => s.project.shape.parts[id][d.k], live: v => s.setDim(id, d.k, v), commit: () => s.commit() }));
    const link = iconBtn({ icon: s.ui.linkDims ? 'link' : 'unlink', label: s.ui.linkDims ? 'العرض والعمق مربوطان' : 'العرض والعمق منفصلان', cls: 'link-btn', pressed: s.ui.linkDims,
      onClick: () => { s.ui.linkDims = !s.ui.linkDims; build(); } });
    const depth = dim(DIMS[1]);
    link.classList.add('small-ic'); depth.querySelector('.field-top').insertBefore(link, depth.querySelector('.reset'));
    body.append(dim(DIMS[0]), depth, dim(DIMS[2]));
    body.append(F(numField({ label: 'استدارة الحواف', unit: '%', scale: 100, decimals: 0, step: 1, min: 0, max: 1, def: DEFAULT_SHAPE.parts[id].round,
      get: () => s.project.shape.parts[id].round, live: v => s.setDim(id, 'round', v, { label: 'استدارة الحواف' }), commit: () => s.commit() })));
    if (id === 'torso' || id === 'head' || id.endsWith('Leg') || id.endsWith('Arm')) body.append(layoutGroup(false));
    body.append(h('div.props-actions', null, btn('إعادة أبعاد هذا الجزء', { icon: 'reset', cls: 'small', onClick: () => s.resetShape(id) })));
  }
  function layoutGroup(open) {
    const fs = LAYOUT_FIELDS.map(f => F(numField({ label: f.label, hint: f.hint, unit: 'سم', scale: 100, decimals: 1, step: 0.1, min: LAYOUT_LIMITS[f.k][0], max: LAYOUT_LIMITS[f.k][1], def: DEFAULT_SHAPE.layout[f.k],
      get: () => s.project.shape.layout[f.k], live: v => s.setLayout(f.k, v), commit: () => s.commit() })));
    return group('المسافات بين الأجزاء', fs, { open, id: 'layout', icon: 'sliders' });
  }

  /* ---------------------------------------------------------------- pose / anim joint */
  function rotFields(jid) {
    const L = ROT_LIMITS[jid];
    return AXES.map(a => F(numField({ label: a.label, hint: a.ax, unit: '°', decimals: 1, step: 0.5, min: L[a.i][0], max: L[a.i][1], def: 0,
      get: () => s.jointValue(jid).rot[a.i],
      live: v => { const r = s.jointValue(jid).rot; r[a.i] = v; s.setRot(jid, r, { label: 'تدوير ' + JOINT_INFO[jid].label }); },
      commit: () => s.commit() })));
  }
  function posFields() {
    const names = ['يمين / يسار', 'ارتفاع', 'أمام / خلف'];
    return [0, 1, 2].map(i => F(numField({ label: names[i], hint: 'XYZ'[i], unit: 'سم', scale: 100, decimals: 1, step: 0.5, min: POS_LIMITS[i][0], max: POS_LIMITS[i][1], def: 0,
      get: () => (s.jointValue('root').pos || [0, 0, 0])[i],
      live: v => { const p = (s.jointValue('root').pos || [0, 0, 0]).slice(); p[i] = v; s.setRootPos(p); },
      commit: () => s.commit() })));
  }
  function jointLabel(jid) { return jid === 'root' ? 'الشخصية كاملة' : JOINT_INFO[jid].label; }

  function poseProps(id) {
    if (!id) {
      header('الوضعية', 'وضعية العرض للشخصية', 'pose');
      body.append(h('p.props-hint', null, icon('info', 16), 'اختر جزءاً ثم دوّره من المشهد أو بالأرقام. يدور كل جزء حول مفصله.'));
      body.append(F(toggle({ label: 'مقارنة بالوضعية الأساسية', icon: 'ghost', get: () => s.ui.compare, set: () => s.toggle('compare') })));
      body.append(h('div.props-actions', null, btn('إعادة الوضعية الأساسية', { icon: 'reset', cls: 'small', onClick: () => s.resetPose(null) })));
      return;
    }
    header(jointLabel(id), id === 'root' ? 'الموضع والدوران' : `يدور حول ${JOINT_INFO[id].hint}${mirrorNote(id) ? ' — ' + mirrorNote(id) : ''}`, 'part:' + id);
    if (id === 'root') body.append(group('الموضع', posFields(), { open: true, id: 'rootpos' }));
    body.append(group('الدوران', rotFields(id), { open: true, id: 'rot' }));
    body.append(h('div.props-actions', null, btn('إعادة هذا المفصل', { icon: 'reset', cls: 'small', onClick: () => s.resetPose(id) })));
  }

  /* ---------------------------------------------------------------- appearance */
  function lookProps(id) {
    const all = !id;
    const pid = id || 'torso';
    header(all ? 'كل الأجزاء' : PART_INFO[id].label, all ? 'لون وخامة واحدة للجسم' : (mirrorNote(id) || 'المظهر'), 'part:' + (id || 'root'));
    const target = all ? '*' : id;
    body.append(F(colorField({ label: 'اللون', get: () => s.project.appearance.parts[pid].color, live: c => s.setLook(target, { color: c }, { label: 'تغيير اللون' }), commit: () => s.commit() })));
    const mat = F(segmented({ label: 'الخامة', compact: true, options: MATERIAL_IDS.map(m => ({ v: m, label: MATERIALS[m].label })), get: () => s.project.appearance.parts[pid].material, set: v => { s.setLook(target, { material: v }, { label: 'تغيير الخامة' }); s.commit(); } }));
    body.append(mat);
    const a = () => s.project.appearance.parts[pid];
    const m = MATERIALS[a().material];
    const adv = [
      F(numField({ label: 'الخشونة', unit: '%', scale: 100, decimals: 0, step: 1, min: 0, max: 1, def: m.roughness, get: () => a().roughness ?? MATERIALS[a().material].roughness, live: v => s.setLook(target, { roughness: v }, { label: 'الخشونة' }), commit: () => s.commit() })),
      F(numField({ label: 'المعدنية', unit: '%', scale: 100, decimals: 0, step: 1, min: 0, max: 1, def: m.metalness, get: () => a().metalness ?? MATERIALS[a().material].metalness, live: v => s.setLook(target, { metalness: v }, { label: 'المعدنية' }), commit: () => s.commit() })),
    ];
    if (m.texture) adv.push(F(numField({ label: 'حجم نقش المجرّة', unit: '×', decimals: 2, step: 0.05, min: 0.25, max: 4, def: 1, get: () => a().scale ?? 1, live: v => s.setLook(target, { scale: v }, { label: 'حجم النقش' }), commit: () => s.commit() })));
    body.append(group('خيارات متقدمة', adv, { id: 'matadv', icon: 'sliders' }));
    if (!all) body.append(h('div.props-actions', null, btn('تطبيق على كل الأجزاء', { icon: 'copy', cls: 'small', onClick: () => {
      const src = { ...s.project.appearance.parts[id] };
      s.act('تطبيق المظهر على الكل', p => { for (const k of Object.keys(p.appearance.parts)) p.appearance.parts[k] = { ...src }; }, 'look');
      toast('طُبّق المظهر على كل الأجزاء', { action: { label: 'تراجع', run: () => s.undo() } });
    } })));
    if (id === 'head' || all) body.append(faceGroup(id === 'head'));
  }
  function faceGroup(open) {
    const f = () => s.project.appearance.face, D = defaultAppearance().face;
    const pctField = d => F(numField({ label: d.label, unit: d.mm ? 'مم' : '%', scale: d.mm ? 1000 : 100, decimals: d.mm ? 1 : 0, step: d.mm ? 0.5 : 1, min: FACE_LIMITS[d.k][0], max: FACE_LIMITS[d.k][1], def: D[d.k], get: () => f()[d.k], live: v => s.setFace({ [d.k]: v }), commit: () => s.commit() }));
    const kids = [F(toggle({ label: 'إظهار الوجه', icon: 'face', get: () => f().visible, set: v => { s.act('إظهار الوجه', p => { p.appearance.face.visible = v; }, 'look'); } }))];
    if (f().visible) {
      kids.push(h('div.sub-label', null, 'العينان'),
        F(colorField({ label: 'لون العينين', get: () => f().eyeColor, live: c => s.setFace({ eyeColor: c }), commit: () => s.commit() })),
        ...FACE_FIELDS.map(pctField),
        h('div.sub-label', null, 'الفم'),
        F(segmented({ label: 'شكل الفم', compact: true, options: Object.entries(MOUTHS).map(([v, label]) => ({ v, label })), get: () => f().mouth, set: v => s.act('شكل الفم', p => { p.appearance.face.mouth = v; }, 'look') })));
      if (f().mouth !== 'none') kids.push(F(colorField({ label: 'لون الفم', get: () => f().mouthColor, live: c => s.setFace({ mouthColor: c }), commit: () => s.commit() })), ...MOUTH_FIELDS.map(pctField));
    }
    return group('الوجه', kids, { open, id: 'face', icon: 'face', cls: 'face' });
  }

  /* ---------------------------------------------------------------- animation */
  function animProps(id) {
    const c = s.clip;
    if (!c) {
      header('التحريك', null, 'film');
      body.append(h('div.empty.small', null, icon('film', 26), h('p', null, 'لا توجد حركة مفتوحة.'), btn('إنشاء حركة', { icon: 'plus', cls: 'small primary', onClick: () => s.newClip() })));
      return;
    }
    if (id) {
      header(jointLabel(id), null, 'part:' + id);
      head.querySelector('.ph-text').append(h('small.key-state'));
      if (id === 'root') body.append(group('الموضع', posFields(), { open: true, id: 'arootpos' }));
      body.append(group('الدوران عند الوقت الحالي', rotFields(id), { open: true, id: 'arot' }));
      body.append(h('div.props-actions', null, btn('إعادة المفصل للوضع الأساسي', { icon: 'reset', cls: 'small', onClick: () => s.resetPose(id) })));
    } else {
      header(c.name, 'الحركة', 'film');
      body.append(h('p.props-hint', null, icon('info', 16), 'اختر جزءاً لتعديل دورانه عند الوقت الحالي، ثم أضف إطاراً.'));
    }
    const ease = F(selectField({ label: 'الانتقال إلى الإطار التالي', options: [{ v: '', label: '—' }, ...EASE_IDS.map(e => ({ v: e, label: EASES[e].label }))], get: () => { const e = s.currentEase(); return e && e !== 'mixed' ? e : ''; }, set: v => { if (v) s.setEase(v); } }));
    ease.classList.add('ease-field');
    body.append(ease);
    body.append(clipGroup(c));
  }
  function clipGroup(c) {
    const name = h('input.text', { value: c.name, maxlength: LIMITS.name, 'aria-label': 'اسم الحركة', onchange: e => { if (e.target.value.trim()) s.setClipProp('name', e.target.value); else e.target.value = c.name; } });
    let mode = 'trim';
    const dur = F(numField({ label: 'المدة', unit: 'ث', decimals: 2, step: 0.05, min: LIMITS.duration[0], max: Math.max(5, c.duration), get: () => s.clip.duration, live: v => { s._durV = v; }, commit: () => { if (s._durV) s.setClipDuration(s._durV, mode); s._durV = null; } }));
    const modeSel = F(segmented({ label: 'عند تغيير المدة', compact: true, options: [{ v: 'trim', label: 'قصّ الإطارات' }, { v: 'scale', label: 'تمديد الإطارات' }], get: () => mode, set: v => { mode = v; } }));
    const loop = F(toggle({ label: 'حركة متكررة', icon: 'loop', get: () => s.clip.loop, set: v => s.setClipProp('loop', v) }));
    const fps = F(selectField({ label: 'دقّة الإطارات', options: [12, 24, 30, 60].map(v => ({ v: String(v), label: `${v} إطاراً/ث` })), get: () => String(s.clip.fps), set: v => s.setClipProp('fps', +v) }));
    const leg = s.layout.legLength, g = gaitOf(c, leg);
    const speedAuto = F(toggle({ label: 'سرعة الانتقال تلقائية', hint: 'تُحسب من تأرجح الرجلين', get: () => s.clip.moveSpeed === null, set: v => s.setClipProp('moveSpeed', v ? null : Math.max(0.05, g.speed || 1)) }));
    const speed = F(numField({ label: 'سرعة الانتقال', unit: 'م/ث', decimals: 2, step: 0.05, min: 0.05, max: 10, get: () => clipSpeed(s.clip, leg), live: v => s.live('سرعة الحركة', () => { s.clip.moveSpeed = round(v, 3); }, 'anim'), commit: () => s.commit(), disabled: () => s.clip.moveSpeed === null }));
    return group('إعدادات الحركة', [h('div.field', null, h('label.field-label', null, 'الاسم'), name), dur, modeSel, loop, fps, speedAuto, speed], { id: 'clipset', icon: 'film', open: !s.ui.selected });
  }

  function keyState() {
    const st = head.querySelector('.key-state'); if (!st || !s.clip) return;
    const id = s.ui.selected, c = s.clip, a = s.ui.anim;
    const t = num(round(a.time, 2), 'ث');
    st.className = 'key-state';
    if (a.pending[id]) { st.classList.add('ks-pending'); st.replaceChildren('تعديل غير مسجّل عند ', t); }
    else if (findKey(c, id, a.time) >= 0) { st.classList.add('ks-key'); st.replaceChildren(icon('key', 12), ' إطار مفتاحي عند ', t); }
    else st.replaceChildren((c.tracks[id] ? 'قيمة بين إطارين عند ' : 'بلا إطارات — ') , t);
  }

  function update() {
    for (const f of fields) if (!f.closest('[hidden]')) f.update?.();
    keyState();
  }
  s.subscribe(f => {
    if (f.all || f.section || f.clip || ctxKey() !== key) build();
    else if (f.ui || f.select || f.shape || f.look || f.pose || f.anim || f.time || f.pending || f.keysel) update();
  });
  build();
}
export { snapTime };

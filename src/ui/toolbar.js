/* =====================================================================
 * Scene overlays: mode badge, tool strip, camera / view controls.
 * Tools that do not apply to the current mode stay visible but are
 * marked unavailable with the reason in their tooltip (aria-disabled,
 * so the tooltip still shows on hover and the reason is read out).
 * ===================================================================== */
import { h, iconBtn, menu, num, toast } from './dom.js';
import { icon } from './icons.js';
import { JOINT_INFO } from '../core/rig.js';
import { round } from '../core/math.js';

const TOOLS = [
  { id: 'select', icon: 'select', label: 'تحديد', kbd: 'Q' },
  { id: 'move', icon: 'move', label: 'نقل الشخصية', kbd: 'W' },
  { id: 'rotate', icon: 'rotate', label: 'تدوير حول المفصل', kbd: 'E' },
  { id: 'scale', icon: 'scale', label: 'تغيير الحجم', kbd: 'R' },
];
const WHY = {
  move: 'النقل متاح في «الوضعية» و«التحريك»',
  rotate: 'التدوير متاح في «الوضعية» و«التحريك» بعد تحديد جزء',
  scale: 'تغيير الحجم متاح في «الشكل» بعد تحديد جزء',
};
const MODE_LABEL = { shape: 'تعديل الشكل', pose: 'تعديل الوضعية', look: 'المظهر', anim: 'تعديل إطار' };

export function mountToolbar(stage, s) {
  const vp = () => s.vp;
  const badge = h('div.mode-badge', { role: 'status', 'aria-live': 'polite' });
  const tools = h('div.tool-strip', { role: 'toolbar', 'aria-label': 'أدوات المشهد' });
  const tbtn = {};
  for (const t of TOOLS) {
    const b = iconBtn({ icon: t.icon, label: t.label, kbd: t.kbd, cls: 'tool', onClick: () => {
      if (b.getAttribute('aria-disabled') === 'true') { toast(WHY[t.id]); return; }
      s.setTool(t.id);
    } });
    tools.append(b); tbtn[t.id] = b;
  }
  const viewBtn = iconBtn({ icon: 'cube', label: 'زاوية العرض', cls: 'view-btn', onClick: () => menu(viewBtn, [
    { label: 'أمامي', kbd: '1', onClick: () => vp().view('front') },
    { label: 'جانبي', kbd: '2', onClick: () => vp().view('left') },
    { label: 'خلفي', kbd: '3', onClick: () => vp().view('back') },
    { label: 'جانبي (الجهة الأخرى)', onClick: () => vp().view('right') },
    { label: 'من الأعلى', onClick: () => vp().view('top') },
  ], { align: 'end' }) });
  viewBtn.setAttribute('aria-haspopup', 'menu');
  const views = h('div.view-strip', { role: 'toolbar', 'aria-label': 'العرض والكاميرا' },
    h('div.seg.views', null,
      h('button.seg-btn', { type: 'button', 'data-tip': 'عرض أمامي', 'data-kbd': '1', onclick: () => vp().view('front') }, 'أمام'),
      h('button.seg-btn', { type: 'button', 'data-tip': 'عرض جانبي', 'data-kbd': '2', onclick: () => vp().view('left') }, 'جانب'),
      h('button.seg-btn', { type: 'button', 'data-tip': 'عرض خلفي', 'data-kbd': '3', onclick: () => vp().view('back') }, 'خلف')),
    viewBtn,
    iconBtn({ icon: 'focus', label: 'تركيز على الجزء المحدد', kbd: 'F', onClick: () => vp().focus(s.ui.selected) }),
    iconBtn({ icon: 'home', label: 'إعادة ضبط الكاميرا', kbd: 'H', onClick: () => vp().resetCamera() }),
    h('span.vs-sep'),
  );
  const grid = iconBtn({ icon: 'grid', label: 'إظهار الشبكة', kbd: 'G', cls: 'tg', onClick: () => s.toggle('showGrid') });
  const joints = iconBtn({ icon: 'joints', label: 'إظهار المفاصل', kbd: 'J', cls: 'tg', onClick: () => s.toggle('showJoints') });
  const compare = iconBtn({ icon: 'ghost', label: 'مقارنة بالوضعية الأساسية', kbd: 'B', cls: 'tg', onClick: () => {
    if (compare.getAttribute('aria-disabled') === 'true') { toast('المقارنة متاحة في «الوضعية» و«التحريك»'); return; }
    s.toggle('compare');
  } });
  views.append(grid, joints, compare);
  stage.append(badge, tools, views);

  function update() {
    const mode = s.mode;
    stage.classList.toggle('testing', mode === 'test');
    for (const t of TOOLS) {
      const b = tbtn[t.id], ok = vp() ? vp().toolAllowed(t.id, mode === 'look' ? 'look' : mode, t.id === 'move' ? 'root' : s.ui.selected) : true;
      b.setAttribute('aria-pressed', String(s.tool === t.id && ok));
      b.setAttribute('aria-disabled', String(!ok));
      b.setAttribute('data-tip', ok ? t.label : `${t.label} — ${WHY[t.id]}`);
    }
    grid.setAttribute('aria-pressed', String(s.ui.showGrid));
    joints.setAttribute('aria-pressed', String(s.ui.showJoints));
    const cmpOk = mode === 'pose' || mode === 'anim';
    compare.setAttribute('aria-pressed', String(s.ui.compare && cmpOk));
    compare.setAttribute('aria-disabled', String(!cmpOk));
    // badge
    const sel = s.ui.selected;
    const part = sel ? (sel === 'root' ? 'الشخصية كاملة' : JOINT_INFO[sel].label) : null;
    badge.className = 'mode-badge mode-' + mode;
    if (mode === 'anim' && s.clip) {
      const a = s.ui.anim;
      badge.replaceChildren(...[h('span.mb-dot'), h('strong', null, a.playing ? 'معاينة' : MODE_LABEL.anim), num(round(a.time, 2), 'ث'),
        a.autoKey ? h('span.mb-rec', null, icon('record', 12), 'تسجيل تلقائي') : null, part ? h('span.mb-part', null, part) : null].filter(Boolean));
    } else badge.replaceChildren(...[h('span.mb-dot'), h('strong', null, MODE_LABEL[mode] || ''), part ? h('span.mb-part', null, part) : null].filter(Boolean));
  }
  s.subscribe(f => { if (f.all || f.ui || f.select || f.section || f.time || f.play || f.anim || f.testing) update(); });
  update();
}

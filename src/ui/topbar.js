/* =====================================================================
 * Top bar: project menu + name, save state, undo / redo, test, export, save.
 * ===================================================================== */
import { h, iconBtn, btn, menu, promptDialog, toast } from './dom.js';
import { icon } from './icons.js';
import { APP_VERSION } from '../core/project.js';

const STATUS = {
  new: { text: 'لم يُحفظ بعد', cls: 'muted' },
  saved: { text: 'محفوظ', cls: 'ok' },
  dirty: { text: 'تعديلات غير محفوظة', cls: 'warn' },
  saving: { text: 'جارٍ الحفظ…', cls: 'busy' },
  error: { text: 'تعذّر الحفظ', cls: 'err' },
};

export function mountTopbar(el, s, io) {
  const projBtn = h('button.proj-btn', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-tip': 'قائمة المشروع' });
  const nameEl = h('span.proj-name');
  projBtn.append(h('span.logo', { 'aria-hidden': 'true' }, logoMark()), h('span.proj-text', null, h('span.app-name', null, 'Cylio Studio'), nameEl), icon('chevronDown', 16));
  const status = h('span.save-state', { role: 'status', 'aria-live': 'polite' }, h('span.dot'), h('span.save-text'));
  const undo = iconBtn({ icon: 'undo', label: 'تراجع', kbd: 'Ctrl+Z', onClick: () => doUndo() });
  const redo = iconBtn({ icon: 'redo', label: 'إعادة', kbd: 'Ctrl+Shift+Z', onClick: () => doRedo() });
  const test = btn('تجربة الشخصية', { icon: 'test', cls: 'test-btn', tip: 'تجربة الحركات في ساحة', kbd: 'T', onClick: () => s.ui.testing ? s.exitTest() : s.enterTest() });
  const exportBtn = btn('تصدير', { icon: 'download', cls: 'ghost export-btn', onClick: () => exportMenu(exportBtn) });
  exportBtn.append(icon('chevronDown', 14)); exportBtn.setAttribute('aria-haspopup', 'menu');
  const save = btn('حفظ', { icon: 'save', cls: 'primary save-btn', tip: 'حفظ على هذا الجهاز', kbd: 'Ctrl+S', onClick: () => io.save() });
  const more = iconBtn({ icon: 'more', label: 'المزيد', cls: 'more-btn', onClick: () => moreMenu(more) });

  el.append(
    h('div.tb-start', null, projBtn, status),
    h('div.tb-end', null, h('div.tb-group', null, undo, redo), h('span.tb-sep'), test, exportBtn, save, more),
  );

  const doUndo = () => { const l = s.undo(); if (l) toast('تراجع: ' + l, { ms: 1400 }); };
  const doRedo = () => { const l = s.redo(); if (l) toast('إعادة: ' + l, { ms: 1400 }); };

  function projectItems() {
    return [
      { label: 'مشروع جديد', icon: 'filePlus', onClick: () => io.newProject() },
      { label: 'فتح مشروع…', icon: 'folder', kbd: 'Ctrl+O', onClick: () => io.openDialog() },
      { label: 'فتح ملف من الجهاز…', icon: 'upload', onClick: () => io.importFile() },
      '-',
      { label: 'إعادة تسمية المشروع…', icon: 'edit', onClick: async () => { const n = await promptDialog('اسم المشروع', s.project.meta.name); if (n) s.rename(n); } },
      { label: 'حفظ', icon: 'save', kbd: 'Ctrl+S', onClick: () => io.save() },
      '-',
      { label: 'اختصارات لوحة المفاتيح', icon: 'keyboard', onClick: () => io.shortcutsDialog() },
      { label: 'حول Cylio Studio', icon: 'info', onClick: () => io.aboutDialog(APP_VERSION) },
    ];
  }
  function exportItems() {
    const clip = s.clip;
    return [
      { heading: 'تصدير' },
      { label: 'ملف المشروع', hint: 'JSON — لمتابعة التعديل لاحقاً', icon: 'file', onClick: () => io.exportProject() },
      { label: 'الحركة الحالية', hint: clip ? clip.name : 'لا توجد حركة مفتوحة', icon: 'film', disabled: !clip, onClick: () => io.exportAnimation() },
      { label: 'نموذج GLB', hint: 'الشخصية بمفاصلها وكل الحركات', icon: 'cube', onClick: () => io.exportGLB() },
    ];
  }
  projBtn.addEventListener('click', () => menu(projBtn, projectItems()));
  function exportMenu(a) { menu(a, exportItems(), { align: 'end' }); }
  function moreMenu(a) {
    menu(a, [
      { label: s.ui.testing ? 'العودة إلى التحرير' : 'تجربة الشخصية', icon: s.ui.testing ? 'exit' : 'test', onClick: () => s.ui.testing ? s.exitTest() : s.enterTest() },
      '-', ...exportItems(),
    ], { align: 'end' });
  }

  function update() {
    nameEl.textContent = s.project.meta.name;
    projBtn.setAttribute('aria-label', `قائمة المشروع: ${s.project.meta.name}`);
    const st = STATUS[s.ui.save.status] || STATUS.new;
    status.className = 'save-state ' + st.cls;
    status.querySelector('.save-text').textContent = s.ui.save.status === 'error' && s.ui.save.error ? st.text + ' — ' + s.ui.save.error : st.text;
    status.setAttribute('data-tip', s.ui.save.status === 'saved' && s.ui.save.at ? 'آخر حفظ ' + new Date(s.ui.save.at).toLocaleTimeString('ar', { timeStyle: 'short', numberingSystem: 'latn' }) : st.text);
    undo.disabled = !s.history.canUndo; redo.disabled = !s.history.canRedo;
    undo.setAttribute('data-tip', s.history.canUndo ? 'تراجع: ' + s.history.undoLabel : 'لا يوجد ما يُتراجع عنه');
    redo.setAttribute('data-tip', s.history.canRedo ? 'إعادة: ' + s.history.redoLabel : 'لا يوجد ما يُعاد');
    test.classList.toggle('active', s.ui.testing);
    test.querySelector('span').textContent = s.ui.testing ? 'العودة إلى التحرير' : 'تجربة الشخصية';
    test.replaceChild(icon(s.ui.testing ? 'exit' : 'test', 18), test.querySelector('svg'));
    save.disabled = s.ui.save.status === 'saving';
    save.classList.toggle('attn', s.dirty);
  }
  s.subscribe(f => { if (f.all || f.ui || f.save || f.history || f.testing || f.anim) update(); });
  update();
  return { update, undo: doUndo, redo: doRedo };
}

export function logoMark(size = 22) {
  // three stacked rounded cylinders (head, body, legs) — the Cylio mark
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.innerHTML = '<rect x="8" y="1.5" width="8" height="6.4" rx="2.4" fill="#ff7a1a"/><rect x="5.5" y="9" width="13" height="7.6" rx="1.8" fill="currentColor" opacity=".92"/><rect x="5.5" y="17.6" width="6" height="5" rx="1.8" fill="currentColor" opacity=".6"/><rect x="12.5" y="17.6" width="6" height="5" rx="1.8" fill="currentColor" opacity=".6"/>';
  return s;
}

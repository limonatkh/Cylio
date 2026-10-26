/* =====================================================================
 * Project commands: new / open / import / export / save, with the
 * unsaved-changes guard. Shared by the top bar, menus and shortcuts.
 * ===================================================================== */
import { h, btn, dialog, toast, downloadBlob, pickFile, safeName, iconBtn, num } from './dom.js';
import { icon } from './icons.js';
import { storage } from '../storage/projects.js';
import { Studio } from '../app/studio.js';
import { createProject } from '../core/project.js';

const fmtDate = iso => { try { return new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' }); } catch { return iso || ''; } };

export class ProjectIO {
  constructor(studio) { this.s = studio; }

  async save() {
    const ok = await this.s.save();
    if (ok) toast('تم الحفظ على هذا الجهاز', { kind: 'ok', ms: 1600 });
    else toast(this.s.ui.save.error || 'تعذّر الحفظ', { kind: 'error', action: { label: 'تنزيل نسخة', run: () => this.exportProject() } });
    return ok;
  }

  /** Ask before losing unsaved changes. Resolves true when it is fine to continue. */
  guard(what) {
    if (!this.s.dirty) return Promise.resolve(true);
    return new Promise(res => dialog({
      title: 'تعديلات غير محفوظة', cls: 'modal-sm',
      body: () => [h('p.modal-text', null, `في المشروع «${this.s.project.meta.name}» تعديلات لم تُحفظ. ماذا تريد أن تفعل قبل ${what}؟`)],
      actions: [
        { label: 'إلغاء', value: 'cancel' },
        { label: 'تجاهل التعديلات', danger: true, value: 'discard' },
        { label: 'حفظ ثم متابعة', primary: true, value: 'save' },
      ],
      onClose: async v => {
        if (v === 'save') res(await this.save());
        else res(v === 'discard');
      },
    }));
  }

  async newProject() {
    if (!(await this.guard('إنشاء مشروع جديد'))) return;
    storage.clearDraft();
    this.s.load(createProject('شخصية جديدة'));
    toast('مشروع جديد');
  }

  async openDialog() {
    let rows = [];
    try { rows = await storage.list(); } catch { rows = null; }
    const cur = this.s.project.meta.id;
    let dlg;
    const listEl = h('div.proj-list');
    const render = () => {
      listEl.replaceChildren();
      if (rows === null) { listEl.append(h('div.empty', null, icon('alert', 28), h('p', null, 'تعذّر قراءة المشاريع المحفوظة في هذا المتصفح.'))); return; }
      if (!rows.length) { listEl.append(h('div.empty', null, icon('folder', 28), h('p', null, 'لا توجد مشاريع محفوظة على هذا الجهاز بعد.'), h('small', null, 'احفظ المشروع الحالي ليظهر هنا، أو افتح ملف مشروع.'))); return; }
      for (const r of rows) {
        const open = h('button.proj-open', { type: 'button', onclick: async () => { dlg.close(); await this.openStored(r.id); } },
          r.thumb ? h('img.proj-thumb', { src: r.thumb, alt: '' }) : h('div.proj-thumb.ph', null, icon('body', 28)),
          h('div.proj-meta', null, h('strong', null, r.name), h('small', null, fmtDate(r.updatedAt))),
          r.id === cur ? h('span.badge', null, 'مفتوح') : null);
        const del = iconBtn({ icon: 'trash', label: 'حذف من هذا الجهاز', cls: 'danger-hover', onClick: async () => {
          if (r.id === cur) { toast('لا يمكن حذف المشروع المفتوح حالياً.'); return; }
          const rec = await storage.get(r.id);
          await storage.remove(r.id);
          rows = rows.filter(x => x.id !== r.id); render();
          toast(`حُذف «${r.name}»`, { action: { label: 'تراجع', run: async () => { await storage.put(rec.data, rec.thumb); rows = await storage.list(); render(); } } });
        } });
        listEl.append(h('div.proj-row', null, open, del));
      }
    };
    render();
    dlg = dialog({
      title: 'فتح مشروع', cls: 'modal-md',
      body: () => [
        h('div.modal-sub', null, storage.mode === 'local' ? 'المشاريع محفوظة في ذاكرة المتصفح المحلية (وضع محدود).' : 'المشاريع المحفوظة في هذا المتصفح على هذا الجهاز.'),
        listEl,
      ],
      actions: [{ label: 'فتح ملف من الجهاز…', onClick: () => { this.importFile(); } }],
    });
  }

  async openStored(id) {
    if (id === this.s.project.meta.id && !this.s.dirty) return;
    if (!(await this.guard('فتح مشروع آخر'))) return;
    const rec = await storage.get(id);
    if (!rec) { toast('لم يُعثر على المشروع.', { kind: 'error' }); return; }
    const r = Studio.fromText(JSON.stringify(rec.data));
    if (r.errors.length) { this.showErrors('تعذّر فتح المشروع', r.errors); return; }
    storage.clearDraft();
    storage.setLast(id);
    this.s.load(r.project, { saved: true });
    this.s.ui.save.at = Date.parse(rec.updatedAt) || Date.now();
    toast(`فُتح «${r.project.meta.name}»`);
  }

  async importFile() {
    const f = await pickFile('.json,.cylio,application/json');
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast('الملف أكبر من 8 ميغابايت.', { kind: 'error' }); return; }
    const text = await f.text();
    const r = Studio.fromText(text);
    if (r.errors.length) {
      // maybe it is an animation file
      if (/cylio-animation/.test(text.slice(0, 400))) { this.importAnimation(text); return; }
      this.showErrors('تعذّر فتح الملف', r.errors); return;
    }
    if (!(await this.guard('فتح الملف'))) return;
    storage.clearDraft();
    this.s.load(r.project, { dirty: true });
    if (r.warnings.length) toast(`فُتح الملف مع ${r.warnings.length} تصحيح تلقائي`, { action: { label: 'التفاصيل', run: () => this.showErrors('تصحيحات أثناء الفتح', r.warnings, true) } });
    else toast(`فُتح «${r.project.meta.name}» — احفظه للاحتفاظ به على هذا الجهاز`);
  }

  async importAnimationFile() {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    this.importAnimation(await f.text());
  }
  importAnimation(text) {
    const r = this.s.importClipText(text);
    if (r.error) { toast(r.error, { kind: 'error' }); return; }
    toast(`استُوردت الحركة «${r.clip.name}»${r.warnings.length ? ` مع ${r.warnings.length} تصحيح` : ''}`);
  }

  showErrors(title, list, warn) {
    dialog({
      title, cls: 'modal-md',
      body: () => [h('ul.issue-list', null, list.slice(0, 40).map(e => h('li', null, icon(warn ? 'info' : 'alert', 16), h('span', null, e.path ? h('code', { dir: 'ltr' }, e.path) : null, ' ', e.message))))],
      actions: [{ label: 'حسناً', primary: true }],
    });
  }

  exportProject() {
    const p = this.s.projectFile();
    downloadBlob(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), `${safeName(p.meta.name)}.cylio.json`);
  }
  exportAnimation(id) {
    const f = this.s.clipFile(id);
    if (!f) { toast('لا توجد حركة مفتوحة.'); return; }
    downloadBlob(new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' }), `${safeName(f.animation.name)}.cylio-anim.json`);
  }
  async exportGLB() {
    const close = toast('جارٍ تجهيز ملف GLB…', { ms: 20000 });
    try {
      const { exportGLB } = await import('../export/gltf.js');
      const buf = await exportGLB(this.s.vp.char, this.s.project.animations);
      close();
      downloadBlob(new Blob([buf], { type: 'model/gltf-binary' }), `${safeName(this.s.project.meta.name)}.glb`);
      toast(`صُدّر GLB مع ${this.s.project.animations.length} حركة`, { kind: 'ok' });
    } catch (e) {
      close();
      toast('تعذّر تصدير GLB: ' + (e && e.message || e), { kind: 'error' });
    }
  }

  shortcutsDialog() {
    const rows = [
      ['أدوات المشهد', [['Q', 'تحديد'], ['W', 'نقل الشخصية'], ['E', 'تدوير'], ['R', 'تغيير الحجم'], ['F', 'تركيز على المحدد'], ['H', 'إعادة ضبط الكاميرا'], ['1 / 2 / 3', 'عرض أمامي / جانبي / خلفي'], ['G', 'الشبكة'], ['J', 'المفاصل'], ['B', 'مقارنة بالوضعية الأساسية'], ['M', 'تعديل الجهتين معاً'], ['Esc', 'إلغاء التحديد / الخروج من التجربة']]],
      ['التحريك', [['Space', 'تشغيل / إيقاف'], ['K', 'إضافة إطار'], ['Delete', 'حذف الإطارات المحددة'], ['← / →', 'إطار سابق / تالٍ'], ['Shift + ← / →', 'الإطار المفتاحي السابق / التالي'], ['Ctrl + C / V', 'نسخ / لصق الإطارات']]],
      ['عام', [['Ctrl + Z', 'تراجع'], ['Ctrl + Shift + Z', 'إعادة'], ['Ctrl + S', 'حفظ'], ['T', 'تجربة الشخصية']]],
    ];
    dialog({
      title: 'اختصارات لوحة المفاتيح', cls: 'modal-md',
      body: () => rows.map(([t, list]) => h('section.kbd-group', null, h('h3', null, t), h('dl', null, list.map(([k, d]) => [h('dt', null, h('kbd', { dir: 'ltr' }, k)), h('dd', null, d)])))),
    });
  }
  aboutDialog(version) {
    dialog({
      title: 'حول Cylio Studio', cls: 'modal-sm',
      body: () => [
        h('p.modal-text', null, 'محرّر لشخصيات من ست أسطوانات: الشكل والمظهر والوضعيات والحركات، مع تجربة مباشرة وتصدير GLB.'),
        h('dl.about', null,
          h('dt', null, 'الإصدار'), h('dd', null, num(version)),
          h('dt', null, 'التخزين'), h('dd', null, storage.mode === 'indexeddb' ? 'IndexedDB على هذا الجهاز' : 'ذاكرة المتصفح المحلية'),
          h('dt', null, 'الهيكل'), h('dd', null, num('cylio-r6'), ' — 7 مفاصل')),
      ],
    });
  }
}
export { btn };

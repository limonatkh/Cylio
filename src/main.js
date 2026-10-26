/* =====================================================================
 * Cylio Studio — entry point.
 * Opens straight into the editor: the last project on this device, a
 * recovered draft, or a new default character.
 * ===================================================================== */
import { Studio } from './app/studio.js';
import { Viewport } from './render/viewport.js';
import { Arena } from './render/arena.js';
import { createProject, cleanProject, APP_VERSION } from './core/project.js';
import { storage } from './storage/projects.js';
import { initTooltips, toast, h } from './ui/dom.js';
import { mountTopbar } from './ui/topbar.js';
import { mountSidePanel } from './ui/sidepanel.js';
import { mountProps } from './ui/props.js';
import { mountToolbar } from './ui/toolbar.js';
import { mountTimeline } from './ui/timeline.js';
import { mountTestHud } from './ui/testhud.js';
import { mountLayout } from './ui/layout.js';
import { mountShortcuts } from './ui/shortcuts.js';
import { ProjectIO } from './ui/projectio.js';

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export function showFatal(title, detail) {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.hidden = false; boot.classList.add('error');
  boot.replaceChildren(h('div.boot-card', null,
    h('div.boot-mark.err', { 'aria-hidden': 'true' }, '!'),
    h('h1', null, title),
    h('p', null, detail),
    h('button.btn.primary', { type: 'button', onclick: () => location.reload() }, 'إعادة المحاولة')));
}

async function initialProject() {
  const draft = storage.readDraft();
  const lastId = storage.getLast();
  let saved = null;
  if (lastId) { try { saved = await storage.get(lastId); } catch { saved = null; } }
  if (draft) {
    const r = cleanProject(draft.data);
    const newer = !saved || saved.id !== draft.id || draft.savedAt > (Date.parse(saved.updatedAt) || 0);
    if (r.project && newer) return { project: r.project, opts: { dirty: true }, recovered: true, saved };
  }
  if (saved) {
    const r = cleanProject(saved.data);
    if (r.project) return { project: r.project, opts: { saved: true }, savedAt: Date.parse(saved.updatedAt) };
  }
  return { project: createProject('شخصية Cylio'), opts: {} };
}

async function boot() {
  if (!webglOK()) { showFatal('المتصفح لا يدعم العرض ثلاثي الأبعاد', 'يحتاج Cylio Studio إلى WebGL. جرّب متصفحاً حديثاً (Chrome أو Edge أو Firefox أو Safari) أو فعّل تسريع الرسوميات.'); return; }
  await storage.init();
  const app = document.getElementById('app');
  const touch = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 600;
  const quality = touch && small || (navigator.deviceMemory && navigator.deviceMemory <= 3) ? 'low' : 'high';

  const s = new Studio();
  const io = new ProjectIO(s);
  const vp = new Viewport(app.querySelector('.viewport'), { quality, touch });
  const arena = new Arena(vp);
  s.attachViewport(vp, arena);

  const init = await initialProject();
  s.load(init.project, init.opts);
  if (init.savedAt) s.ui.save.at = init.savedAt;

  initTooltips();
  const topbar = mountTopbar(app.querySelector('.topbar'), s, io);
  mountSidePanel(app.querySelector('.side'), s, io);
  mountProps(app.querySelector('.props'), s);
  mountToolbar(app.querySelector('.stage-ui'), s);
  mountTimeline(app.querySelector('.timeline'), s, io);
  mountTestHud(app.querySelector('.stage-ui'), s);
  mountLayout(app, s);
  mountShortcuts(s, io, topbar);
  s.emit('all');
  requestAnimationFrame(() => { vp.resize(); vp.resetCamera(); if (vp._camAnim) vp._camAnim.u = 0.999; });

  window.addEventListener('beforeunload', e => { if (s.dirty) { storage.saveDraft(s.project); e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && s.dirty) storage.saveDraft(s.project); });

  const bootEl = document.getElementById('boot');
  bootEl.classList.add('out'); setTimeout(() => { bootEl.hidden = true; }, 220);
  app.removeAttribute('aria-busy');
  window.__cylioReady = true;
  window.__cylio = { studio: s, vp, arena, io, version: APP_VERSION };

  if (init.recovered) {
    toast('استُرجعت تعديلات غير محفوظة من الجلسة السابقة', {
      ms: 8000,
      action: { label: 'تجاهلها', run: async () => {
        storage.clearDraft();
        if (init.saved) { const r = cleanProject(init.saved.data); if (r.project) { s.load(r.project, { saved: true }); return; } }
        s.load(createProject('شخصية Cylio'));
      } },
    });
  }
}

boot().catch(err => {
  console.error(err);
  showFatal('تعذّر تشغيل المحرّر', 'حدث خطأ أثناء التحميل: ' + (err && err.message ? err.message : String(err)));
});

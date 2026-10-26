/* =====================================================================
 * Keyboard shortcuts (desktop). Ignored while typing in a field.
 * Letter keys are matched by physical key (e.code) so they also work
 * with an Arabic keyboard layout.
 * ===================================================================== */
import { toast } from './dom.js';

export function mountShortcuts(s, io, topbar) {
  window.addEventListener('keydown', e => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' && !['range', 'checkbox', 'button', 'color'].includes(t.type) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (document.querySelector('.modal-back')) return;
    const mod = e.ctrlKey || e.metaKey;
    const code = e.code;
    // always available
    if (mod && code === 'KeyS') { e.preventDefault(); io.save(); return; }
    if (typing) return;
    if (mod && code === 'KeyZ') { e.preventDefault(); e.shiftKey ? topbar.redo() : topbar.undo(); return; }
    if (mod && code === 'KeyY') { e.preventDefault(); topbar.redo(); return; }
    if (mod && code === 'KeyO') { e.preventDefault(); io.openDialog(); return; }
    if (s.ui.testing) {
      if (code === 'Escape' || code === 'KeyT') { e.preventDefault(); s.exitTest(); }
      return;                                  // movement keys belong to the test HUD
    }
    if (document.querySelector('.menu')) return;
    const anim = s.ui.section === 'anim' && s.clip;
    if (mod) {
      if (anim && code === 'KeyC') { const n = s.copyKeys(); if (n) { e.preventDefault(); toast(`نُسخ ${n} إطار`); s.emit('anim'); } }
      else if (anim && code === 'KeyV') { e.preventDefault(); s.pasteKeys(); }
      return;
    }
    if (e.altKey) return;
    const onButton = t && t.tagName === 'BUTTON';
    switch (code) {
      case 'KeyQ': s.setTool('select'); break;
      case 'KeyW': s.setTool('move'); break;
      case 'KeyE': s.setTool('rotate'); break;
      case 'KeyR': s.setTool('scale'); break;
      case 'KeyF': s.vp.focus(s.ui.selected); break;
      case 'KeyH': s.vp.resetCamera(); break;
      case 'Digit1': case 'Numpad1': s.vp.view('front'); break;
      case 'Digit2': case 'Numpad2': s.vp.view('left'); break;
      case 'Digit3': case 'Numpad3': s.vp.view('back'); break;
      case 'KeyG': s.toggle('showGrid'); break;
      case 'KeyJ': s.toggle('showJoints'); break;
      case 'KeyB': if (s.mode === 'pose' || s.mode === 'anim') s.toggle('compare'); break;
      case 'KeyM': s.ui.symmetric = !s.ui.symmetric; s.emit('ui'); toast(s.ui.symmetric ? 'تعديل الجهتين معاً: مُفعّل' : 'تعديل الجهتين معاً: متوقف', { ms: 1400 }); break;
      case 'KeyT': s.enterTest(); break;
      case 'Escape': if (s.ui.section === 'anim' && s.hasPending()) s.discardPending(); else if (s.ui.anim.sel.size) s.setKeySel([], false); else s.select(null); break;
      case 'Space': if (anim && !onButton) { s.togglePlay(); break; } return;
      case 'KeyK': if (anim) s.addKey(); break;
      case 'Delete': case 'Backspace': if (anim) { const n = s.deleteKeys(); if (n) toast(`حُذف ${n === 1 ? 'إطار' : n + ' إطارات'}`, { action: { label: 'تراجع', run: () => s.undo() } }); } break;
      case 'ArrowLeft': case 'ArrowRight': {
        if (!anim || (t && t.closest && t.closest('[role=radiogroup],[role=tablist],[role=listbox],.tl-grip'))) return;
        const d = code === 'ArrowRight' ? 1 : -1;    // time runs left → right
        if (e.shiftKey) s.jumpKey(d); else s.stepFrame(d);
        break;
      }
      default: return;
    }
    e.preventDefault();
  });
}

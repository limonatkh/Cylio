/* =====================================================================
 * Project storage on this device: IndexedDB, with localStorage as a
 * fallback (private windows, old browsers). Records:
 *   { id, name, updatedAt, thumb (jpeg data URL | null), data (project) }
 * A recovery draft of the open project is kept separately so a crash or
 * a closed tab never loses unsaved work.
 * ===================================================================== */
const DB = 'cylio-studio', STORE = 'projects', LS = 'cylio.projects.', DRAFT = 'cylio.draft', LAST = 'cylio.lastProject';

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no indexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  }).catch(e => { dbp = null; throw e; });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const lsKeys = () => { try { return Object.keys(localStorage).filter(k => k.startsWith(LS)); } catch { return []; } };

export const storage = {
  mode: 'indexeddb',
  async init() { try { await db(); } catch { this.mode = 'local'; } return this.mode; },

  async list() {
    let rows = [];
    if (this.mode === 'indexeddb') rows = await tx('readonly', s => s.getAll());
    else for (const k of lsKeys()) { try { rows.push(JSON.parse(localStorage.getItem(k))); } catch { /* skip broken */ } }
    return rows.filter(Boolean).map(r => ({ id: r.id, name: r.name, updatedAt: r.updatedAt, thumb: r.thumb })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  },
  async get(id) {
    if (this.mode === 'indexeddb') return tx('readonly', s => s.get(id));
    try { return JSON.parse(localStorage.getItem(LS + id)); } catch { return null; }
  },
  async put(project, thumb) {
    const rec = { id: project.meta.id, name: project.meta.name, updatedAt: project.meta.updatedAt, thumb: thumb || null, data: project };
    if (this.mode === 'indexeddb') await tx('readwrite', s => s.put(rec));
    else localStorage.setItem(LS + rec.id, JSON.stringify(rec));   // may throw QuotaExceededError → caller reports it
    this.setLast(rec.id);
    return rec;
  },
  async remove(id) {
    if (this.mode === 'indexeddb') await tx('readwrite', s => s.delete(id));
    else localStorage.removeItem(LS + id);
  },

  getLast() { try { return localStorage.getItem(LAST); } catch { return null; } },
  setLast(id) { try { localStorage.setItem(LAST, id); } catch { /* ignore */ } },

  /* recovery draft: { id, savedAt, data } */
  saveDraft(project) { try { localStorage.setItem(DRAFT, JSON.stringify({ id: project.meta.id, savedAt: Date.now(), data: project })); return true; } catch { return false; } },
  readDraft() { try { const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); return d && d.data ? d : null; } catch { return null; } },
  clearDraft() { try { localStorage.removeItem(DRAFT); } catch { /* ignore */ } },
};

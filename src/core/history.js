/* =====================================================================
 * HISTORY — undo / redo of project snapshots.
 * commit(label) closes one step; begin() … commit() around a drag makes
 * the whole drag one step. UI state (selection, time) is not recorded.
 * ===================================================================== */
export class History {
  constructor(limit = 150) { this.limit = limit; this.undoStack = []; this.redoStack = []; this.open = null; }
  /** Snapshot taken BEFORE a change. */
  begin(snapshot) { if (this.open === null) this.open = snapshot; }
  /** Close the step started by begin() (or record `before` directly). */
  commit(label, after, before = this.open) {
    this.open = null;
    if (before === null || before === undefined || before === after) return false;
    this.undoStack.push({ label, before, after });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    return true;
  }
  cancel() { const s = this.open; this.open = null; return s; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.canUndo ? this.undoStack[this.undoStack.length - 1].label : ''; }
  get redoLabel() { return this.canRedo ? this.redoStack[this.redoStack.length - 1].label : ''; }
  undo() { const e = this.undoStack.pop(); if (!e) return null; this.redoStack.push(e); return e; }
  redo() { const e = this.redoStack.pop(); if (!e) return null; this.undoStack.push(e); return e; }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; this.open = null; }
}

/* =====================================================================
 * Studio — the editor's state and every action the UI can take.
 *
 * The project is the only thing that is saved and undone. UI state
 * (section, selection, current time…) lives in `ui` and is never part
 * of undo. Every change goes through live() / commit() / act():
 *   live(label, fn, flags)  apply a change now (opens one undo step)
 *   commit()                close the undo step (end of a drag / input)
 *   act(label, fn, flags)   live + commit
 * flags tell the views what to refresh: shape, look, pose, anim, ui, all.
 *
 * Three editing modes never overlap:
 *   shape  — dimensions of the parts (Character › Shape)
 *   pose   — the character's display pose (Character › Pose)
 *   anim   — keys of the open animation (Animation)
 * In "anim" with auto-key off, edits are held as a pending change shown
 * in the timeline until the user adds a key or discards it — so moving a
 * part while previewing never rewrites an animation by accident.
 * ===================================================================== */
import { clone, clamp, round } from '../core/math.js';
import { PART_IDS, PART_INFO, DEFAULT_SHAPE, SHAPE_LIMITS, LAYOUT_LIMITS, layout } from '../core/character.js';
import { JOINT_IDS, JOINT_INFO, clampRot, clampPos, mirrorRot, restPose, presetPose } from '../core/rig.js';
import {
  sampleClip, poseToQuats, setKey, removeKey, findKey, snapTime, sortTrack, setDuration, emptyClip, duplicateClip, LIMITS, EASES,
} from '../core/anim.js';
import { builtinClips, LOCOMOTION_ROLES } from '../core/builtins.js';
import { MATERIALS } from '../core/appearance.js';
import { createProject, cleanProject, animationFile, readAnimationFile, parseJson, APP_NAME } from '../core/project.js';
import { History } from '../core/history.js';
import { storage } from '../storage/projects.js';

const SECTION_MODE = { character: null, look: 'look', anim: 'anim' };
export const keyId = (jid, t) => `${jid}|${round(t, 4)}`;
export const parseKeyId = s => { const [jid, t] = s.split('|'); return { jid, t: +t }; };

export class Studio {
  constructor() {
    this.history = new History(200);
    this.subs = new Set();
    this.ui = {
      section: 'character', edit: 'shape',
      selected: null, hovered: null,
      tools: { shape: 'select', pose: 'rotate', anim: 'rotate', look: 'select' },
      symmetric: true, linkDims: true,
      showGrid: false, showJoints: false, compare: false,
      anim: { clipId: null, time: 0, playing: false, speed: 1, loopPreview: true, autoKey: false, sel: new Set(), pending: {}, clipboard: null },
      testing: false, timelineOpen: true,
      save: { status: 'new', at: null },
    };
    this.project = null;
    this.savedContent = null;
    this.vp = null; this.arena = null;
  }

  /* ---------------------------------------------------------------- wiring */
  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(flags) {
    const f = typeof flags === 'string' ? { [flags]: true } : (flags || {});
    if (f.all) Object.assign(f, { shape: true, look: true, pose: true, anim: true, ui: true });
    if (this.vp) {
      if (f.shape) { this.vp.setShape(this.project.shape); this.vp.setAppearance(this.project.appearance); }
      else if (f.look) this.vp.setAppearance(this.project.appearance);
      if (f.shape || f.pose || f.anim) this.applyDisplayPose();
      if (f.ui || f.select) this.syncViewport();
    }
    for (const fn of this.subs) fn(f);
  }
  attachViewport(vp, arena) {
    this.vp = vp; this.arena = arena;
    vp.on('onPick', id => this.select(id));
    vp.on('onHover', id => { this.ui.hovered = id; this.emit('hover'); });
    vp.on('onGizmoStart', kind => this.gizmoStart(kind));
    vp.on('onGizmo', (kind, v) => this.gizmoMove(kind, v));
    vp.on('onGizmoEnd', kind => this.gizmoEnd(kind));
    vp.on('onFrame', dt => this.frame(dt));
  }

  /* ---------------------------------------------------------------- derived */
  get mode() { return this.ui.testing ? 'test' : this.ui.section === 'character' ? this.ui.edit : SECTION_MODE[this.ui.section]; }
  get tool() { return this.ui.tools[this.mode] || 'select'; }
  get layout() { return layout(this.project.shape); }
  get clip() { return this.project.animations.find(c => c.id === this.ui.anim.clipId) || null; }
  snap() { return JSON.stringify(this.project); }
  contentSnap() { return JSON.stringify({ ...this.project, meta: { ...this.project.meta, updatedAt: 0 } }); }
  get dirty() { return this.ui.save.status === 'dirty' || this.ui.save.status === 'error'; }
  clipDirty(clip) { return this.savedClips ? this.savedClips.get(clip.id) !== JSON.stringify(clip) : false; }
  /** Joints shown as selectable in the current mode (root only where it can move). */
  selectable() { return this.mode === 'pose' || this.mode === 'anim' ? ['root', ...PART_IDS] : PART_IDS; }

  /* ---------------------------------------------------------------- project lifecycle */
  load(project, o = {}) {
    this.project = project;
    this.history.clear();
    const a = this.ui.anim;
    a.playing = false; a.time = 0; a.sel = new Set(); a.pending = {};
    a.clipId = (project.animations.find(c => c.id === a.clipId) || project.animations.find(c => c.role === 'idle') || project.animations[0] || {}).id || null;
    if (this.ui.selected && !this.selectable().includes(this.ui.selected)) this.ui.selected = null;
    if (o.saved) this.markSaved();
    else {
      this.savedContent = o.dirty ? null : this.contentSnap();
      this.savedClips = new Map(o.dirty ? [] : project.animations.map(c => [c.id, JSON.stringify(c)]));
      this.ui.save = { status: o.dirty ? 'dirty' : 'new', at: null };
    }
    this.emit('all');
  }
  markSaved() {
    this.savedContent = this.contentSnap();
    this.savedClips = new Map(this.project.animations.map(c => [c.id, JSON.stringify(c)]));
    this.ui.save = { status: 'saved', at: Date.now() };
  }
  refreshDirty() {
    const st = this.ui.save.status;
    const same = this.savedContent !== null && this.contentSnap() === this.savedContent;
    if (same) { if (st === 'dirty' || st === 'error') this.ui.save.status = this.ui.save.at ? 'saved' : 'new'; }
    else this.ui.save.status = 'dirty';
    this.scheduleDraft();
  }
  scheduleDraft() {
    clearTimeout(this._draftT);
    this._draftT = setTimeout(() => { if (this.dirty) storage.saveDraft(this.project); else storage.clearDraft(); }, 700);
  }
  async save() {
    this.commitPending({ silent: true });
    this.commit();
    this.ui.save.status = 'saving'; this.emit('save');
    try {
      this.project.meta.updatedAt = new Date().toISOString();
      const thumb = this.vp && !this.ui.testing ? this.vp.snapshot() : null;
      await storage.put(clone(this.project), thumb);
      this.markSaved();
      storage.clearDraft();
      this.emit({ save: true, anim: true });
      return true;
    } catch (e) {
      this.ui.save.status = 'error'; this.ui.save.error = /quota/i.test(String(e && (e.name || e.message))) ? 'مساحة التخزين ممتلئة' : 'تعذّر الحفظ في المتصفح';
      this.emit('save');
      return false;
    }
  }

  /* ---------------------------------------------------------------- history */
  live(label, fn, flags = 'all') {
    if (this.history.open === null) this.history.begin(this.snap());
    this._label = label;
    fn(this.project);
    this.ui.save.status = 'dirty';
    this.emit(flags);
  }
  commit() {
    if (this.history.open === null) return;
    const after = this.snap();
    if (this.history.commit(this._label || 'تعديل', after)) this.emit('history');
    this.refreshDirty(); this.emit('save');
  }
  act(label, fn, flags) { this.live(label, fn, flags); this.commit(); }
  undo() {
    this.commit();
    const e = this.history.undo(); if (!e) return null;
    this.restore(e.before); return e.label;
  }
  redo() {
    this.commit();
    const e = this.history.redo(); if (!e) return null;
    this.restore(e.after); return e.label;
  }
  restore(json) {
    this.project = JSON.parse(json);
    const a = this.ui.anim;
    if (!this.clip) a.clipId = this.project.animations[0]?.id || null;
    a.sel = new Set([...a.sel].filter(k => { const { jid, t } = parseKeyId(k); return this.clip && findKey(this.clip, jid, t) >= 0; }));
    a.pending = {};
    if (this.clip) a.time = Math.min(a.time, this.clip.duration);
    this.refreshDirty();
    this.emit({ all: true, history: true, save: true });
  }

  /* ---------------------------------------------------------------- UI state */
  setSection(s) {
    if (this.ui.section === s) return;
    if (this.ui.section === 'anim') { this.discardPending(true); this.ui.anim.playing = false; }
    this.ui.section = s;
    if (this.ui.selected === 'root' && !this.selectable().includes('root')) this.ui.selected = null;
    this.emit({ ui: true, pose: true, section: true });
  }
  setEdit(e) {
    if (this.ui.edit === e) return;
    this.ui.edit = e;
    if (this.ui.selected === 'root' && e === 'shape') this.ui.selected = null;
    this.emit({ ui: true, pose: true, section: true });
  }
  select(id) {
    if (id && !this.selectable().includes(id)) id = null;
    if (this.ui.selected === id) { this.emit({ select: true, reselect: true }); return; }
    this.ui.selected = id;
    this.emit({ select: true, ui: true });
  }
  setTool(t) {
    this.ui.tools[this.mode] = t;
    if (t === 'move' && this.mode !== 'shape' && this.ui.selected !== 'root') this.ui.selected = 'root';
    this.emit({ ui: true, select: true });
  }
  toggle(k) { this.ui[k] = !this.ui[k]; this.emit({ ui: true, pose: k === 'compare' }); }
  syncViewport() {
    const vp = this.vp; if (!vp) return;
    vp.setMode(this.mode);
    vp.setSelected(this.ui.selected);
    vp.setTool(this.tool);
    vp.setShowGrid(this.ui.showGrid);
    vp.setShowJoints(this.ui.showJoints);
    this.applyGhost();
  }

  /* ---------------------------------------------------------------- display pose */
  currentPose() {
    if (this.ui.section === 'anim' && this.clip) {
      const pose = sampleClip(this.clip, this.ui.anim.time, this.layout.legLength);
      for (const [jid, v] of Object.entries(this.ui.anim.pending)) { pose[jid].rot = v.rot.slice(); if (jid === 'root' && v.pos) pose.root.pos = v.pos.slice(); }
      return pose;
    }
    return this.project.pose;
  }
  applyDisplayPose() {
    if (!this.vp || this.ui.testing) return;
    this.vp.setPose(poseToQuats(this.currentPose()));
    this.applyGhost();
  }
  applyGhost() {
    if (!this.vp || this.ui.testing) return;
    const on = this.ui.compare && (this.mode === 'pose' || this.mode === 'anim');
    this.vp.setGhost(on ? poseToQuats(restPose()) : null);
  }
  jointValue(jid) {
    const p = this.currentPose()[jid];
    return { rot: p.rot.slice(), pos: p.pos ? p.pos.slice() : undefined };
  }

  /* ---------------------------------------------------------------- shape */
  partsFor(id) { const m = PART_INFO[id]?.mirror; return this.ui.symmetric && m ? [id, m] : [id]; }
  setDim(id, k, v, o = {}) {
    const lim = SHAPE_LIMITS[id][k];
    v = round(clamp(v, lim[0], lim[1]), 4);
    this.live(o.label || 'تعديل الأبعاد', p => {
      for (const pid of this.partsFor(id)) {
        const part = p.shape.parts[pid];
        if (this.ui.linkDims && (k === 'w' || k === 'd')) {
          const other = k === 'w' ? 'd' : 'w', ratio = part[other] / part[k];
          const ol = SHAPE_LIMITS[pid][other];
          part[other] = round(clamp(v * ratio, ol[0], ol[1]), 4);
        }
        part[k] = v;
      }
    }, 'shape');
  }
  setLayout(k, v) {
    const lim = LAYOUT_LIMITS[k];
    this.live('تعديل المسافات', p => { p.shape.layout[k] = round(clamp(v, lim[0], lim[1]), 4); }, 'shape');
  }
  resetShape(id) {
    this.act(id ? 'إعادة أبعاد الجزء' : 'إعادة شكل الشخصية', p => {
      if (!id) p.shape = clone(DEFAULT_SHAPE);
      else for (const pid of this.partsFor(id)) p.shape.parts[pid] = clone(DEFAULT_SHAPE.parts[pid]);
    }, 'shape');
  }

  /* ---------------------------------------------------------------- appearance */
  setLook(id, patch, o = {}) {
    const ids = id === '*' ? PART_IDS : this.partsFor(id);
    this.live(o.label || 'تعديل المظهر', p => {
      for (const pid of ids) {
        const a = p.appearance.parts[pid];
        Object.assign(a, patch);
        if (patch.material) { delete a.roughness; delete a.metalness; if (!MATERIALS[patch.material].texture) delete a.scale; }
      }
    }, 'look');
  }
  setFace(patch, o = {}) { this.live(o.label || 'تعديل الوجه', p => Object.assign(p.appearance.face, patch), 'look'); }

  /* ---------------------------------------------------------------- pose & keys */
  /** Rotate a joint in the current mode. Writes to the pose, a key (auto-key) or the pending change. */
  setRot(jid, rot, o = {}) {
    const targets = this.partsFor(jid).map(id => [id, id === jid ? rot : mirrorRot(rot)]);
    this.writeJoints(targets.map(([id, r]) => ({ jid: id, rot: clampRot(id, r) })), o.label || 'تدوير');
  }
  setRootPos(pos, o = {}) { this.writeJoints([{ jid: 'root', pos: clampPos(pos) }], o.label || 'تحريك الشخصية'); }
  writeJoints(list, label) {
    const mode = this.mode;
    if (mode === 'pose') {
      this.live(label, p => { for (const j of list) { if (j.rot) p.pose[j.jid].rot = j.rot; if (j.pos) p.pose.root.pos = j.pos; } }, 'pose');
    } else if (mode === 'anim' && this.clip) {
      const a = this.ui.anim;
      a.playing = false;
      if (a.autoKey) {
        this.live(label + ' (إطار)', () => {
          for (const j of list) {
            const cur = this.jointValue(j.jid);
            setKey(this.clip, j.jid, a.time, { rot: j.rot || cur.rot, pos: j.pos || cur.pos });
          }
        }, 'anim');
      } else {
        for (const j of list) {
          const cur = this.jointValue(j.jid);
          a.pending[j.jid] = { rot: j.rot || cur.rot, pos: j.jid === 'root' ? (j.pos || cur.pos || [0, 0, 0]) : undefined };
        }
        this.emit({ pose: true, pending: true });
      }
    }
  }
  applyPreset(id) { this.act('وضعية جاهزة', p => { p.pose = presetPose(id); }, 'pose'); }
  resetPose(jid) {
    if (this.mode === 'pose') this.act('إعادة الوضعية', p => { if (jid) { p.pose[jid] = restPose()[jid]; for (const m of this.partsFor(jid)) p.pose[m] = restPose()[m]; } else p.pose = restPose(); }, 'pose');
    else if (this.mode === 'anim') {
      const r = restPose();
      const ids = jid ? (jid === 'root' ? ['root'] : this.partsFor(jid)) : JOINT_IDS;
      this.writeJoints(ids.map(id => ({ jid: id, rot: r[id].rot, pos: id === 'root' ? [0, 0, 0] : undefined })), 'إعادة المفصل');
      this.commit();
    }
  }

  /* gizmo drags */
  gizmoStart(kind) {
    if (kind === 'scale') this._scaleStart = clone(this.project.shape.parts);
    this._gizmoKind = kind;
  }
  gizmoMove(kind, v) {
    const id = this.ui.selected;
    if (kind === 'rotate' && id) this.setRot(id, v, { label: 'تدوير ' + JOINT_INFO[id].label });
    else if (kind === 'move') this.setRootPos(v);
    else if (kind === 'scale' && id && this._scaleStart) {
      const s0 = this._scaleStart;
      let [fx, fy, fz] = v;
      if (this.ui.linkDims) { const f = Math.abs(fx - 1) > Math.abs(fz - 1) ? fx : fz; fx = fz = f; }
      this.live('تغيير الحجم', p => {
        for (const pid of this.partsFor(id)) {
          const L = SHAPE_LIMITS[pid], a = s0[pid], dst = p.shape.parts[pid];
          dst.w = round(clamp(a.w * fx, ...L.w), 4); dst.h = round(clamp(a.h * fy, ...L.h), 4); dst.d = round(clamp(a.d * fz, ...L.d), 4);
        }
      }, 'shape');
    }
  }
  gizmoEnd(kind) {
    this.commit();
    if (kind === 'scale') { this._scaleStart = null; this.vp?.resetProxy(); }
    this.applyDisplayPose();   // snap the joint back to the clamped value
    this.emit({ ui: true, gizmoEnd: true });
  }

  /* ---------------------------------------------------------------- animation */
  openClip(id) {
    this.discardPending(true);
    const a = this.ui.anim;
    a.clipId = id; a.time = 0; a.sel = new Set(); a.playing = false;
    this.emit({ anim: true, clip: true });
  }
  previewClip(id) {
    if (this.ui.anim.clipId !== id) this.openClip(id);
    this.ui.anim.playing = true; this.ui.anim.pending = {};
    this.emit({ anim: true, play: true });
  }
  setTime(t, o = {}) {
    const c = this.clip; if (!c) return;
    const a = this.ui.anim;
    if (Object.keys(a.pending).length && !o.keepPending) this.discardPending();
    a.time = clamp(o.snap === false ? t : snapTime(c, t), 0, c.duration);
    this.emit({ anim: true, time: true });
  }
  stepFrame(d) { const c = this.clip; if (!c) return; this.ui.anim.playing = false; this.setTime(this.ui.anim.time + d / c.fps); }
  jumpKey(d) {
    const c = this.clip; if (!c) return;
    const times = [...new Set(Object.values(c.tracks).flatMap(tr => tr.map(k => k.t)))].sort((x, y) => x - y);
    const t = this.ui.anim.time;
    const next = d > 0 ? times.find(x => x > t + 1e-4) : [...times].reverse().find(x => x < t - 1e-4);
    if (next !== undefined) { this.ui.anim.playing = false; this.setTime(next); }
  }
  togglePlay() {
    const a = this.ui.anim, c = this.clip; if (!c) return;
    if (!a.playing) { this.discardPending(); if (!c.loop && !a.loopPreview && a.time >= c.duration - 1e-3) a.time = 0; }
    a.playing = !a.playing;
    this.emit({ anim: true, play: true });
  }
  frame(dt) {
    if (!this.project) return false;
    if (this.ui.testing && this.arena) { const r = this.arena.update(dt); this._testTick = (this._testTick || 0) + dt; if (this._testTick > 0.1) { this._testTick = 0; this.emit('test'); } return r; }
    const a = this.ui.anim, c = this.clip;
    if (this.ui.section === 'anim' && a.playing && c) {
      let t = a.time + dt * a.speed;
      if (t >= c.duration) { if (c.loop || a.loopPreview) t %= c.duration; else { t = c.duration; a.playing = false; this.emit('play'); } }
      a.time = t;
      this.applyDisplayPose();
      this.emit({ time: true, tick: true });
      return true;
    }
    return false;
  }
  hasPending() { return Object.keys(this.ui.anim.pending).length > 0; }
  discardPending(silent) {
    if (!this.hasPending()) return false;
    this.ui.anim.pending = {};
    if (!silent) this.emit({ pose: true, pending: true, discarded: true }); else this.emit({ pose: true, pending: true });
    return true;
  }
  commitPending(o = {}) {
    if (!this.hasPending() || !this.clip) return false;
    const a = this.ui.anim, pend = a.pending;
    this.act('إضافة إطار', () => { for (const [jid, v] of Object.entries(pend)) setKey(this.clip, jid, a.time, v); }, 'anim');
    for (const jid of Object.keys(pend)) a.sel.add(keyId(jid, snapTime(this.clip, a.time)));
    a.pending = {};
    if (!o.silent) this.emit({ anim: true, pending: true });
    return true;
  }
  /** K: record pending changes, or key the selected joint (all joints when nothing is selected). */
  addKey() {
    const c = this.clip; if (!c) return;
    if (this.commitPending()) return;
    const a = this.ui.anim, sel = this.ui.selected;
    const ids = sel ? (sel === 'root' ? ['root'] : this.partsFor(sel)) : JOINT_IDS;
    const pose = this.currentPose();
    this.act(ids.length > 2 ? 'إطار لكل المفاصل' : 'إضافة إطار', () => {
      for (const jid of ids) setKey(c, jid, a.time, { rot: pose[jid].rot, pos: jid === 'root' ? pose.root.pos : undefined });
    }, 'anim');
    a.sel = new Set(ids.map(j => keyId(j, snapTime(c, a.time))));
    this.emit('anim');
  }
  selectedKeys() {
    const c = this.clip; if (!c) return [];
    return [...this.ui.anim.sel].map(parseKeyId).filter(k => findKey(c, k.jid, k.t) >= 0);
  }
  setKeySel(ids, add) {
    const a = this.ui.anim;
    if (!add) a.sel = new Set();
    for (const id of ids) { if (add && a.sel.has(id) && ids.length === 1) a.sel.delete(id); else a.sel.add(id); }
    this.emit({ anim: true, keysel: true });
  }
  deleteKeys() {
    const ks = this.selectedKeys(); if (!ks.length) return 0;
    this.act(ks.length > 1 ? `حذف ${ks.length} إطارات` : 'حذف إطار', () => { for (const k of ks) removeKey(this.clip, k.jid, k.t); }, 'anim');
    this.ui.anim.sel = new Set();
    this.emit('anim');
    return ks.length;
  }
  copyKeys() {
    const ks = this.selectedKeys(); if (!ks.length) return 0;
    const t0 = Math.min(...ks.map(k => k.t));
    this.ui.anim.clipboard = ks.map(k => { const key = this.clip.tracks[k.jid][findKey(this.clip, k.jid, k.t)]; return { jid: k.jid, dt: k.t - t0, key: clone(key) }; });
    return ks.length;
  }
  pasteKeys() {
    const cb = this.ui.anim.clipboard, c = this.clip; if (!cb || !c) return 0;
    const t0 = this.ui.anim.time;
    const ids = [];
    this.act('لصق إطارات', () => {
      for (const it of cb) {
        const t = t0 + it.dt; if (t > c.duration + 1e-6) continue;
        setKey(c, it.jid, t, { rot: it.key.rot, pos: it.key.pos }, it.key.ease);
        ids.push(keyId(it.jid, snapTime(c, t)));
      }
    }, 'anim');
    this.ui.anim.sel = new Set(ids);
    this.emit('anim');
    return ids.length;
  }
  setEase(ease) {
    let ks = this.selectedKeys();
    if (!ks.length) ks = this.keysAtTime();
    if (!ks.length || !EASES[ease]) return;
    this.act('نوع الانتقال', () => { for (const k of ks) this.clip.tracks[k.jid][findKey(this.clip, k.jid, k.t)].ease = ease; }, 'anim');
  }
  keysAtTime() {
    const c = this.clip; if (!c) return [];
    const out = [];
    for (const [jid, tr] of Object.entries(c.tracks)) for (const k of tr) if (Math.abs(k.t - this.ui.anim.time) < 0.5 / c.fps) out.push({ jid, t: k.t });
    return out;
  }
  /** Keys shown as "current ease": selected keys, else keys at the playhead. */
  currentEase() {
    let ks = this.selectedKeys(); if (!ks.length) ks = this.keysAtTime();
    if (!ks.length) return null;
    const es = new Set(ks.map(k => this.clip.tracks[k.jid][findKey(this.clip, k.jid, k.t)].ease));
    return es.size === 1 ? [...es][0] : 'mixed';
  }
  /* key drag (timeline): beginKeyDrag → dragKeys(dt) … → endKeyDrag */
  beginKeyDrag() {
    const ks = this.selectedKeys(); if (!ks.length) return false;
    this.history.begin(this.snap()); this._label = ks.length > 1 ? 'تحريك إطارات' : 'تحريك إطار';
    this._drag = ks.map(k => ({ jid: k.jid, t: k.t, ref: this.clip.tracks[k.jid][findKey(this.clip, k.jid, k.t)] }));
    return true;
  }
  dragKeys(dt) {
    const c = this.clip, d = this._drag; if (!d || !c) return;
    const lo = -Math.min(...d.map(k => k.t)), hi = c.duration - Math.max(...d.map(k => k.t));
    const step = round(clamp(Math.round(dt * c.fps) / c.fps, lo, hi), 4);
    for (const k of d) k.ref.t = round(k.t + step, 4);
    for (const tr of Object.values(c.tracks)) tr.sort((x, y) => x.t - y.t);
    this.ui.anim.sel = new Set(d.map(k => keyId(k.jid, k.ref.t)));
    this.ui.save.status = 'dirty';
    this.emit({ anim: true, keydrag: true });
    return step;
  }
  endKeyDrag() {
    const c = this.clip; if (!this._drag) return;
    const moved = this._drag.some(k => Math.abs(k.ref.t - k.t) > 1e-6);
    for (const jid of Object.keys(c.tracks)) sortTrack(c.tracks[jid]);
    this._drag = null;
    if (moved) this.commit(); else { this.history.cancel(); this.refreshDirty(); }
    this.emit('anim');
  }

  /* clip management */
  setClipProp(k, v) {
    const c = this.clip; if (!c) return;
    const labels = { name: 'اسم الحركة', loop: 'تكرار الحركة', fps: 'معدل الإطارات', moveSpeed: 'سرعة الحركة' };
    this.act(labels[k] || 'خصائص الحركة', () => {
      if (k === 'name') c.name = String(v).trim().slice(0, LIMITS.name) || c.name;
      else if (k === 'fps') c.fps = Math.round(clamp(v, ...LIMITS.fps));
      else if (k === 'moveSpeed') c.moveSpeed = v === null ? null : round(clamp(v, 0.05, 30), 3);
      else c[k] = v;
    }, 'anim');
  }
  setClipDuration(d, mode) {
    const c = this.clip; if (!c) return;
    this.act('مدة الحركة', () => setDuration(c, d, mode), 'anim');
    this.ui.anim.time = Math.min(this.ui.anim.time, c.duration);
    this.emit('anim');
  }
  newClip() {
    if (this.project.animations.length >= LIMITS.clips) return null;
    const c = emptyClip('حركة جديدة');
    const pose = this.project.pose;
    for (const jid of JOINT_IDS) c.tracks[jid] = [{ t: 0, rot: pose[jid].rot.slice(), ease: 'smooth', ...(jid === 'root' ? { pos: pose.root.pos.slice() } : {}) }];
    this.act('حركة جديدة', p => p.animations.push(c), 'anim');
    this.openClip(c.id);
    return c;
  }
  duplicateClip(id) {
    const src = this.project.animations.find(c => c.id === id); if (!src || this.project.animations.length >= LIMITS.clips) return null;
    const c = duplicateClip(src); delete c.role;
    this.act('نسخ الحركة', p => p.animations.splice(p.animations.indexOf(src) + 1, 0, c), 'anim');
    this.openClip(c.id);
    return c;
  }
  deleteClip(id) {
    const i = this.project.animations.findIndex(c => c.id === id); if (i < 0) return null;
    const name = this.project.animations[i].name;
    this.act('حذف الحركة', p => {
      p.animations.splice(i, 1);
      for (const r of LOCOMOTION_ROLES) if (p.locomotion[r] === id) p.locomotion[r] = null;
    }, 'anim');
    if (this.ui.anim.clipId === id) this.openClip(this.project.animations[Math.min(i, this.project.animations.length - 1)]?.id || null);
    return name;
  }
  renameClip(id, name) { const c = this.project.animations.find(x => x.id === id); if (!c) return; this.act('تسمية الحركة', () => { c.name = name.slice(0, LIMITS.name); }, 'anim'); }
  restoreBuiltin(id) {
    const c = this.project.animations.find(x => x.id === id); if (!c || !c.role) return;
    const orig = builtinClips().find(b => b.role === c.role); if (!orig) return;
    this.act('استعادة الحركة الأصلية', p => { const i = p.animations.indexOf(c); orig.id = c.id; orig.name = c.name; p.animations[i] = orig; }, 'anim');
    this.ui.anim.sel = new Set();
    this.emit('anim');
  }
  setLocomotion(role, id) { this.act('حركات التجربة', p => { p.locomotion[role] = id || null; }, 'anim'); }
  importClipText(text) {
    const { value, error } = parseJson(text);
    if (error) return { error };
    const r = readAnimationFile(value);
    if (r.errors.length) return { error: r.errors[0].message };
    if (this.project.animations.length >= LIMITS.clips) return { error: `الحد الأقصى ${LIMITS.clips} حركة في المشروع.` };
    this.act('استيراد حركة', p => p.animations.push(r.clip), 'anim');
    this.openClip(r.clip.id);
    return { clip: r.clip, warnings: r.warnings };
  }
  clipFile(id) { const c = this.project.animations.find(x => x.id === id) || this.clip; return c ? animationFile(c) : null; }

  /* ---------------------------------------------------------------- project */
  rename(name) { this.act('اسم المشروع', p => { p.meta.name = name.slice(0, 60); }, 'ui'); }
  projectFile() { const p = clone(this.project); p.meta.app = APP_NAME; return p; }
  static fromText(text) {
    const { value, error } = parseJson(text);
    if (error) return { errors: [{ message: error }], warnings: [] };
    return cleanProject(value);
  }
  newProject() { this.load(createProject('شخصية جديدة')); this.ui.selected = null; this.emit('all'); }

  /* ---------------------------------------------------------------- test mode */
  enterTest() {
    if (this.ui.testing) return;
    this.commitPending({ silent: true }); this.discardPending(true);
    this.ui.anim.playing = false;
    const clips = {};
    for (const r of LOCOMOTION_ROLES) clips[r] = this.project.animations.find(c => c.id === this.project.locomotion[r]) || null;
    this.ui.testing = true;
    this.arena.enter(clips, this.layout.legLength);
    this.vp.setMode('test');
    this.emit({ ui: true, test: true, testing: true });
  }
  exitTest() {
    if (!this.ui.testing) return;
    this.ui.testing = false;
    this.arena.exit();
    this.emit({ all: true, testing: true });
  }
}

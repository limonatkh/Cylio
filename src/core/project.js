/* =====================================================================
 * PROJECT FILE — everything needed to keep editing a character.
 *
 * {
 *   format: "cylio-project", version: "1.0", rig: "cylio-r6",
 *   meta:   { id, name, createdAt, updatedAt, app },
 *   shape:  { parts: { head|torso|leftArm|…: { w, d, h, round } }, layout: {…} },
 *   appearance: { parts: { id: { color, material, … } }, face: {…} },
 *   pose:   the character's display pose (see rig.js),
 *   animations: [ clip, … ]                 (see anim.js)
 *   locomotion: { idle, walk, run, jump, fall, land }   clip ids used by the test arena
 * }
 * cleanProject() is the only way in: it never throws, never executes
 * anything, clamps every number and reports what it had to change.
 * ===================================================================== */
import { clone, isObj } from './math.js';
import { RIG_ID, cleanPose, restPose } from './rig.js';
import { DEFAULT_SHAPE, cleanShape } from './character.js';
import { defaultAppearance, cleanAppearance } from './appearance.js';
import { cleanClip, newId, LIMITS } from './anim.js';
import { builtinClips, LOCOMOTION_ROLES } from './builtins.js';

export const APP_NAME = 'Cylio Studio';
export const APP_VERSION = '1.0.0';
export const FORMAT = 'cylio-project';
export const ANIM_FORMAT = 'cylio-animation';
export const VERSION = '1.0';

export function defaultLocomotion(clips) {
  const loc = {};
  for (const r of LOCOMOTION_ROLES) { const c = clips.find(x => x.role === r); loc[r] = c ? c.id : null; }
  return loc;
}

export function createProject(name = 'شخصية جديدة') {
  const now = new Date().toISOString();
  const animations = builtinClips();
  return {
    format: FORMAT, version: VERSION, rig: RIG_ID,
    meta: { id: newId('proj'), name, createdAt: now, updatedAt: now, app: `${APP_NAME} ${APP_VERSION}` },
    shape: clone(DEFAULT_SHAPE),
    appearance: defaultAppearance(),
    pose: restPose(),
    animations,
    locomotion: defaultLocomotion(animations),
  };
}

/**
 * Validate an untrusted project document.
 * Returns { project, errors, warnings }. errors = the file cannot be used.
 */
export function cleanProject(src) {
  const errors = [], warnings = [];
  const warn = (path, message) => warnings.push({ path, message });
  if (!isObj(src)) return { project: null, errors: [{ path: '', message: 'الملف ليس مشروع Cylio (المحتوى ليس كائن JSON).' }], warnings };
  if (src.format !== FORMAT) {
    const msg = src.format === ANIM_FORMAT ? 'هذا ملف حركة وليس مشروعاً. استورده من قسم «التحريك».' : 'الملف ليس مشروع Cylio (format غير صحيح).';
    return { project: null, errors: [{ path: 'format', message: msg }], warnings };
  }
  const major = String(src.version || '').split('.')[0];
  if (major !== VERSION.split('.')[0]) return { project: null, errors: [{ path: 'version', message: `إصدار الملف ${src.version} غير مدعوم (المدعوم ${VERSION}).` }], warnings };
  if (src.rig !== undefined && src.rig !== RIG_ID) warn('rig', `unknown rig "${src.rig}", read as ${RIG_ID}`);
  const m = isObj(src.meta) ? src.meta : {};
  const now = new Date().toISOString();
  const project = {
    format: FORMAT, version: VERSION, rig: RIG_ID,
    meta: {
      id: typeof m.id === 'string' && /^[\w-]{1,64}$/.test(m.id) ? m.id : newId('proj'),
      name: typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 60) : 'شخصية',
      createdAt: typeof m.createdAt === 'string' ? m.createdAt.slice(0, 40) : now,
      updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt.slice(0, 40) : now,
      app: `${APP_NAME} ${APP_VERSION}`,
    },
    shape: cleanShape(src.shape, warn),
    appearance: cleanAppearance(src.appearance, warn),
    pose: cleanPose(src.pose, warn),
    animations: [],
    locomotion: {},
  };
  const list = Array.isArray(src.animations) ? src.animations.slice(0, LIMITS.clips) : [];
  if (src.animations !== undefined && !Array.isArray(src.animations)) warn('animations', 'must be a list');
  const seen = new Set();
  list.forEach((a, i) => {
    const c = cleanClip(a, warn, `animations[${i}]`);
    if (seen.has(c.id)) c.id = newId('anim');
    seen.add(c.id);
    project.animations.push(c);
  });
  const L = isObj(src.locomotion) ? src.locomotion : {};
  for (const r of LOCOMOTION_ROLES) {
    const id = L[r];
    project.locomotion[r] = typeof id === 'string' && seen.has(id) ? id : null;
    if (id !== undefined && id !== null && !seen.has(id)) warn(`locomotion.${r}`, 'refers to a missing animation');
  }
  return { project, errors, warnings };
}

/* ------------------------------------------------------------------ animation files */
export function animationFile(clip) {
  return { format: ANIM_FORMAT, version: VERSION, rig: RIG_ID, animation: clone(clip) };
}
export function readAnimationFile(src) {
  const warnings = [], warn = (path, message) => warnings.push({ path, message });
  if (!isObj(src) || src.format !== ANIM_FORMAT) return { clip: null, errors: [{ path: 'format', message: src && src.format === FORMAT ? 'هذا ملف مشروع. افتحه من قائمة المشروع.' : 'الملف ليس حركة Cylio.' }], warnings };
  if (String(src.version || '').split('.')[0] !== VERSION.split('.')[0]) return { clip: null, errors: [{ path: 'version', message: `إصدار الملف ${src.version} غير مدعوم.` }], warnings };
  const clip = cleanClip(src.animation, warn);
  clip.id = newId('anim');
  delete clip.role;
  return { clip, errors: [], warnings };
}

/** Parse JSON text; friendly message with line/column on failure. */
export function parseJson(text) {
  if (typeof text !== 'string' || !text.trim()) return { value: null, error: 'الملف فارغ.' };
  try { return { value: JSON.parse(text.replace(/^﻿/, '')), error: null }; } catch (e) {
    const m = /position (\d+)/.exec(e.message || '');
    if (m) { const pos = +m[1], before = text.slice(0, pos); return { value: null, error: `ليس JSON صالحاً (السطر ${before.split('\n').length}).` }; }
    return { value: null, error: 'ليس JSON صالحاً.' };
  }
}

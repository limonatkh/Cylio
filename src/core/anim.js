/* =====================================================================
 * ANIMATION — keyframe clips, sampling, blending, gait maths.
 *
 * clip = {
 *   id, name, duration (s), loop (bool), fps (key snapping, 30),
 *   moveSpeed: null | m/s    speed at which the feet do not slide (null = measured from the legs)
 *   tracks: { jointId: [ { t, rot:[x,y,z]°, pos?:[x,y,z] m (root only), ease } ] }
 * }
 * A key's `ease` shapes the way FROM that key to the next one.
 * Euler components are interpolated directly (predictable for animators,
 * allows swings beyond 180°); clips are blended through quaternions.
 * Everything is driven by time in seconds, never by frame counts, so a
 * clip plays the same at 30, 60 or 144 frames per second.
 * ===================================================================== */
import { DEG, clamp, isNum, isObj, round, clone } from './math.js';
import { JOINT_IDS, clampRot, clampPos, restPose } from './rig.js';

export const EASES = {
  linear: { label: 'خطي', fn: u => u },
  smooth: { label: 'ناعم', fn: u => u * u * (3 - 2 * u) },
  easeIn: { label: 'تسارع', fn: u => u * u },
  easeOut: { label: 'تباطؤ', fn: u => 1 - (1 - u) * (1 - u) },
  step: { label: 'ثابت', fn: () => 0 },
};
export const EASE_IDS = Object.keys(EASES);
export const LIMITS = { duration: [0.1, 30], fps: [12, 60], keysPerTrack: 400, clips: 60, name: 40 };

let idCounter = 0;
export const newId = (p = 'a') => `${p}_${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * refLeg: the leg length (m) the clip was authored for. Root positions
 * (bobbing, jump height) are scaled by currentLeg / refLeg when played,
 * so a clip keeps the feet on the floor when the legs get longer or shorter.
 */
export function emptyClip(name = 'حركة جديدة', o = {}) {
  return { id: o.id || newId('anim'), name, duration: o.duration ?? 1, loop: o.loop ?? true, fps: o.fps ?? 30, moveSpeed: o.moveSpeed ?? null, refLeg: o.refLeg ?? REF_LEG, tracks: {} };
}
export const REF_LEG = 0.48;

/* ------------------------------------------------------------------ validation */
export function cleanClip(src, warn = () => {}, path = 'animation') {
  const s = isObj(src) ? src : {};
  const out = emptyClip(typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, LIMITS.name) : 'حركة', { id: typeof s.id === 'string' && /^[\w-]{1,64}$/.test(s.id) ? s.id : undefined });
  const num = (k, [a, b], def) => {
    if (s[k] === undefined) return def;
    if (!isNum(s[k])) { warn(`${path}.${k}`, 'must be a number'); return def; }
    const c = clamp(s[k], a, b); if (c !== s[k]) warn(`${path}.${k}`, `clamped to ${c}`); return c;
  };
  out.duration = round(num('duration', LIMITS.duration, 1), 4);
  out.fps = Math.round(num('fps', LIMITS.fps, 30));
  out.loop = s.loop === undefined ? true : !!s.loop;
  out.refLeg = round(num('refLeg', [0.05, 3], REF_LEG), 4);
  out.moveSpeed = s.moveSpeed === null || s.moveSpeed === undefined ? null : (isNum(s.moveSpeed) && s.moveSpeed > 0 ? round(clamp(s.moveSpeed, 0.05, 30), 3) : (warn(`${path}.moveSpeed`, 'must be a positive number or null'), null));
  if (typeof s.role === 'string') out.role = s.role.slice(0, 20);
  const tracks = isObj(s.tracks) ? s.tracks : {};
  for (const [jid, keys] of Object.entries(tracks)) {
    if (!JOINT_IDS.includes(jid)) { warn(`${path}.tracks.${jid}`, 'unknown joint, ignored'); continue; }
    if (!Array.isArray(keys)) { warn(`${path}.tracks.${jid}`, 'must be a list of keys'); continue; }
    const list = [];
    for (const [i, k] of keys.slice(0, LIMITS.keysPerTrack).entries()) {
      if (!isObj(k) || !isNum(k.t)) { warn(`${path}.tracks.${jid}[${i}]`, 'needs a time "t"'); continue; }
      const key = { t: round(clamp(k.t, 0, out.duration), 4), rot: clampRot(jid, Array.isArray(k.rot) ? k.rot : [0, 0, 0]), ease: EASES[k.ease] ? k.ease : 'smooth' };
      if (k.ease !== undefined && !EASES[k.ease]) warn(`${path}.tracks.${jid}[${i}].ease`, `unknown ease, used "smooth"`);
      if (jid === 'root') key.pos = clampPos(Array.isArray(k.pos) ? k.pos : [0, 0, 0]);
      list.push(key);
    }
    sortTrack(list);
    if (list.length) out.tracks[jid] = list;
  }
  return out;
}

export function sortTrack(list) {
  list.sort((a, b) => a.t - b.t);
  // one key per time (the later one wins)
  for (let i = list.length - 1; i > 0; i--) if (Math.abs(list[i].t - list[i - 1].t) < 1e-4) list.splice(i - 1, 1);
  return list;
}

/* ------------------------------------------------------------------ sampling */
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];

/** Value of one track at time t (seconds). Returns { rot, pos? } or null for an empty track. */
export function sampleTrack(keys, t, duration, loop) {
  if (!keys || !keys.length) return null;
  if (keys.length === 1) return { rot: keys[0].rot.slice(), pos: keys[0].pos ? keys[0].pos.slice() : undefined };
  let a, b, u;
  const first = keys[0], last = keys[keys.length - 1];
  if (t <= first.t && !loop) { a = b = first; u = 0; }
  else if (t >= last.t || t < first.t) {
    if (!loop) { a = b = last; u = 0; }
    else {
      // wrap: last key → first key (+duration)
      const span = duration - last.t + first.t;
      const dt = t >= last.t ? t - last.t : t + duration - last.t;
      a = last; b = first; u = span > 1e-6 ? clamp(dt / span, 0, 1) : 0;
    }
  } else {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
    a = keys[i]; b = keys[i + 1];
    u = (t - a.t) / Math.max(1e-6, b.t - a.t);
  }
  const e = (EASES[a.ease] || EASES.smooth).fn(clamp(u, 0, 1));
  return { rot: lerp3(a.rot, b.rot, e), pos: a.pos && b.pos ? lerp3(a.pos, b.pos, e) : a.pos ? a.pos.slice() : undefined };
}

/** Scale factor for a clip's root positions on a character with this leg length. */
export const posScale = (clip, legLength) => (legLength && clip && clip.refLeg ? legLength / clip.refLeg : 1);

/** Pose of a clip at time t (seconds). Joints without keys stay at rest. Pass legLength to adapt root heights. */
export function sampleClip(clip, t, legLength) {
  const pose = restPose();
  if (!clip) return pose;
  const d = clip.duration;
  const tt = clip.loop ? ((t % d) + d) % d : clamp(t, 0, d);
  const k = posScale(clip, legLength);
  for (const id of JOINT_IDS) {
    const v = sampleTrack(clip.tracks[id], tt, d, clip.loop);
    if (!v) continue;
    pose[id].rot = v.rot;
    if (id === 'root' && v.pos) pose.root.pos = v.pos.map(x => x * k);
  }
  return pose;
}

/* ------------------------------------------------------------------ editing (mutate a draft clip) */
export function snapTime(clip, t) { const f = clip.fps || 30; return round(clamp(Math.round(t * f) / f, 0, clip.duration), 4); }

export function findKey(clip, jid, t) {
  const tr = clip.tracks[jid]; if (!tr) return -1;
  return tr.findIndex(k => Math.abs(k.t - t) < 0.5 / (clip.fps || 30));
}
/** Insert or replace a key. */
export function setKey(clip, jid, t, value, ease) {
  const tr = clip.tracks[jid] || (clip.tracks[jid] = []);
  const i = findKey(clip, jid, t);
  const key = { t: snapTime(clip, t), rot: clampRot(jid, value.rot || [0, 0, 0]), ease: ease || (i >= 0 ? tr[i].ease : 'smooth') };
  if (jid === 'root') key.pos = clampPos(value.pos || [0, 0, 0]);
  if (i >= 0) tr[i] = key; else tr.push(key);
  sortTrack(tr);
  return key;
}
export function removeKey(clip, jid, t) {
  const tr = clip.tracks[jid]; if (!tr) return false;
  const i = findKey(clip, jid, t); if (i < 0) return false;
  tr.splice(i, 1);
  if (!tr.length) delete clip.tracks[jid];
  return true;
}
/** Change a clip's length; keys past the end are pulled in (scale) or dropped (trim). */
export function setDuration(clip, d, mode = 'trim') {
  const nd = round(clamp(d, LIMITS.duration[0], LIMITS.duration[1]), 4);
  const k = nd / clip.duration;
  for (const jid of Object.keys(clip.tracks)) {
    let tr = clip.tracks[jid];
    if (mode === 'scale') tr.forEach(key => { key.t = round(key.t * k, 4); });
    else tr = tr.filter(key => key.t <= nd + 1e-6);
    clip.tracks[jid] = sortTrack(tr);
    if (!tr.length) delete clip.tracks[jid];
  }
  clip.duration = nd;
}
export function keyCount(clip) { return Object.values(clip.tracks).reduce((s, tr) => s + tr.length, 0); }
export function keyTimes(clip) { return [...new Set(Object.values(clip.tracks).flatMap(tr => tr.map(k => k.t)))].sort((a, b) => a - b); }

/* ------------------------------------------------------------------ quaternions */
export function eulerToQuat(rot) {
  // XYZ order, same as Three.js
  const x = rot[0] * DEG / 2, y = rot[1] * DEG / 2, z = rot[2] * DEG / 2;
  const c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z), s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}
export function quatToEuler(q) {
  const [x, y, z, w] = q;
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - z * w), m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - x * w), m32 = 2 * (y * z + x * w), m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(clamp(m13, -1, 1));
  let ex, ez;
  if (Math.abs(m13) < 0.9999999) { ex = Math.atan2(-m23, m33); ez = Math.atan2(-m12, m11); } else { ex = Math.atan2(m32, m22); ez = 0; }
  return [ex / DEG, ey / DEG, ez / DEG];
}

/**
 * Weighted blend of poses: [{ pose, w }]. Rotations are blended as quaternions
 * (sign-aligned weighted sum, normalised), positions linearly. Returns
 * { q: { jointId: [x,y,z,w] }, pos: [x,y,z] } — ready for the renderer.
 */
export function blendPoses(list) {
  const out = { q: {}, pos: [0, 0, 0] };
  let wsum = 0;
  for (const { w } of list) wsum += Math.max(0, w);
  if (wsum <= 1e-6) list = [{ pose: restPose(), w: 1 }], wsum = 1;
  for (const id of JOINT_IDS) {
    let acc = [0, 0, 0, 0], ref = null;
    for (const { pose, w } of list) {
      if (w <= 0) continue;
      const q = eulerToQuat(pose[id].rot);
      if (!ref) ref = q;
      const s = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? -1 : 1;
      for (let i = 0; i < 4; i++) acc[i] += q[i] * s * w;
    }
    const n = Math.hypot(...acc) || 1;
    out.q[id] = acc.map(v => v / n);
  }
  for (const { pose, w } of list) if (w > 0) for (let i = 0; i < 3; i++) out.pos[i] += pose.root.pos[i] * w / wsum;
  return out;
}
/** Single pose → renderer form. */
export const poseToQuats = pose => blendPoses([{ pose, w: 1 }]);

/* ------------------------------------------------------------------ gait */
/**
 * Largest forward/back swing of the legs in a clip (degrees), measured on
 * the samples, and the distance the body travels in one loop if the
 * planted foot does not slide: a rigid leg of length L swinging ±θ moves
 * its foot 2·L·sin θ per step, two steps per loop.
 */
export function gaitOf(clip, legLength) {
  if (!clip) return { swing: 0, stride: 0, speed: 0 };
  let swing = 0;
  const n = Math.max(24, Math.ceil(clip.duration * 60));
  for (let i = 0; i < n; i++) {
    const p = sampleClip(clip, (i / n) * clip.duration);
    swing = Math.max(swing, Math.abs(p.leftLeg.rot[0]), Math.abs(p.rightLeg.rot[0]));
  }
  // peak-to-peak / 2 is the real amplitude when the swing is not centred
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const p = sampleClip(clip, (i / n) * clip.duration); lo = Math.min(lo, p.leftLeg.rot[0]); hi = Math.max(hi, p.leftLeg.rot[0]); }
  const amp = Number.isFinite(lo) ? (hi - lo) / 2 : swing;
  const stride = 4 * legLength * Math.sin(Math.min(80, amp) * DEG);
  return { swing: round(amp, 2), stride: round(stride, 4), speed: clip.duration > 0 ? round(stride / clip.duration, 3) : 0 };
}
/** The speed (m/s) at which a locomotion clip's feet stay planted. */
export function clipSpeed(clip, legLength) {
  if (!clip) return 0;
  if (isNum(clip.moveSpeed)) return clip.moveSpeed;
  return gaitOf(clip, legLength).speed;
}

export function duplicateClip(clip, name) {
  const c = clone(clip);
  c.id = newId('anim');
  c.name = (name || `${clip.name} (نسخة)`).slice(0, LIMITS.name);
  delete c.builtin;
  return c;
}

/* =====================================================================
 * BUILT-IN ANIMATIONS — original R6-style motions for Cylio characters.
 * Written for the reference proportions (leg length 0.48 m); root heights
 * scale with the legs (refLeg), angles are proportion-independent.
 *
 * Walk / run legs use LINEAR keys between the two extremes: the leg turns
 * at a constant rate, so the planted foot moves backwards at an almost
 * constant speed — the speed the body is moved at in the test arena.
 * ===================================================================== */
import { emptyClip, sortTrack } from './anim.js';

const L = 0.48;                                // reference leg length
const drop = deg => Math.round(-L * (1 - Math.cos(deg * Math.PI / 180)) * 1e4) / 1e4;

function clip(name, role, o, tracks) {
  const c = emptyClip(name, { id: `builtin_${role}`, ...o });
  c.role = role;
  for (const [j, keys] of Object.entries(tracks)) {
    c.tracks[j] = sortTrack(keys.map(([t, rot, ease = 'smooth', pos]) => (j === 'root' ? { t, rot, ease, pos: pos || [0, 0, 0] } : { t, rot, ease })));
  }
  return c;
}

export function builtinClips() {
  const W = 30, R = 56;                        // leg swing, degrees
  return [
    clip('الوقوف', 'idle', { duration: 2.4, loop: true }, {
      torso: [[0, [0, 0, 0]], [1.2, [2.2, 0, 0]]],
      head: [[0, [0, 0, 0]], [1.2, [-1.5, 3, 0]]],
      leftArm: [[0, [0, 0, 2]], [1.2, [1.5, 0, 4.5]]],
      rightArm: [[0, [0, 0, -2]], [1.2, [1.5, 0, -4.5]]],
      root: [[0, [0, 0, 0], 'smooth', [0, 0, 0]], [1.2, [0, 0, 0], 'smooth', [0, -0.006, 0]]],
    }),
    clip('المشي', 'walk', { duration: 0.8, loop: true }, {
      leftLeg: [[0, [-W, 0, 0], 'linear'], [0.4, [W, 0, 0], 'linear']],
      rightLeg: [[0, [W, 0, 0], 'linear'], [0.4, [-W, 0, 0], 'linear']],
      leftArm: [[0, [26, 0, 3]], [0.4, [-26, 0, 3]]],
      rightArm: [[0, [-26, 0, -3]], [0.4, [26, 0, -3]]],
      torso: [[0, [2, 5, 0]], [0.4, [2, -5, 0]]],
      head: [[0, [0, -4, 0]], [0.4, [0, 4, 0]]],
      root: [[0, [0, 0, 0], 'easeOut', [0, drop(W), 0]], [0.2, [0, 0, 0], 'easeIn', [0, 0, 0]], [0.4, [0, 0, 0], 'easeOut', [0, drop(W), 0]], [0.6, [0, 0, 0], 'easeIn', [0, 0, 0]]],
    }),
    clip('الركض', 'run', { duration: 0.5, loop: true }, {
      leftLeg: [[0, [-R, 0, 0], 'linear'], [0.25, [R, 0, 0], 'linear']],
      rightLeg: [[0, [R, 0, 0], 'linear'], [0.25, [-R, 0, 0], 'linear']],
      leftArm: [[0, [62, 0, 6]], [0.25, [-66, 0, 6]]],
      rightArm: [[0, [-66, 0, -6]], [0.25, [62, 0, -6]]],
      torso: [[0, [9, 7, 0]], [0.25, [9, -7, 0]]],
      head: [[0, [-6, -5, 0]], [0.25, [-6, 5, 0]]],
      root: [[0, [0, 0, 0], 'easeOut', [0, -0.07, 0]], [0.125, [0, 0, 0], 'easeIn', [0, 0.03, 0]], [0.25, [0, 0, 0], 'easeOut', [0, -0.07, 0]], [0.375, [0, 0, 0], 'easeIn', [0, 0.03, 0]]],
    }),
    clip('القفز', 'jump', { duration: 0.36, loop: false }, {
      leftArm: [[0, [0, 0, 3]], [0.1, [24, 0, 6], 'easeOut'], [0.36, [-150, 0, 18]]],
      rightArm: [[0, [0, 0, -3]], [0.1, [24, 0, -6], 'easeOut'], [0.36, [-150, 0, -18]]],
      leftLeg: [[0, [0, 0, 0]], [0.1, [6, 0, 0]], [0.36, [-26, 0, 2]]],
      rightLeg: [[0, [0, 0, 0]], [0.1, [6, 0, 0]], [0.36, [12, 0, -2]]],
      torso: [[0, [0, 0, 0]], [0.1, [8, 0, 0]], [0.36, [-4, 0, 0]]],
      head: [[0, [0, 0, 0]], [0.36, [-8, 0, 0]]],
      root: [[0, [0, 0, 0], 'easeOut', [0, 0, 0]], [0.1, [0, 0, 0], 'easeIn', [0, -0.05, 0]], [0.36, [0, 0, 0], 'smooth', [0, 0, 0]]],
    }),
    clip('السقوط', 'fall', { duration: 0.8, loop: true }, {
      leftArm: [[0, [-160, 0, 30]], [0.4, [-150, 0, 42]]],
      rightArm: [[0, [-150, 0, -42]], [0.4, [-160, 0, -30]]],
      leftLeg: [[0, [-18, 0, 4]], [0.4, [-6, 0, 8]]],
      rightLeg: [[0, [8, 0, -8]], [0.4, [-4, 0, -4]]],
      torso: [[0, [-4, 0, 0]], [0.4, [-6, 0, 0]]],
      head: [[0, [-10, 0, 0]], [0.4, [-6, 0, 0]]],
    }),
    clip('الهبوط', 'land', { duration: 0.34, loop: false }, {
      leftArm: [[0, [-120, 0, 30]], [0.1, [-20, 0, 18], 'easeOut'], [0.34, [0, 0, 3]]],
      rightArm: [[0, [-120, 0, -30]], [0.1, [-20, 0, -18], 'easeOut'], [0.34, [0, 0, -3]]],
      leftLeg: [[0, [-12, 0, 6]], [0.1, [0, 0, 8]], [0.34, [0, 0, 0]]],
      rightLeg: [[0, [6, 0, -6]], [0.1, [0, 0, -8]], [0.34, [0, 0, 0]]],
      torso: [[0, [0, 0, 0]], [0.1, [14, 0, 0], 'easeOut'], [0.34, [0, 0, 0]]],
      root: [[0, [0, 0, 0], 'easeOut', [0, -0.02, 0]], [0.1, [0, 0, 0], 'smooth', [0, -0.06, 0]], [0.34, [0, 0, 0], 'smooth', [0, 0, 0]]],
    }),
    clip('التلويح', 'wave', { duration: 1.2, loop: true }, {
      rightArm: [[0, [-8, 0, -142]], [0.3, [-8, 0, -160]], [0.6, [-8, 0, -142]], [0.9, [-8, 0, -160]]],
      leftArm: [[0, [0, 0, 3]]],
      head: [[0, [0, -10, -6]], [0.6, [-3, -14, -8]]],
      torso: [[0, [0, -4, -2]], [0.6, [0, -6, -3]]],
    }),
  ];
}

export const LOCOMOTION_ROLES = ['idle', 'walk', 'run', 'jump', 'fall', 'land'];
export const ROLE_LABELS = { idle: 'الوقوف', walk: 'المشي', run: 'الركض', jump: 'القفز', fall: 'السقوط', land: 'الهبوط' };

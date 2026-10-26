/* =====================================================================
 * RIG — the Cylio R6 joint hierarchy.
 *
 *   root ─ torso ─┬─ head
 *                 ├─ leftArm   rightArm
 *                 └─ leftLeg   rightLeg
 *
 * root   : the whole character (position + rotation, on the floor)
 * torso  : turns about the hip line (lean, twist); everything rides on it
 * limbs  : rigid, turn about a pivot one limb-radius inside their top end
 * head   : turns about the neck (top centre of the torso)
 *
 * Rotations are Euler XYZ in DEGREES. Facing +Z, left side +X:
 *   limbs  : x < 0 swings forward, left arm z > 0 / right arm z < 0 raises sideways
 *   torso / head : x > 0 leans / nods forward, y turns left
 * ===================================================================== */
import { clamp, isNum, isObj, round } from './math.js';

export const RIG_ID = 'cylio-r6';
export const JOINT_IDS = ['root', 'torso', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

export const JOINT_INFO = {
  root: { parent: null, label: 'الجذر', hint: 'الشخصية كاملة', pos: true },
  torso: { parent: 'root', label: 'الجذع', hint: 'الورك' },
  head: { parent: 'torso', label: 'الرأس', hint: 'الرقبة' },
  leftArm: { parent: 'torso', label: 'الذراع اليسرى', hint: 'الكتف', mirror: 'rightArm' },
  rightArm: { parent: 'torso', label: 'الذراع اليمنى', hint: 'الكتف', mirror: 'leftArm' },
  leftLeg: { parent: 'torso', label: 'الرجل اليسرى', hint: 'الورك', mirror: 'rightLeg' },
  rightLeg: { parent: 'torso', label: 'الرجل اليمنى', hint: 'الورك', mirror: 'leftLeg' },
};

/** Rotation limits [min, max] per axis, degrees. They keep limbs out of the body and away from impossible angles. */
export const ROT_LIMITS = {
  root: [[-90, 90], [-180, 180], [-90, 90]],
  torso: [[-35, 50], [-70, 70], [-30, 30]],
  head: [[-45, 45], [-85, 85], [-35, 35]],
  leftArm: [[-185, 75], [-90, 90], [-12, 180]],
  rightArm: [[-185, 75], [-90, 90], [-180, 12]],
  leftLeg: [[-110, 70], [-45, 45], [-18, 60]],
  rightLeg: [[-110, 70], [-45, 45], [-60, 18]],
};
/** Root offset limits, metres. */
export const POS_LIMITS = [[-3, 3], [-0.6, 3], [-3, 3]];

export const isLimb = id => id === 'leftArm' || id === 'rightArm' || id === 'leftLeg' || id === 'rightLeg';

export function clampRot(id, rot) {
  const L = ROT_LIMITS[id];
  return [0, 1, 2].map(i => round(clamp(isNum(rot[i]) ? rot[i] : 0, L[i][0], L[i][1]), 2));
}
export function clampPos(pos) {
  return [0, 1, 2].map(i => round(clamp(isNum(pos[i]) ? pos[i] : 0, POS_LIMITS[i][0], POS_LIMITS[i][1]), 4));
}

/** Mirror a rotation from one side to the other (reflection across the YZ plane). */
export const mirrorRot = rot => [rot[0], -rot[1] || 0, -rot[2] || 0];

/* ------------------------------------------------------------------ poses
 * pose = { root: { rot:[x,y,z], pos:[x,y,z] }, torso: { rot }, ... }         */
export function restPose() {
  const p = {};
  for (const id of JOINT_IDS) p[id] = id === 'root' ? { rot: [0, 0, 0], pos: [0, 0, 0] } : { rot: [0, 0, 0] };
  return p;
}

export function cleanPose(src, warn = () => {}, path = 'pose') {
  const s = isObj(src) ? src : {};
  const out = restPose();
  for (const id of JOINT_IDS) {
    const j = s[id];
    if (j === undefined) continue;
    if (!isObj(j)) { warn(`${path}.${id}`, 'must be an object'); continue; }
    if (Array.isArray(j.rot) && j.rot.length === 3) {
      const c = clampRot(id, j.rot);
      if (c.some((v, i) => v !== round(j.rot[i], 2))) warn(`${path}.${id}.rot`, 'clamped to the joint limits');
      out[id].rot = c;
    } else if (j.rot !== undefined) warn(`${path}.${id}.rot`, 'must be [x, y, z] degrees');
    if (id === 'root' && j.pos !== undefined) {
      if (Array.isArray(j.pos) && j.pos.length === 3) out.root.pos = clampPos(j.pos);
      else warn(`${path}.root.pos`, 'must be [x, y, z] metres');
    }
  }
  return out;
}

/** Built-in pose presets (rest = arms down, R6 style). */
export const POSE_PRESETS = {
  rest: { label: 'الوقوف', pose: {} },
  tpose: { label: 'وضعية T', pose: { leftArm: { rot: [0, 0, 90] }, rightArm: { rot: [0, 0, -90] } } },
  apose: { label: 'وضعية A', pose: { leftArm: { rot: [0, 0, 40] }, rightArm: { rot: [0, 0, -40] } } },
  wave: { label: 'تحية', pose: { rightArm: { rot: [0, 0, -150] }, head: { rot: [0, -12, -6] } } },
  step: { label: 'خطوة', pose: { leftLeg: { rot: [-28, 0, 0] }, rightLeg: { rot: [24, 0, 0] }, leftArm: { rot: [22, 0, 4] }, rightArm: { rot: [-24, 0, -4] } } },
  sit: { label: 'جلوس', pose: { root: { pos: [0, -0.5, 0] }, leftLeg: { rot: [-90, 0, 0] }, rightLeg: { rot: [-90, 0, 0] }, leftArm: { rot: [-20, 0, 4] }, rightArm: { rot: [-20, 0, -4] } } },
};
export function presetPose(id) { return cleanPose((POSE_PRESETS[id] || POSE_PRESETS.rest).pose); }

/* =====================================================================
 * CHARACTER SHAPE — six rounded cylinders and how they are assembled.
 *
 * Units: metres. +Y up, the character faces +Z, its LEFT side is +X.
 * Every part is a cylinder standing on its axis (arms and legs hang down
 * in the rest pose), with an elliptical cross-section (width × depth),
 * a height and an edge rounding (0 = sharp rim, 1 = fully round end).
 *
 * layout(character) turns the shape into joint positions (pivots) and
 * mesh offsets. Pivots are always derived from the dimensions, so
 * animations stay valid whatever the proportions (see docs).
 * ===================================================================== */
import { clamp, isNum, isObj, round } from './math.js';

export const PART_IDS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

/** Display info. `mirror` = the opposite part, `side` = +1 left (+X) / −1 right. */
export const PART_INFO = {
  head: { label: 'الرأس', icon: 'head', joint: 'head', side: 0 },
  torso: { label: 'الجذع', icon: 'torso', joint: 'torso', side: 0 },
  leftArm: { label: 'الذراع اليسرى', icon: 'armL', joint: 'leftArm', side: 1, mirror: 'rightArm' },
  rightArm: { label: 'الذراع اليمنى', icon: 'armR', joint: 'rightArm', side: -1, mirror: 'leftArm' },
  leftLeg: { label: 'الرجل اليسرى', icon: 'legL', joint: 'leftLeg', side: 1, mirror: 'rightLeg' },
  rightLeg: { label: 'الرجل اليمنى', icon: 'legR', joint: 'rightLeg', side: -1, mirror: 'leftLeg' },
};

/** Safe ranges (metres; round is a fraction). */
export const SHAPE_LIMITS = {
  head: { w: [0.2, 0.8], d: [0.2, 0.8], h: [0.2, 0.8], round: [0, 1] },
  torso: { w: [0.3, 1.1], d: [0.15, 0.9], h: [0.3, 1.2], round: [0, 1] },
  leftArm: { w: [0.08, 0.45], d: [0.08, 0.45], h: [0.25, 1.2], round: [0, 1] },
  rightArm: { w: [0.08, 0.45], d: [0.08, 0.45], h: [0.25, 1.2], round: [0, 1] },
  leftLeg: { w: [0.08, 0.5], d: [0.08, 0.5], h: [0.25, 1.3], round: [0, 1] },
  rightLeg: { w: [0.08, 0.5], d: [0.08, 0.5], h: [0.25, 1.3], round: [0, 1] },
};
export const LAYOUT_LIMITS = {
  neckGap: [0, 0.2],        // space between torso top and head
  shoulderGap: [0, 0.15],   // space between torso side and arm
  shoulderDrop: [-0.1, 0.4],// arm top below the torso top (− = above)
  hipGap: [0, 0.15],        // space between torso bottom and legs
  legSpread: [0, 0.5],      // space between the two legs
};

/** The reference proportions (measured from the reference images, scaled to 1.8 m). */
export const DEFAULT_SHAPE = {
  parts: {
    head: { w: 0.43, d: 0.43, h: 0.44, round: 0.32 },
    torso: { w: 0.69, d: 0.4, h: 0.74, round: 0.12 },
    leftArm: { w: 0.32, d: 0.32, h: 0.66, round: 0.3 },
    rightArm: { w: 0.32, d: 0.32, h: 0.66, round: 0.3 },
    leftLeg: { w: 0.32, d: 0.32, h: 0.64, round: 0.3 },
    rightLeg: { w: 0.32, d: 0.32, h: 0.64, round: 0.3 },
  },
  layout: { neckGap: 0.005, shoulderGap: 0.006, shoulderDrop: 0, hipGap: 0.006, legSpread: 0.036 },
};

/** Fill and clamp a shape (never throws). Reports what had to be fixed through warn(path, msg). */
export function cleanShape(src, warn = () => {}) {
  const s = isObj(src) ? src : {};
  const parts = isObj(s.parts) ? s.parts : {};
  const out = { parts: {}, layout: {} };
  for (const id of PART_IDS) {
    const p = isObj(parts[id]) ? parts[id] : {};
    out.parts[id] = {};
    for (const k of ['w', 'd', 'h', 'round']) {
      const [a, b] = SHAPE_LIMITS[id][k], def = DEFAULT_SHAPE.parts[id][k];
      let v = p[k];
      if (v === undefined) v = def;
      else if (!isNum(v)) { warn(`shape.parts.${id}.${k}`, 'must be a number'); v = def; }
      const c = clamp(v, a, b);
      if (c !== v) warn(`shape.parts.${id}.${k}`, `clamped to ${c}`);
      out.parts[id][k] = round(c, 4);
    }
  }
  const L = isObj(s.layout) ? s.layout : {};
  for (const [k, [a, b]] of Object.entries(LAYOUT_LIMITS)) {
    let v = L[k];
    if (v === undefined) v = DEFAULT_SHAPE.layout[k];
    else if (!isNum(v)) { warn(`shape.layout.${k}`, 'must be a number'); v = DEFAULT_SHAPE.layout[k]; }
    const c = clamp(v, a, b);
    if (c !== v) warn(`shape.layout.${k}`, `clamped to ${c}`);
    out.layout[k] = round(c, 4);
  }
  return out;
}

/** Edge rounding radius in metres (limited by the smaller radius and half the height). */
export function roundRadius(p) {
  return p.round * Math.min(p.w / 2, p.d / 2, p.h / 2);
}

/**
 * Joint positions and part placement for the rest pose.
 * Returns {
 *   joints: { root, torso, head, leftArm, rightArm, leftLeg, rightLeg }   absolute pivot positions
 *   parts:  { id: { pivot, center, bottom, top, rx, rz, h, rr } }        center = mesh centre (absolute)
 *   legLength                                                            hip pivot → sole (for gait maths)
 *   height
 * }
 * Pivots: limbs turn about the centre of a sphere of the limb's radius
 * placed in their top end; the head turns about the top centre of the torso;
 * the torso about its bottom centre (the hips line); the root sits on the floor.
 */
export function layout(shape) {
  const P = shape.parts, Lo = shape.layout;
  const legH = Math.max(P.leftLeg.h, P.rightLeg.h);
  const legTop = legH;
  const torsoBottom = legTop + Lo.hipGap;
  const torsoTop = torsoBottom + P.torso.h;
  const out = { joints: { root: [0, 0, 0] }, parts: {} };
  const put = (id, pivot, top) => {
    const p = P[id];
    const bottom = top - p.h;
    out.parts[id] = { pivot, top, bottom, center: [pivot[0], (top + bottom) / 2, pivot[2]], rx: p.w / 2, rz: p.d / 2, h: p.h, rr: roundRadius(p) };
    out.joints[id] = pivot;
  };
  // torso: pivot on the hips line
  put('torso', [0, torsoBottom, 0], torsoTop);
  // head: pivot at the neck (torso top), the head stands above it
  const headBottom = torsoTop + Lo.neckGap;
  out.parts.head = {
    pivot: [0, torsoTop, 0], bottom: headBottom, top: headBottom + P.head.h, center: [0, headBottom + P.head.h / 2, 0],
    rx: P.head.w / 2, rz: P.head.d / 2, h: P.head.h, rr: roundRadius(P.head),
  };
  out.joints.head = [0, torsoTop, 0];
  // arms hang beside the torso; the pivot is one arm radius below the arm top
  for (const id of ['leftArm', 'rightArm']) {
    const p = P[id], s = PART_INFO[id].side, r = Math.min(p.w, p.d) / 2;
    const top = torsoTop - Lo.shoulderDrop;
    const x = s * (P.torso.w / 2 + Lo.shoulderGap + p.w / 2);
    put(id, [x, top - Math.min(r, p.h / 2), 0], top);
  }
  // legs stand under the torso; the pivot is one leg radius below the leg top
  for (const id of ['leftLeg', 'rightLeg']) {
    const p = P[id], s = PART_INFO[id].side, r = Math.min(p.w, p.d) / 2;
    const x = s * (Lo.legSpread / 2 + p.w / 2);
    // a shorter leg still reaches the floor: its top is lower and the gap is filled by the hip gap
    const top = p.h;
    put(id, [x, top - Math.min(r, p.h / 2), 0], top);
  }
  out.legLength = Math.min(...['leftLeg', 'rightLeg'].map(id => out.parts[id].pivot[1]));
  out.height = out.parts.head.top;
  return out;
}

/** Heights a part's rounded silhouette uses (for UI hints). */
export function partSize(shape, id) {
  const p = shape.parts[id];
  return { w: p.w, d: p.d, h: p.h };
}

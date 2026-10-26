/* =====================================================================
 * APPEARANCE — colours, materials and the face.
 * Every part has its own { color, material, roughness?, metalness?, scale? };
 * the face (eyes + mouth) is real geometry on the head's front.
 * ===================================================================== */
import { clamp, isNum, isObj, round } from './math.js';
import { PART_IDS } from './character.js';

export const HEX = /^#[0-9A-F]{6}$/;
export function normHex(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{3}$/.test(s)) s = s.split('').map(c => c + c).join('');
  return /^[0-9A-F]{6}$/.test(s) ? '#' + s : null;
}

/** Material presets. Only what the renderer really does. */
export const MATERIALS = {
  matte: { label: 'مطفي', roughness: 0.85, metalness: 0 },
  satin: { label: 'ساتان', roughness: 0.55, metalness: 0 },
  gloss: { label: 'لامع', roughness: 0.22, metalness: 0 },
  metal: { label: 'معدني', roughness: 0.32, metalness: 1 },
  galaxy: { label: 'مجرّة', roughness: 0.6, metalness: 0, texture: 'galaxy' },
};
export const MATERIAL_IDS = Object.keys(MATERIALS);

export const MOUTHS = { smile: 'ابتسامة', grin: 'ابتسامة عريضة', flat: 'مستقيم', none: 'بدون' };

export const FACE_LIMITS = {
  eyeSize: [0.06, 0.3], eyeSpacing: [0.15, 0.7], eyeHeight: [0.3, 0.85], glow: [0, 1],
  mouthWidth: [0.08, 0.6], mouthHeight: [0.1, 0.6], mouthCurve: [-1, 1], mouthThickness: [0.004, 0.03],
};

export const DEFAULT_COLOR = '#1D5E66';
export function defaultAppearance() {
  const parts = {};
  for (const id of PART_IDS) parts[id] = { color: DEFAULT_COLOR, material: 'satin' };
  return {
    parts,
    face: {
      visible: true,
      eyeColor: '#FFFFFF', eyeSize: 0.15, eyeSpacing: 0.36, eyeHeight: 0.6, glow: 0.8,
      mouth: 'smile', mouthColor: '#101214', mouthWidth: 0.22, mouthHeight: 0.36, mouthCurve: 0.5, mouthThickness: 0.009,
    },
  };
}

export function cleanAppearance(src, warn = () => {}) {
  const s = isObj(src) ? src : {};
  const out = defaultAppearance();
  const P = isObj(s.parts) ? s.parts : {};
  for (const id of PART_IDS) {
    const p = P[id];
    if (p === undefined) continue;
    if (!isObj(p)) { warn(`appearance.parts.${id}`, 'must be an object'); continue; }
    const o = out.parts[id];
    if (p.color !== undefined) { const c = normHex(p.color); if (c) o.color = c; else warn(`appearance.parts.${id}.color`, 'must be #RRGGBB'); }
    if (p.material !== undefined) { if (MATERIALS[p.material]) o.material = p.material; else warn(`appearance.parts.${id}.material`, `unknown material, use one of ${MATERIAL_IDS.join(', ')}`); }
    for (const [k, a, b] of [['roughness', 0, 1], ['metalness', 0, 1], ['scale', 0.25, 4]]) {
      if (p[k] === undefined) continue;
      if (!isNum(p[k])) { warn(`appearance.parts.${id}.${k}`, 'must be a number'); continue; }
      o[k] = round(clamp(p[k], a, b), 3);
    }
  }
  const F = isObj(s.face) ? s.face : {};
  const f = out.face;
  if (F.visible !== undefined) f.visible = !!F.visible;
  for (const k of ['eyeColor', 'mouthColor']) if (F[k] !== undefined) { const c = normHex(F[k]); if (c) f[k] = c; else warn(`appearance.face.${k}`, 'must be #RRGGBB'); }
  if (F.mouth !== undefined) { if (MOUTHS[F.mouth]) f.mouth = F.mouth; else warn('appearance.face.mouth', `use one of ${Object.keys(MOUTHS).join(', ')}`); }
  for (const [k, [a, b]] of Object.entries(FACE_LIMITS)) {
    if (F[k] === undefined) continue;
    if (!isNum(F[k])) { warn(`appearance.face.${k}`, 'must be a number'); continue; }
    const c = clamp(F[k], a, b); if (c !== F[k]) warn(`appearance.face.${k}`, `clamped to ${c}`);
    f[k] = round(c, 4);
  }
  return out;
}

/** Effective PBR values of a part. */
export function partMaterial(p) {
  const m = MATERIALS[p.material] || MATERIALS.satin;
  return { roughness: p.roughness ?? m.roughness, metalness: p.metalness ?? m.metalness, texture: m.texture || null, scale: p.scale ?? 1 };
}

/** Swatches offered in the colour field (the recent colours come from the user). */
export const SWATCHES = ['#1D5E66', '#2E7D9A', '#3A5BA0', '#5B3E96', '#9C3B6B', '#C2453A', '#E07B2E', '#E9B73F', '#7FA650', '#3F8F5E', '#F2EEE6', '#B8B4AC', '#6E6B66', '#3A3A3C', '#1B1B1D', '#E8C39E', '#C68F64', '#8A5A3C'];

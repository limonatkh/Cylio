/* =====================================================================
 * Materials and procedural textures (no image files).
 *  galaxy : nebula clouds + stars painted on a canvas, tinted by the part colour
 *  halo   : soft radial sprite for glowing eyes
 * Textures are cached per colour and shared by every part using them.
 * ===================================================================== */
import * as THREE from 'three';
import { rng } from '../core/math.js';
import { partMaterial } from '../core/appearance.js';

const texCache = new Map();

function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/** Value noise on a wrapping grid (tileable horizontally so the cylinder seam is invisible). */
function makeNoise(r, gw, gh) {
  const g = Array.from({ length: gw * gh }, () => r());
  const at = (x, y) => g[((y % gh) + gh) % gh * gw + ((x % gw) + gw) % gw];
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

export function galaxyTexture(hex, size = 512) {
  const key = 'galaxy:' + hex + ':' + size;
  if (texCache.has(key)) return texCache.get(key);
  const W = size, H = size / 2;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const r = rng(7);
  const n1 = makeNoise(r, 8, 4), n2 = makeNoise(r, 16, 8), n3 = makeNoise(r, 32, 16);
  const base = hexRgb(hex);
  const blue = [52, 92, 210], violet = [120, 64, 190], deep = [8, 14, 40];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const f = 0.55 * n1(u * 8, v * 4) + 0.3 * n2(u * 16, v * 8) + 0.15 * n3(u * 32, v * 16);
    const cloud = Math.max(0, (f - 0.42) / 0.58);
    const hue = n2(u * 16 + 3.1, v * 8 + 1.7);
    const neb = [blue[0] + (violet[0] - blue[0]) * hue, blue[1] + (violet[1] - blue[1]) * hue, blue[2] + (violet[2] - blue[2]) * hue];
    const dark = 0.55 + 0.45 * (1 - cloud);
    const i = (y * W + x) * 4;
    for (let k = 0; k < 3; k++) {
      const b0 = base[k] * dark + deep[k] * (1 - dark) * 0.4;
      img.data[i + k] = Math.min(255, b0 * (1 - cloud * 0.75) + neb[k] * cloud * 0.95);
    }
    img.data[i + 3] = 255;
  }
  // stars: many small, a few bright with a soft core
  for (let s = 0; s < W * H / 90; s++) {
    const x = (r() * W) | 0, y = (r() * H) | 0, b = r();
    const i = (y * W + x) * 4, v = b > 0.97 ? 255 : 150 + b * 105;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    if (b > 0.985) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = (x + dx + W) % W, yy = Math.min(H - 1, Math.max(0, y + dy)), j = (yy * W + xx) * 4;
      for (let k = 0; k < 3; k++) img.data[j + k] = Math.min(255, img.data[j + k] + 90);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

export function haloTexture() {
  if (texCache.has('halo')) return texCache.get('halo');
  const S = 128;
  const cv = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.3, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set('halo', tex);
  return tex;
}

/** MeshStandardMaterial for a part's appearance. */
export function partMat(app, existing) {
  const m = existing || new THREE.MeshStandardMaterial();
  const pm = partMaterial(app);
  m.roughness = pm.roughness; m.metalness = pm.metalness;
  if (pm.texture === 'galaxy') {
    const key = 'galaxy-scaled:' + app.color + ':' + pm.scale;
    let t = texCache.get(key);
    if (!t) { t = galaxyTexture(app.color).clone(); t.repeat.set(pm.scale, pm.scale); t.needsUpdate = true; texCache.set(key, t); }
    m.map = t;
    m.color.set('#ffffff');
  } else { m.map = null; m.color.set(app.color); }
  m.needsUpdate = true;
  return m;
}

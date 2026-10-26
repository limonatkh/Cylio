/* =====================================================================
 * Small math helpers shared by the core (no Three.js, runs in Node).
 * Angles in the data are DEGREES; the helpers below that take radians say so.
 * ===================================================================== */

export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const round = (v, d = 3) => { const k = 10 ** d; return Math.round(v * k) / k; };
export const isNum = v => typeof v === 'number' && Number.isFinite(v);
export const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const clone = v => JSON.parse(JSON.stringify(v));

/**
 * Frame-rate independent smoothing: the fraction to move toward a target in
 * `dt` seconds so that 63 % of the distance is covered in `tau` seconds,
 * whatever the frame rate.
 */
export const dampFactor = (dt, tau) => (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau));
export const damp = (cur, target, dt, tau) => cur + (target - cur) * dampFactor(dt, tau);

/** Small deterministic RNG (mulberry32), for procedural textures and tests. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ 3×3 rotations
 * Euler order XYZ (intrinsic, same as Three.js 'XYZ'): R = Rx · Ry · Rz.
 * Matrices are row-major arrays of 9 numbers.                                     */
export function eulerToMat(xDeg, yDeg, zDeg) {
  const a = xDeg * DEG, b = yDeg * DEG, c = zDeg * DEG;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // Three.js Matrix4.makeRotationFromEuler, order XYZ
  return [
    cb * cc, -cb * sc, sb,
    ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb,
    sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb,
  ];
}
export function matMul(A, B) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return r;
}
export const matVec = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
export const matT = M => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len3 = a => Math.hypot(a[0], a[1], a[2]);

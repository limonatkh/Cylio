/* =====================================================================
 * Rounded elliptical cylinder geometry (the six Cylio parts).
 * Built ring by ring from a profile (radius ρ ∈ [0,1], height y), then
 * scaled to the ellipse rx × rz. Normals are computed analytically for
 * the scaled surface (no faceting, no seam), UVs wrap once around (u) and
 * run along the profile (v) — good for the galaxy texture.
 * ===================================================================== */
import * as THREE from 'three';

/**
 * @param rx, rz  half width / half depth (m)
 * @param h       height (m), centred on y = 0
 * @param rr      edge rounding radius (m), ≤ min(rx, rz, h/2)
 * @param o       { radial: segments around, arc: segments per rounded edge }
 */
export function roundedCylinder(rx, rz, h, rr, o = {}) {
  const radial = o.radial ?? 64, arc = rr > 1e-4 ? (o.arc ?? 8) : 0;
  const rmin = Math.min(rx, rz);
  const r = Math.min(rr, rmin, h / 2);
  const kr = r / rmin;                      // corner radius in normalised ρ
  const hh = h / 2;
  // profile from bottom centre to top centre: [ρ, y, nρ, ny]
  const prof = [];
  prof.push([0, -hh, 0, -1]);
  if (arc) {
    for (let i = 0; i <= arc; i++) {
      const a = -Math.PI / 2 + (i / arc) * (Math.PI / 2);
      prof.push([1 - kr + kr * Math.cos(a), -hh + r + r * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
    for (let i = 0; i <= arc; i++) {
      const a = (i / arc) * (Math.PI / 2);
      prof.push([1 - kr + kr * Math.cos(a), hh - r + r * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
  } else {
    prof.push([1, -hh, 0, -1], [1, -hh, 1, 0], [1, hh, 1, 0], [1, hh, 0, 1]);
  }
  prof.push([0, hh, 0, 1]);
  // arc length for v
  const vlen = [0];
  for (let i = 1; i < prof.length; i++) vlen.push(vlen[i - 1] + Math.hypot((prof[i][0] - prof[i - 1][0]) * rmin, prof[i][1] - prof[i - 1][1]));
  const total = vlen[vlen.length - 1] || 1;

  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < prof.length; i++) {
    const [rho, y, nr, ny] = prof[i];
    for (let j = 0; j <= radial; j++) {
      const phi = (j / radial) * Math.PI * 2;
      const s = Math.sin(phi), c = Math.cos(phi);
      // front of the character is +Z: phi = 0 → +Z, phi = 90° → +X
      pos.push(rx * rho * s, y, rz * rho * c);
      let nx = (nr * s) / rx, nz = (nr * c) / rz, nyy = ny;
      // keep the scale of nx/nz comparable to ny (radii in metres)
      nx *= rmin; nz *= rmin;
      const l = Math.hypot(nx, nyy, nz) || 1;
      nor.push(nx / l, nyy / l, nz / l);
      uv.push(j / radial, vlen[i] / total);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < prof.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      // outward winding; at a pole one of the two triangles is degenerate and skipped
      if (prof[i + 1][0] > 1e-6) idx.push(b, d, c);
      if (prof[i][0] > 1e-6) idx.push(a, b, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Point and normal on the side of an elliptical cylinder at horizontal offset x (front = +Z). */
export function frontSurface(rx, rz, x) {
  const s = Math.max(-0.999, Math.min(0.999, x / rx));
  const phi = Math.asin(s);
  const px = rx * Math.sin(phi), pz = rz * Math.cos(phi);
  const n = new THREE.Vector3(Math.sin(phi) / rx, 0, Math.cos(phi) / rz).normalize();
  return { p: new THREE.Vector3(px, 0, pz), n };
}

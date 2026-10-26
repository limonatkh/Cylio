/* =====================================================================
 * Character3D — the live Three.js character built from a project.
 *
 *   group (Cylio character)
 *    └ joint:root ─ joint:torso ─┬ joint:head  ─ part:head (+ face)
 *                                ├ joint:leftArm  ─ part:leftArm
 *                                ├ joint:rightArm ─ part:rightArm
 *                                ├ joint:leftLeg  ─ part:leftLeg
 *                                └ joint:rightLeg ─ part:rightLeg
 *       part:torso is a child of joint:torso
 *
 * Joint groups sit at the pivots computed by layout(), so rotating a
 * joint group turns the part about the right point. Each part mesh has
 * an outline mesh (inverted hull) used for hover and selection.
 * ===================================================================== */
import * as THREE from 'three';
import { layout, PART_IDS } from '../core/character.js';
import { JOINT_IDS, JOINT_INFO } from '../core/rig.js';
import { eulerToQuat } from '../core/anim.js';
import { roundedCylinder, frontSurface } from './geometry.js';
import { partMat, haloTexture } from './materials.js';

function outlineMaterial(color, width) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: true, opacity: 1, depthWrite: false });
  m.userData.width = { value: width };
  m.onBeforeCompile = sh => {
    sh.uniforms.outlineWidth = m.userData.width;
    sh.vertexShader = 'uniform float outlineWidth;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * outlineWidth;');
  };
  return m;
}

/** A disc of radius r centred at (cx, cy) wrapped onto the front of the head's elliptical side. */
function surfaceDisc(P, cx, cy, r, lift, uv) {
  const rings = 5, segs = 36, pos = [], nor = [], uvs = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const rr = (i / rings) * r;
    for (let j = 0; j < (i ? segs : 1); j++) {
      const a = (j / segs) * Math.PI * 2;
      const lx = rr * Math.cos(a), ly = rr * Math.sin(a);
      const { p, n } = frontSurface(P.rx, P.rz, cx + lx);
      pos.push(p.x + n.x * lift, cy + ly, p.z + n.z * lift); nor.push(n.x, 0, n.z);
      uvs.push(0.5 + lx / (2 * r), 0.5 + ly / (2 * r));
    }
  }
  const at = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * segs + (j % segs));
  for (let j = 0; j < segs; j++) idx.push(0, at(1, j), at(1, j + 1));
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) { const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j), d = at(i + 1, j + 1); idx.push(a, c, d, a, d, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

export class Character3D {
  /** o: { quality: 'high' | 'low', shadows: bool } */
  constructor(o = {}) {
    this.o = { radial: o.quality === 'low' ? 40 : 72, shadows: o.shadows !== false };
    this.group = new THREE.Group();
    this.group.name = 'CylioCharacter';
    this.joints = {}; this.parts = {}; this.outlines = {}; this.mats = {};
    for (const id of JOINT_IDS) { const g = new THREE.Group(); g.name = id; g.userData.joint = id; this.joints[id] = g; }
    for (const id of JOINT_IDS) { const p = JOINT_INFO[id].parent; (p ? this.joints[p] : this.group).add(this.joints[id]); }
    this.selectMat = outlineMaterial('#ff7a1a', 0.012);
    this.hoverMat = outlineMaterial('#ffffff', 0.008);
    this.hoverMat.opacity = 0.55;
    this.shape = null; this.app = null; this.layout = null;
    this.selected = null; this.hovered = null;
  }

  /** Rebuild geometry for a new shape (keeps the pose). */
  setShape(shape) {
    this.shape = shape;
    const L = this.layout = layout(shape);
    const pivots = L.joints;
    for (const id of JOINT_IDS) {
      const p = JOINT_INFO[id].parent, a = pivots[id], b = p ? pivots[p] : [0, 0, 0];
      this.joints[id].position.set(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    for (const id of PART_IDS) {
      const P = L.parts[id];
      const geo = roundedCylinder(P.rx, P.rz, P.h, P.rr, { radial: this.o.radial });
      let mesh = this.parts[id];
      if (!mesh) {
        mesh = new THREE.Mesh(geo, this.mats[id] || (this.mats[id] = new THREE.MeshStandardMaterial({ color: '#888' })));
        mesh.name = 'part_' + id; mesh.userData.part = id;
        mesh.castShadow = this.o.shadows; mesh.receiveShadow = false;
        this.joints[id].add(mesh);
        this.parts[id] = mesh;
        const ol = new THREE.Mesh(geo, this.selectMat);
        ol.visible = false; ol.renderOrder = -1; ol.userData.outline = true; ol.raycast = () => {};
        mesh.add(ol); this.outlines[id] = ol;
      } else {
        mesh.geometry.dispose();
        mesh.geometry = geo; this.outlines[id].geometry = geo;
      }
      const pv = pivots[id];
      mesh.position.set(P.center[0] - pv[0], P.center[1] - pv[1], P.center[2] - pv[2]);
    }
    if (this.app) this.buildFace();
    return L;
  }

  setAppearance(app) {
    this.app = app;
    for (const id of PART_IDS) this.mats[id] = partMat(app.parts[id], this.mats[id]);
    for (const id of PART_IDS) if (this.parts[id]) this.parts[id].material = this.mats[id];
    if (this.shape) this.buildFace();
  }

  buildFace() {
    const head = this.parts.head; if (!head) return;
    if (this.face) { head.remove(this.face); this.face.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== this._eyeMat) o.material.dispose?.(); }); }
    const F = this.app.face, P = this.layout.parts.head;
    const g = this.face = new THREE.Group(); g.name = 'face';
    head.add(g);
    if (!F.visible) return;
    const W = P.rx * 2, H = P.h;
    // eyes: discs on the front surface, with an optional soft halo
    const eyeMat = new THREE.MeshBasicMaterial({ color: F.eyeColor, toneMapped: false });
    const er = (F.eyeSize * W) / 2;
    const ey = (F.eyeHeight - 0.5) * H;
    for (const s of [-1, 1]) {
      const cx = s * (F.eyeSpacing * W) / 2;
      const eye = new THREE.Mesh(surfaceDisc(P, cx, ey, er, 0.0028), eyeMat);
      eye.name = s < 0 ? 'eye_right' : 'eye_left';
      eye.raycast = () => {};
      g.add(eye);
      if (F.glow > 0.01) {
        // soft emission bleeding onto the head around the eye (lies on the surface, no camera-facing sprite)
        const halo = new THREE.Mesh(surfaceDisc(P, cx, ey, er * (1.7 + 1.1 * F.glow), 0.0018, true), new THREE.MeshBasicMaterial({ map: haloTexture(), color: F.eyeColor, transparent: true, opacity: 0.55 * F.glow, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        halo.name = 'eye_glow'; halo.userData.editorOnly = true; halo.raycast = () => {};
        g.add(halo);
      }
    }
    // mouth: a tube along a curve on the surface
    if (F.mouth !== 'none') {
      const mw = F.mouthWidth * W * (F.mouth === 'grin' ? 1.25 : 1);
      const curve = F.mouth === 'flat' ? 0 : F.mouthCurve * mw * (F.mouth === 'grin' ? 0.42 : 0.3);
      const y0 = (F.mouthHeight - 0.5) * H;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const u = -1 + (2 * i) / 16;
        const { p, n } = frontSurface(P.rx, P.rz, (u * mw) / 2);
        p.y = y0 + curve * (u * u - 1) / 2;
        p.addScaledVector(n, F.mouthThickness * 0.35);
        pts.push(p);
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, F.mouthThickness / 2, 8, false), new THREE.MeshStandardMaterial({ color: F.mouthColor, roughness: 0.6 }));
      tube.name = 'mouth'; tube.raycast = () => {};
      g.add(tube);
      for (const end of [pts[0], pts[pts.length - 1]]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(F.mouthThickness / 2, 10, 8), tube.material);
        cap.position.copy(end); cap.raycast = () => {};
        g.add(cap);
      }
    }
  }

  /** Apply a pose in renderer form { q: { id: [x,y,z,w] }, pos } (see anim.blendPoses). */
  applyQuats(P) {
    for (const id of JOINT_IDS) { const q = P.q[id]; if (q) this.joints[id].quaternion.set(q[0], q[1], q[2], q[3]); }
    const pv = this.layout ? this.layout.joints.root : [0, 0, 0];
    this.joints.root.position.set(pv[0] + P.pos[0], pv[1] + P.pos[1], pv[2] + P.pos[2]);
  }
  /** Apply an Euler pose { id: { rot, pos? } } (degrees). */
  applyPose(pose) {
    const q = {};
    for (const id of JOINT_IDS) q[id] = eulerToQuat(pose[id].rot);
    this.applyQuats({ q, pos: pose.root.pos || [0, 0, 0] });
  }

  setSelected(id) {
    this.selected = id;
    this.refreshOutlines();
  }
  setHovered(id) { if (this.hovered === id) return; this.hovered = id; this.refreshOutlines(); }
  refreshOutlines() {
    for (const id of PART_IDS) {
      const ol = this.outlines[id]; if (!ol) continue;
      const sel = this.selected === id || (this.selected === 'root') || (Array.isArray(this.selected) && this.selected.includes(id));
      ol.visible = sel || this.hovered === id;
      ol.material = sel ? this.selectMat : this.hoverMat;
    }
  }

  /** World position of a joint's pivot. */
  pivotWorld(id, target = new THREE.Vector3()) { return this.joints[id].getWorldPosition(target); }

  dispose() {
    for (const id of PART_IDS) { if (this.parts[id]) this.parts[id].geometry.dispose(); }
    for (const m of Object.values(this.mats)) m.dispose();
    this.selectMat.dispose(); this.hoverMat.dispose();
  }
}

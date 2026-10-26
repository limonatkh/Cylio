/* =====================================================================
 * Test arena — try the character's locomotion clips in a small level.
 * Uses the pure Controller + Locomotion from core (frame-rate independent).
 * Input comes from the app: setInput({ move:[x,y] (screen space, −1…1),
 * run: bool, jump: bool (pressed this frame) }).
 * ===================================================================== */
import * as THREE from 'three';
import { Controller, Locomotion } from '../core/locomotion.js';

const STEP = 0.32;          // highest ledge the character walks up without jumping
const RADIUS = 0.42;        // body radius used against the blocks

function checkerTexture() {
  const S = 256, cv = Object.assign(document.createElement('canvas'), { width: S, height: S }), c = cv.getContext('2d');
  c.fillStyle = '#34363b'; c.fillRect(0, 0, S, S);
  c.fillStyle = '#3a3c42'; c.fillRect(0, 0, S / 2, S / 2); c.fillRect(S / 2, S / 2, S / 2, S / 2);
  c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 2; c.strokeRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); t.anisotropy = 4;
  return t;
}

export class Arena {
  constructor(viewport) {
    this.vp = viewport;
    this.group = new THREE.Group(); this.group.name = 'arena'; this.group.visible = false;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.group.add(floor);
    // blocks: [x, z, w, d, h, colour]
    this.blocks = [
      [3.2, -1.5, 2, 2, 0.3, '#4d5058'], [5.2, -1.5, 2, 2, 0.6, '#555861'], [7.2, -1.5, 2, 2, 1.0, '#5d606a'],
      [-3.5, -3, 3, 1.2, 0.9, '#4b4e56'], [-4.5, 2.5, 1.4, 1.4, 1.6, '#585b64'], [0, -6, 6, 0.6, 1.2, '#45484f'],
      [-8, -2, 0.6, 8, 1.2, '#45484f'], [9.5, 2, 2.4, 2.4, 0.3, '#ff7a1a'],
    ];
    const mat = {};
    for (const [x, z, w, d, h, col] of this.blocks) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat[col] || (mat[col] = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 })));
      m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    viewport.scene.add(this.group);
    this.input = { move: [0, 0], run: false, jump: false };
    this.active = false;
  }

  /** Floor height under (x, z) for feet at footY: the highest block top the character can stand on. */
  groundAt(x, z, footY) {
    let g = 0;
    for (const [bx, bz, w, d, h] of this.blocks) {
      if (Math.abs(x - bx) <= w / 2 + 0.12 && Math.abs(z - bz) <= d / 2 + 0.12 && h <= footY + STEP && h > g) g = h;
    }
    return g;
  }
  /** Keep the body out of blocks that are too high to step on. */
  solidPush(p, prev) {
    const out = p.slice();
    for (const [bx, bz, w, d, h] of this.blocks) {
      if (h <= prev[1] + STEP) continue;
      const hx = w / 2 + RADIUS, hz = d / 2 + RADIUS, dx = out[0] - bx, dz = out[2] - bz;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
        if (px < pz) out[0] = bx + Math.sign(dx || 1) * hx; else out[2] = bz + Math.sign(dz || 1) * hz;
      }
    }
    return out;
  }

  enter(clips, legLength) {
    const vp = this.vp;
    this.loco = new Locomotion(clips, legLength);
    this.ctrl = new Controller({ ground: (x, z, y) => this.groundAt(x, z, y), solid: (p, prev) => this.solidPush(p, prev) });
    this.active = true; this.group.visible = true;
    vp.floor.visible = false; this._grid = vp.grid.visible; vp.grid.visible = false;
    this._markers = vp.markers.visible; vp.markers.visible = false;
    vp.ghost.group.visible = false;
    vp.scene.fog.near = 14; vp.scene.fog.far = 36;
    vp.gizmo.detach();
    vp.char.setSelected(null); vp.char.setHovered(null);
    this._cam = { pos: vp.camera.position.clone(), target: vp.orbit.target.clone() };
    const h = vp.char.layout.height;
    vp.orbit.target.set(0, h * 0.55, 0);
    vp.camera.position.set(0, h * 1.35, 5.6);
    vp.orbit.minDistance = 2; vp.orbit.maxDistance = 12;
    this.state = { state: 'ground', speed: 0 };
  }
  exit() {
    const vp = this.vp;
    this.active = false; this.group.visible = false;
    vp.floor.visible = true; vp.grid.visible = this._grid; vp.markers.visible = this._markers;
    vp.scene.fog.near = 9; vp.scene.fog.far = 22;
    vp.char.group.position.set(0, 0, 0); vp.char.group.rotation.set(0, 0, 0);
    vp.key.position.set(2.6, 5, 3.4); vp.key.target.position.set(0, 0, 0);
    vp.orbit.minDistance = 0.8; vp.orbit.maxDistance = 14;
    if (this._cam) { vp.camera.position.copy(this._cam.pos); vp.orbit.target.copy(this._cam.target); }
    vp.invalidate();
  }
  setInput(i) { Object.assign(this.input, i); }
  respawn() { this.ctrl.pos = [0, 0, 0]; this.ctrl.vel = [0, 0, 0]; this.ctrl.grounded = true; }

  /** One frame. Returns true (the arena always moves). */
  update(dt) {
    if (!this.active) return false;
    const vp = this.vp, cam = vp.camera, I = this.input;
    // camera-relative direction on the floor
    const fwd = new THREE.Vector3().subVectors(vp.orbit.target, cam.position); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let mx = right.x * I.move[0] + fwd.x * -I.move[1], mz = right.z * I.move[0] + fwd.z * -I.move[1];
    const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    const maxSpeed = I.run ? this.loco.runSpeed : this.loco.walkSpeed;
    const before = this.ctrl.pos.slice();
    const r = this.ctrl.step(dt, [mx, mz], maxSpeed, I.jump);
    I.jump = false;
    if (this.ctrl.pos[1] < -5) this.respawn();
    const out = this.loco.update(dt, r);
    vp.char.applyQuats(out.pose);
    const g = vp.char.group, p = this.ctrl.pos;
    g.position.set(p[0], p[1], p[2]); g.rotation.set(0, this.ctrl.yaw, 0);
    // follow: move camera and target by the character's displacement
    const d = new THREE.Vector3(p[0] - before[0], p[1] - before[1], p[2] - before[2]);
    cam.position.add(d); vp.orbit.target.add(d);
    vp.key.position.set(p[0] + 2.6, p[1] + 5, p[2] + 3.4); vp.key.target.position.set(p[0], p[1], p[2]);
    this.state = { state: out.state, speed: r.speed, grounded: r.grounded, weights: out.weights };
    return true;
  }
}

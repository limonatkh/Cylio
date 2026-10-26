/* =====================================================================
 * Viewport — renderer, camera, lights, floor, picking and gizmos.
 *
 * The viewport knows nothing about the project; it reports what the user
 * does through callbacks and the app decides what to change:
 *   onPick(partId | null)            tap / click on a part (or empty space)
 *   onHover(partId | null)           mouse only
 *   onGizmoStart(kind)               a gizmo drag begins ('rotate'|'move'|'scale')
 *   onGizmo(kind, value)             during the drag (rot [x,y,z]° | pos [x,y,z] | scale [w,h,d] factor)
 *   onGizmoEnd(kind)
 *   onFrame(dt) → bool               called every frame; return true when something moved
 * Rendering happens only when something changed (battery friendly on phones).
 * ===================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Character3D } from './character3d.js';
import { quatToEuler } from '../core/anim.js';
import { JOINT_IDS } from '../core/rig.js';
import { PART_IDS } from '../core/character.js';

const VIEWS = {
  front: [0, 0.15, 1], back: [0, 0.15, -1], left: [1, 0.12, 0], right: [-1, 0.12, 0], top: [0, 1, 0.0001], persp: [0.62, 0.3, 1],
};

export class Viewport {
  constructor(container, o = {}) {
    this.el = container;
    this.cb = {};
    const low = o.quality === 'low';
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 'vp-canvas';
    r.domElement.setAttribute('aria-label', 'مشهد الشخصية ثلاثي الأبعاد');
    r.domElement.tabIndex = 0;
    container.appendChild(r.domElement);

    const s = this.scene = new THREE.Scene();
    this.bg = new THREE.Color('#2b2c30');
    s.background = this.bg;
    s.fog = new THREE.Fog('#2b2c30', 9, 22);

    const cam = this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 80);
    this.home = { pos: new THREE.Vector3(2.0, 1.55, 4.6), target: new THREE.Vector3(0, 0.92, 0) };
    cam.position.copy(this.home.pos);

    // lights: soft sky + one key light with a soft shadow + a cool rim
    s.add(new THREE.HemisphereLight('#e9ecf2', '#3a3a3c', 1.25));
    const key = this.key = new THREE.DirectionalLight('#ffffff', 2.1);
    key.position.set(2.6, 5, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3, bottom: -1.5, near: 0.5, far: 14 });
    key.shadow.radius = 5; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    s.add(key); s.add(key.target);
    const rim = new THREE.DirectionalLight('#bcd3ff', 0.7); rim.position.set(-3, 2.4, -3.5); s.add(rim);

    // floor: a quiet disc a little lighter than the background, and the shadow catcher on top
    const discTex = (() => {
      const S = 256, cv = Object.assign(document.createElement('canvas'), { width: S, height: S }), c = cv.getContext('2d');
      const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(0.7, 'rgba(255,255,255,0.035)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.floor = new THREE.Group(); this.floor.name = 'editorFloor';
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.001; disc.renderOrder = -2;
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.32 }));
    catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true;
    this.floor.add(disc, catcher);
    s.add(this.floor);
    this.grid = new THREE.GridHelper(6, 24, '#5b5d63', '#3b3c41');
    this.grid.material.transparent = true; this.grid.material.opacity = 0.55; this.grid.position.y = 0.0005;
    this.grid.visible = false;
    s.add(this.grid);

    // character + ghost (base pose comparison)
    this.char = new Character3D({ quality: o.quality });
    s.add(this.char.group);
    this.ghost = new Character3D({ quality: 'low', shadows: false });
    this.ghost.group.visible = false;
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#ffb27a', transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 });
    s.add(this.ghost.group);

    // joint markers
    this.markers = new THREE.Group(); this.markers.visible = false; this.markers.name = 'jointMarkers';
    const mg = new THREE.SphereGeometry(0.022, 16, 12);
    this.markerMat = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.9 });
    this.markerSel = new THREE.MeshBasicMaterial({ color: '#ff7a1a', depthTest: false });
    this.markerMeshes = {};
    for (const id of JOINT_IDS) { if (id === 'root') continue; const m = new THREE.Mesh(mg, this.markerMat); m.renderOrder = 10; m.raycast = () => {}; this.markers.add(m); this.markerMeshes[id] = m; }
    s.add(this.markers);

    // controls
    const oc = this.orbit = new OrbitControls(cam, r.domElement);
    oc.target.copy(this.home.target);
    oc.enableDamping = true; oc.dampingFactor = 0.12;
    oc.minDistance = 0.8; oc.maxDistance = 14; oc.maxPolarAngle = Math.PI * 0.495;
    oc.zoomSpeed = 0.9; oc.rotateSpeed = 0.75; oc.screenSpacePanning = true;
    oc.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    oc.addEventListener('change', () => this.invalidate());

    const tc = this.gizmo = new TransformControls(cam, r.domElement);
    tc.setSize(o.touch ? 1.25 : 0.85);
    tc.addEventListener('change', () => this.invalidate());
    tc.addEventListener('dragging-changed', e => {
      oc.enabled = !e.value;
      if (e.value) { this._dragKind = this.tool; this.cb.onGizmoStart?.(this.tool); }
      else { this.cb.onGizmoEnd?.(this._dragKind); this._dragKind = null; }
    });
    tc.addEventListener('objectChange', () => this._gizmoChanged());
    s.add(tc);
    this.proxy = new THREE.Object3D(); this.proxy.name = 'scaleProxy';

    this.tool = 'select'; this.selected = null; this.mode = 'shape';
    this.raycaster = new THREE.Raycaster();
    this._bindPointer();
    this.clock = new THREE.Clock();
    this.dirty = true; this.paused = false;
    this._camAnim = null;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.resize();
    document.addEventListener('visibilitychange', () => { this.paused = document.hidden; if (!this.paused) this.clock.getDelta(); });
    const loop = () => { this._raf = requestAnimationFrame(loop); this.frame(); };
    loop();
  }

  on(name, fn) { this.cb[name] = fn; return this; }
  invalidate() { this.dirty = true; }

  resize() {
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the character comfortably framed on narrow screens
    this.camera.fov = w / h < 0.8 ? 42 : 35;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  frame() {
    if (this.paused) return;
    const dt = Math.min(0.1, this.clock.getDelta());
    let moved = false;
    if (this.cb.onFrame) moved = this.cb.onFrame(dt) || false;
    if (this._camAnim) { this._stepCam(dt); moved = true; }
    if (this.orbit.enabled && this.orbit.update()) moved = true;
    if (moved || this.dirty) {
      if (this.markers.visible) this._placeMarkers();
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  }

  /* ---------------------------------------------------------------- character */
  setShape(shape) { this.char.setShape(shape); this.ghost.setShape(shape); this._ghostMats(); this._syncGizmo(); this.invalidate(); }
  setAppearance(app) { this.char.setAppearance(app); this.invalidate(); }
  setPose(quats) { this.char.applyQuats(quats); this._syncGizmo(); this.invalidate(); }
  setGhost(quats) {
    if (!quats) this.ghost.group.visible = false;
    else { this.ghost.applyQuats(quats); this.ghost.group.visible = true; }
    this.invalidate();
  }
  _ghostMats() { for (const id of PART_IDS) if (this.ghost.parts[id]) { this.ghost.parts[id].material = this.ghostMat; this.ghost.parts[id].castShadow = false; this.ghost.outlines[id].visible = false; } }

  setSelected(id) {
    this.selected = id;
    this.char.setSelected(id);
    for (const [j, m] of Object.entries(this.markerMeshes)) m.material = j === id ? this.markerSel : this.markerMat;
    this._syncGizmo();
    this.invalidate();
  }
  setShowGrid(v) { this.grid.visible = v; this.invalidate(); }
  setShowJoints(v) { this.markers.visible = v; this.invalidate(); }
  _placeMarkers() { const v = new THREE.Vector3(); for (const [id, m] of Object.entries(this.markerMeshes)) m.position.copy(this.char.pivotWorld(id, v)); }

  /* ---------------------------------------------------------------- tools
   * mode: 'shape' | 'pose' | 'anim' | 'test'
   * tool: 'select' | 'move' | 'rotate' | 'scale'
   * Allowed: rotate in pose/anim, move (root) in pose/anim, scale in shape.  */
  setMode(mode) { this.mode = mode; this._syncGizmo(); }
  setTool(tool) { this.tool = tool; this._syncGizmo(); }
  toolAllowed(tool, mode = this.mode, sel = this.selected) {
    if (tool === 'select') return true;
    if (mode === 'test') return false;
    if (tool === 'scale') return mode === 'shape' && !!sel && sel !== 'root';
    if (tool === 'rotate') return (mode === 'pose' || mode === 'anim') && !!sel;
    if (tool === 'move') return mode === 'pose' || mode === 'anim';
    return false;
  }
  _syncGizmo() {
    const tc = this.gizmo;
    if (tc.dragging) return;
    const t = this.tool, ok = this.toolAllowed(t);
    if (!ok || t === 'select') { tc.detach(); this.invalidate(); return; }
    if (t === 'rotate') {
      tc.setMode('rotate'); tc.setSpace('local');
      tc.attach(this.char.joints[this.selected]);
    } else if (t === 'move') {
      tc.setMode('translate'); tc.setSpace('world');
      tc.attach(this.char.joints.root);
    } else if (t === 'scale') {
      const id = this.selected, mesh = this.char.parts[id];
      if (mesh.parent !== this.proxy.parent) mesh.parent.add(this.proxy);
      this.proxy.position.copy(mesh.position); this.proxy.quaternion.identity(); this.proxy.scale.set(1, 1, 1);
      tc.setMode('scale'); tc.setSpace('local');
      tc.attach(this.proxy);
    }
    tc.showX = tc.showY = tc.showZ = true;
    this.invalidate();
  }
  _gizmoChanged() {
    const t = this._dragKind || this.tool;
    if (t === 'rotate' && this.selected) {
      const q = this.char.joints[this.selected].quaternion;
      this.cb.onGizmo?.('rotate', quatToEuler([q.x, q.y, q.z, q.w]));
    } else if (t === 'move') {
      const p = this.char.joints.root.position, pv = this.char.layout.joints.root;
      this.cb.onGizmo?.('move', [p.x - pv[0], p.y - pv[1], p.z - pv[2]]);
    } else if (t === 'scale') {
      const s = this.proxy.scale;
      this.cb.onGizmo?.('scale', [Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)]);
    }
  }
  /** Reset the scale proxy after the app applied a new shape (so factors restart from 1). */
  resetProxy() { this.proxy.scale.set(1, 1, 1); if (this.tool === 'scale') this._syncGizmo(); }
  get dragging() { return this.gizmo.dragging; }

  /* ---------------------------------------------------------------- picking */
  _bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, multi: this._touches > 0 };
      if (e.pointerType === 'touch') this._touches = (this._touches || 0) + 1;
    });
    const up = e => {
      if (e.pointerType === 'touch') this._touches = Math.max(0, (this._touches || 1) - 1);
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      const wasMulti = down.multi; down = null;
      if (moved < 7 && quick && !wasMulti && !this.gizmo.dragging && !this._gizmoHover && this.mode !== 'test') this.cb.onPick?.(this.pick(e.clientX, e.clientY));
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { down = null; this._touches = 0; });
    el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || e.buttons || this.mode === 'test') return;
      this._gizmoHover = !!this.gizmo.axis;
      const id = this._gizmoHover ? null : this.pick(e.clientX, e.clientY);
      if (id !== this.char.hovered) { this.char.setHovered(id); this.cb.onHover?.(id); this.invalidate(); }
      el.style.cursor = id || this._gizmoHover ? 'pointer' : '';
    });
    el.addEventListener('pointerleave', () => { if (this.char.hovered) { this.char.setHovered(null); this.cb.onHover?.(null); this.invalidate(); } });
  }
  pick(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hits = this.raycaster.intersectObjects(Object.values(this.char.parts), false);
    return hits.length ? hits[0].object.userData.part : null;
  }
  /** Screen position (CSS px, relative to the canvas) of a joint — used by tests and labels. */
  screenOf(id) {
    const p = this.char.pivotWorld(id).project(this.camera);
    const w = this.el.clientWidth, h = this.el.clientHeight;
    return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h };
  }
  partScreen(id) {
    const v = new THREE.Vector3(); this.char.parts[id].getWorldPosition(v); v.project(this.camera);
    return { x: (v.x + 1) / 2 * this.el.clientWidth, y: (1 - v.y) / 2 * this.el.clientHeight };
  }

  /* ---------------------------------------------------------------- camera */
  view(name) {
    const d = VIEWS[name] || VIEWS.persp;
    const target = this.home.target.clone();
    const dist = this._fitDistance(this.char.layout ? this.char.layout.height : 1.8);
    const dir = new THREE.Vector3(...d).normalize();
    this._animateCam(target.clone().addScaledVector(dir, dist), target);
  }
  resetCamera() { const t = this.home.target.clone(); const h = this.char.layout ? this.char.layout.height : 1.8; t.y = h * 0.5; this._animateCam(t.clone().add(new THREE.Vector3(0.4, 0.2, 1).normalize().multiplyScalar(this._fitDistance(h))), t); }
  focus(id) {
    if (!id || !this.char.parts[id] && id !== 'root') return this.resetCamera();
    if (id === 'root') return this.resetCamera();
    const box = new THREE.Box3().setFromObject(this.char.parts[id]);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    this._animateCam(c.clone().addScaledVector(dir, Math.max(1.1, size * 2.4)), c);
  }
  _fitDistance(h) {
    const fov = this.camera.fov * Math.PI / 180;
    const vert = (h * 1.6) / 2 / Math.tan(fov / 2);
    const horiz = (h * 1.05) / 2 / Math.tan(fov / 2) / Math.max(0.3, this.camera.aspect);
    return Math.max(vert, horiz, 1.5);
  }
  _animateCam(pos, target, dur = 0.42) {
    this._camAnim = { p0: this.camera.position.clone(), t0: this.orbit.target.clone(), p1: pos, t1: target, u: 0, dur };
  }
  _stepCam(dt) {
    const a = this._camAnim; a.u = Math.min(1, a.u + dt / a.dur);
    const e = 1 - Math.pow(1 - a.u, 3);
    this.camera.position.lerpVectors(a.p0, a.p1, e);
    this.orbit.target.lerpVectors(a.t0, a.t1, e);
    this.camera.lookAt(this.orbit.target);
    if (a.u >= 1) this._camAnim = null;
  }
  zoom(k) {
    const dir = this.camera.position.clone().sub(this.orbit.target);
    const d = THREE.MathUtils.clamp(dir.length() * k, this.orbit.minDistance, this.orbit.maxDistance);
    this._animateCam(this.orbit.target.clone().addScaledVector(dir.normalize(), d), this.orbit.target.clone(), 0.2);
  }

  /** Small PNG of the current view (for the project list). */
  snapshot(w = 160, h = 120) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const sr = src.width / src.height, dr = w / h;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (sr > dr) { sw = sh * dr; sx = (src.width - sw) / 2; } else { sh = sw / dr; sy = (src.height - sh) / 2; }
    cv.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    try { return cv.toDataURL('image/jpeg', 0.8); } catch { return null; }
  }
}

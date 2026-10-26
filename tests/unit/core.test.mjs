/* Unit tests for the pure core (no browser): shape/rig maths, animation,
 * gait, locomotion frame-rate independence, project validation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHAPE, layout, cleanShape, SHAPE_LIMITS } from '../../src/core/character.js';
import { restPose, clampRot, cleanPose, mirrorRot } from '../../src/core/rig.js';
import { sampleClip, sampleTrack, setKey, removeKey, setDuration, emptyClip, eulerToQuat, quatToEuler, blendPoses, gaitOf, clipSpeed, cleanClip, keyCount } from '../../src/core/anim.js';
import { builtinClips } from '../../src/core/builtins.js';
import { Locomotion, Controller } from '../../src/core/locomotion.js';
import { createProject, cleanProject, animationFile, readAnimationFile, parseJson } from '../../src/core/project.js';
import { History } from '../../src/core/history.js';
import { eulerToMat, matVec, clone, DEG } from '../../src/core/math.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/* ---------------------------------------------------------------- shape & joints */
test('default layout matches the reference proportions', () => {
  const L = layout(DEFAULT_SHAPE);
  assert.ok(close(L.legLength, 0.48, 1e-9));
  assert.ok(close(L.height, 1.831, 1e-3));
  assert.deepEqual(L.joints.leftArm.map(v => +v.toFixed(3)), [0.511, 1.226, 0]);
  assert.deepEqual(L.joints.rightLeg.map(v => +v.toFixed(3)), [-0.178, 0.48, 0]);
});

/** Signed distance to a rounded elliptical cylinder (local frame, axis = y, centred). Exact for a circle, conservative otherwise. */
function sdfPart(p, P) {
  const rmin = Math.min(P.rx, P.rz);
  const rho = Math.hypot(p[0] / P.rx, p[2] / P.rz) * rmin;        // radial distance scaled to the smaller radius
  const r = Math.min(P.rr, rmin, P.h / 2);
  const qx = rho - (rmin - r), qy = Math.abs(p[1]) - (P.h / 2 - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

test('limbs always cover a sphere around their pivot (no gap at any angle)', () => {
  // for any rotation, the limb end contains the sphere of the limb radius around the pivot,
  // and that sphere reaches the torso within the configured gap → the joint never opens.
  const shapes = [DEFAULT_SHAPE, cleanShape({ parts: { leftArm: { w: 0.2, d: 0.2, h: 0.9, round: 0 }, leftLeg: { w: 0.45, d: 0.45, h: 0.4, round: 1 } } })];
  for (const shape of shapes) {
    const L = layout(shape);
    for (const id of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
      const P = L.parts[id], piv = P.pivot, r = Math.min(P.rx, P.rz, P.h / 2);
      const local = [piv[0] - P.center[0], piv[1] - P.center[1], piv[2] - P.center[2]];
      let worst = -Infinity;
      for (let i = 0; i < 400; i++) {
        const u = (i * 0.618034) % 1, v = (i * 0.414214) % 1;
        const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
        const q = [local[0] + r * Math.sin(ph) * Math.cos(th), local[1] + r * Math.cos(ph), local[2] + r * Math.sin(ph) * Math.sin(th)];
        worst = Math.max(worst, sdfPart(q, P));
      }
      assert.ok(worst <= 1e-6, `${id}: sphere leaves the limb by ${worst}`);
    }
    // arms: sphere touches the torso side within shoulderGap
    const T = L.parts.torso;
    for (const id of ['leftArm', 'rightArm']) {
      const P = L.parts[id], r = Math.min(P.rx, P.rz);
      const gap = Math.abs(P.pivot[0]) - r - T.rx;
      assert.ok(gap <= shape.layout.shoulderGap + 1e-9 && gap >= -1e-9, `${id} shoulder gap ${gap}`);
    }
    // legs: sphere top reaches the hip line within hipGap
    for (const id of ['leftLeg', 'rightLeg']) {
      const P = L.parts[id], r = Math.min(P.rx, P.rz);
      const gap = T.bottom - (P.pivot[1] + Math.min(r, P.h / 2));
      assert.ok(gap <= shape.layout.hipGap + Math.max(0, Math.max(shape.parts.leftLeg.h, shape.parts.rightLeg.h) - P.h) + 1e-9, `${id} hip gap ${gap}`);
    }
  }
});

test('shape cleaning clamps and reports', () => {
  const warns = [];
  const s = cleanShape({ parts: { head: { w: 9, h: 'x' } } }, (p, m) => warns.push(p));
  assert.equal(s.parts.head.w, SHAPE_LIMITS.head.w[1]);
  assert.equal(s.parts.head.h, DEFAULT_SHAPE.parts.head.h);
  assert.ok(warns.includes('shape.parts.head.w') && warns.includes('shape.parts.head.h'));
});

test('rig limits and mirroring', () => {
  assert.deepEqual(clampRot('leftArm', [0, 0, -90]), [0, 0, -12]);
  assert.deepEqual(mirrorRot([10, 20, 30]), [10, -20, -30]);
  const p = cleanPose({ root: { pos: [0, 99, 0] }, nope: 1 });
  assert.equal(p.root.pos[1], 3);
});

/* ---------------------------------------------------------------- animation */
test('euler ↔ quaternion roundtrip', () => {
  for (const r of [[10, 20, 30], [-80, 45, 170], [0, 0, 0], [33, -60, -12]]) {
    const back = quatToEuler(eulerToQuat(r));
    // compare through rotation matrices (euler is not unique)
    const A = eulerToMat(...r), B = eulerToMat(...back);
    A.forEach((v, i) => assert.ok(close(v, B[i], 1e-9)));
  }
});

test('sampling: easing, loop wrap and clamping', () => {
  const c = emptyClip('t', { duration: 1, loop: true });
  setKey(c, 'leftArm', 0, { rot: [0, 0, 0] }, 'linear');
  setKey(c, 'leftArm', 0.5, { rot: [-40, 0, 0] }, 'linear');
  assert.ok(close(sampleClip(c, 0.25).leftArm.rot[0], -20));
  assert.ok(close(sampleClip(c, 0.75).leftArm.rot[0], -20));       // wraps 0.5 → 1.0(=0)
  assert.ok(close(sampleClip(c, 1.25).leftArm.rot[0], -20));       // time loops
  c.loop = false;
  assert.ok(close(sampleClip(c, 0.9).leftArm.rot[0], -40));        // holds the last key
  assert.equal(keyCount(c), 2);
  assert.ok(removeKey(c, 'leftArm', 0.5));
  setDuration(c, 0.4);
  assert.equal(c.duration, 0.4);
  assert.equal(sampleTrack([], 0, 1, true), null);
});

test('step ease holds the value; durations scale keys', () => {
  const c = emptyClip('t', { duration: 2 });
  setKey(c, 'head', 0, { rot: [10, 0, 0] }, 'step');
  setKey(c, 'head', 1, { rot: [30, 0, 0] });
  c.loop = false;
  assert.ok(close(sampleClip(c, 0.99).head.rot[0], 10));
  setDuration(c, 1, 'scale');
  assert.equal(c.tracks.head[1].t, 0.5);
});

test('blend of identical poses is the pose', () => {
  const pose = restPose(); pose.leftArm.rot = [-30, 10, 20];
  const b = blendPoses([{ pose, w: 0.3 }, { pose, w: 0.7 }]);
  const q = eulerToQuat(pose.leftArm.rot);
  b.q.leftArm.forEach((v, i) => assert.ok(close(Math.abs(v), Math.abs(q[i]), 1e-9)));
});

/* ---------------------------------------------------------------- gait & locomotion */
test('built-in gait speeds follow 4·L·sin θ / duration', () => {
  const clips = builtinClips(), walk = clips.find(c => c.role === 'walk'), run = clips.find(c => c.role === 'run');
  const g = gaitOf(walk, 0.48);
  assert.ok(close(g.stride, 4 * 0.48 * Math.sin(30 * DEG), 1e-3));
  assert.ok(close(clipSpeed(walk, 0.48), 1.2, 1e-3));
  assert.ok(close(clipSpeed(run, 0.48), 4 * 0.48 * Math.sin(56 * DEG) / 0.5, 2e-3));
  // longer legs → faster planted speed
  assert.ok(clipSpeed(walk, 0.6) > clipSpeed(walk, 0.48));
});

function footSlip(clip, legLength) {
  // body moves forward at the clip's planted speed; measure how fast the lowest foot moves in the world
  const v = clipSpeed(clip, legLength), n = 400, dt = clip.duration / n;
  const foot = (t, id) => { const p = sampleClip(clip, t, legLength); const R = eulerToMat(...p[id].rot); const f = matVec(R, [0, -legLength, 0]); return { y: f[1] + p.root.pos[1], z: f[2] + p.root.pos[2] + v * t }; };
  let slip = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    // rigid legs keep both feet at the same height; the planted foot is the one swinging backwards
    const pa = sampleClip(clip, t, legLength), pb = sampleClip(clip, t + dt, legLength);
    const id = pb.leftLeg.rot[0] - pa.leftLeg.rot[0] > 0 ? 'leftLeg' : 'rightLeg';
    const a = foot(t, id), b = foot(t + dt, id);
    slip += Math.abs(b.z - a.z) / dt; cnt++;
  }
  return slip / cnt / v;     // average planted-foot speed relative to body speed
}
test('planted foot slip stays small for walk and run (3 leg lengths)', () => {
  const clips = builtinClips();
  for (const role of ['walk', 'run']) for (const leg of [0.4, 0.48, 0.6]) {
    const s = footSlip(clips.find(c => c.role === role), leg);
    assert.ok(s < 0.2, `${role} @${leg}: slip ${(s * 100).toFixed(1)} %`);
  }
});

function runLoco(fps, seconds = 3) {
  const clips = {}; for (const c of builtinClips()) clips[c.role] = c;
  const loco = new Locomotion(clips, 0.48), ctrl = new Controller();
  const n = Math.round(seconds * fps), dt = 1 / fps;
  let out;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const move = t < 1.5 ? [0, 1] : [0, 0];
    const r = ctrl.step(dt, move, loco.runSpeed * 0.7, false);
    out = loco.update(dt, r);
  }
  return { out, pos: ctrl.pos };
}
test('locomotion and controller are frame-rate independent', () => {
  const a = runLoco(30), b = runLoco(60), c = runLoco(144);
  for (const x of [b, c]) {
    assert.ok(Math.abs(x.pos[2] - a.pos[2]) < 0.02, `distance ${a.pos[2]} vs ${x.pos[2]}`);
    for (const k of Object.keys(a.out.weights)) assert.ok(Math.abs(x.out.weights[k] - a.out.weights[k]) < 0.01, `${k}`);
  }
});

test('jump → fall → land → ground', () => {
  const clips = {}; for (const c of builtinClips()) clips[c.role] = c;
  const loco = new Locomotion(clips, 0.48), ctrl = new Controller();
  const seen = new Set(); const dt = 1 / 60;
  for (let i = 0; i < 180; i++) { const r = ctrl.step(dt, [0, 0], 1, i === 5); seen.add(loco.update(dt, r).state); }
  for (const s of ['jump', 'fall', 'land', 'ground']) assert.ok(seen.has(s), s);
});

/* ---------------------------------------------------------------- project */
test('project save/import roundtrip is lossless', () => {
  const p = createProject('اختبار');
  p.shape.parts.head.w = 0.5; p.appearance.parts.torso.color = '#FF7A1A'; p.pose.leftArm.rot = [-20, 0, 15];
  const r = cleanProject(JSON.parse(JSON.stringify(p)));
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 0, JSON.stringify(r.warnings));
  assert.deepEqual(r.project, p);
});
test('invalid files are rejected with readable errors', () => {
  assert.equal(cleanProject(null).errors.length, 1);
  assert.equal(cleanProject({ format: 'x' }).errors[0].path, 'format');
  assert.match(cleanProject({ format: 'cylio-animation' }).errors[0].message, /حركة/);
  assert.equal(cleanProject({ format: 'cylio-project', version: '9.0' }).errors[0].path, 'version');
  assert.match(parseJson('{"a":').error, /JSON/);
  const r = cleanProject({ format: 'cylio-project', version: '1.0', animations: [{ duration: 'x', tracks: { tail: [] } }], locomotion: { walk: 'missing' } });
  assert.equal(r.errors.length, 0);
  assert.ok(r.warnings.length >= 3);
});
test('animation file roundtrip', () => {
  const clip = builtinClips()[1];
  const r = readAnimationFile(JSON.parse(JSON.stringify(animationFile(clip))));
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.clip.tracks, clip.tracks);
  assert.notEqual(r.clip.id, clip.id);
  const bad = cleanClip({ tracks: { leftArm: [{ t: 0, rot: [999, 0, 0], ease: 'boing' }] } }, () => {});
  assert.equal(bad.tracks.leftArm[0].rot[0], 75);
  assert.equal(bad.tracks.leftArm[0].ease, 'smooth');
});

/* ---------------------------------------------------------------- history */
test('history undo / redo', () => {
  const h = new History(3);
  h.begin('a'); h.commit('x', 'b');
  h.begin('b'); h.commit('y', 'c');
  assert.equal(h.undoLabel, 'y');
  assert.equal(h.undo().before, 'b');
  assert.equal(h.redo().after, 'c');
  h.begin('c'); assert.equal(h.commit('z', 'c'), false);       // no change → no step
  for (let i = 0; i < 5; i++) { h.begin(String(i)); h.commit('n', String(i + 1)); }
  assert.equal(h.undoStack.length, 3);
  void clone;
});

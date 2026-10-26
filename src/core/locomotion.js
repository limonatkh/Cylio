/* =====================================================================
 * LOCOMOTION — state machine + blending for the test arena (pure, no DOM).
 *
 * Ground: idle ⇄ walk ⇄ run, blended by speed. Walk and run share one
 * normalised gait phase that advances by distance travelled ÷ stride
 * length, so the feet step at the rate the body moves (less sliding),
 * and blending walk ↔ run never makes the legs cancel out.
 * Air: jump (once, on take-off) → fall (loop) → land (once) → ground.
 * Weights move with exponential smoothing in seconds, so the result is
 * the same at any frame rate.
 * ===================================================================== */
import { clamp, damp, dampFactor } from './math.js';
import { sampleClip, blendPoses, clipSpeed, gaitOf } from './anim.js';

export const STATES = ['ground', 'jump', 'fall', 'land'];
const FADE = { ground: 0.12, jump: 0.06, fall: 0.15, land: 0.05 };   // seconds (63 % blend)

export class Locomotion {
  /**
   * @param clips { idle, walk, run, jump, fall, land } (clip objects or null)
   * @param legLength metres (hip pivot → sole)
   */
  constructor(clips, legLength) {
    this.clips = clips; this.leg = legLength;
    this.walkSpeed = clipSpeed(clips.walk, legLength) || 1.2;
    this.runSpeed = Math.max(this.walkSpeed * 1.2, clipSpeed(clips.run, legLength) || this.walkSpeed * 2.4);
    this.walkStride = clips.walk ? (clips.walk.moveSpeed ? clips.walk.moveSpeed * clips.walk.duration : gaitOf(clips.walk, legLength).stride) || 1 : 1;
    this.runStride = clips.run ? (clips.run.moveSpeed ? clips.run.moveSpeed * clips.run.duration : gaitOf(clips.run, legLength).stride) || 1 : 1;
    this.state = 'ground'; this.stateTime = 0; this.airTime = 0;
    this.phase = 0; this.idleTime = 0;
    this.w = { idle: 1, walk: 0, run: 0, jump: 0, fall: 0, land: 0 };
  }

  /** Target ground mix for a horizontal speed: { idle, walk, run } summing to 1. */
  groundMix(speed) {
    const v = Math.max(0, speed), ws = this.walkSpeed, rs = this.runSpeed;
    if (v <= 0.02) return { idle: 1, walk: 0, run: 0 };
    if (v < ws) { const k = clamp(v / ws, 0, 1); return { idle: 1 - k, walk: k, run: 0 }; }
    const k = clamp((v - ws) / Math.max(1e-3, rs - ws), 0, 1);
    return { idle: 0, walk: 1 - k, run: k };
  }

  /**
   * Advance by dt seconds.
   * input = { speed: horizontal m/s, grounded: bool, vy: vertical m/s, jumped: bool (this frame) }
   * Returns { pose (blended, renderer form), state, weights }.
   */
  update(dt, input) {
    const prev = this.state;
    this.stateTime += dt;
    if (!input.grounded) this.airTime += dt;
    // ---- transitions
    if (input.jumped) this.go('jump');
    else if (this.state === 'ground' && !input.grounded && this.airTime > 0.12) this.go('fall');
    else if (this.state === 'jump' && (input.vy < 0 || this.stateTime > (this.clips.jump ? this.clips.jump.duration : 0.3)) && !input.grounded) this.go('fall');
    if ((this.state === 'jump' || this.state === 'fall') && input.grounded && this.stateTime > 0.05) this.go(this.airTime > 0.25 && this.clips.land ? 'land' : 'ground');
    else if (this.state === 'land' && (this.stateTime >= (this.clips.land ? this.clips.land.duration : 0) || input.speed > this.walkSpeed * 0.8)) this.go('ground');
    if (input.grounded && this.state !== 'jump') this.airTime = 0;
    void prev;

    // ---- gait phase (distance-driven) and idle time
    const mix = this.groundMix(input.speed);
    const stride = this.walkStride + (this.runStride - this.walkStride) * (mix.run / Math.max(1e-6, mix.walk + mix.run || 1));
    if (input.grounded) this.phase = (this.phase + (input.speed * dt) / Math.max(0.05, stride)) % 1;
    this.idleTime += dt;

    // ---- weights
    const target = { idle: 0, walk: 0, run: 0, jump: 0, fall: 0, land: 0 };
    if (this.state === 'ground') Object.assign(target, mix);
    else target[this.state] = 1;
    for (const k of Object.keys(this.w)) if (!this.clips[k] && k !== 'idle') target[k] = 0;
    const tau = FADE[this.state];
    let sum = 0;
    for (const k of Object.keys(this.w)) { this.w[k] = damp(this.w[k], target[k], dt, tau); sum += this.w[k]; }
    if (sum < 1e-4) this.w.idle = 1;

    // ---- sample + blend
    const C = this.clips, L = this.leg, list = [];
    const add = (k, t) => { if (this.w[k] > 1e-3 && C[k]) list.push({ pose: sampleClip(C[k], t, L), w: this.w[k] }); };
    add('idle', this.idleTime);
    add('walk', this.phase * (C.walk ? C.walk.duration : 1));
    add('run', this.phase * (C.run ? C.run.duration : 1));
    add('jump', this.state === 'jump' ? this.stateTime : C.jump ? C.jump.duration : 0);
    add('fall', this.state === 'fall' ? this.stateTime : 0);
    add('land', this.state === 'land' ? this.stateTime : C.land ? C.land.duration : 0);
    return { pose: blendPoses(list), state: this.state, weights: { ...this.w } };
  }
  go(s) { if (this.state !== s || s === 'jump') { this.state = s; this.stateTime = 0; } }
}

/**
 * Character controller (pure): integrates input into position / velocity.
 * Time-step independent for constant input (exponential acceleration).
 */
export class Controller {
  constructor(o = {}) {
    this.pos = [0, 0, 0]; this.vel = [0, 0, 0]; this.yaw = 0; this.grounded = true;
    this.gravity = o.gravity ?? 22; this.jumpSpeed = o.jumpSpeed ?? 7.2; this.accelTau = o.accelTau ?? 0.12; this.turnTau = o.turnTau ?? 0.08;
    this.ground = o.ground || (() => 0);          // (x, z, footY) → floor height under the character
    this.solid = o.solid || (p => p);             // push out of obstacles
  }
  /** move = [x, z] desired direction in world space (length ≤ 1), maxSpeed m/s, jump = pressed this frame */
  step(dt, move, maxSpeed, jump) {
    let jumped = false;
    const k = dampFactor(dt, this.accelTau);
    const tx = move[0] * maxSpeed, tz = move[1] * maxSpeed;
    const air = this.grounded ? 1 : 0.35;
    this.vel[0] += (tx - this.vel[0]) * k * air;
    this.vel[2] += (tz - this.vel[2]) * k * air;
    if (jump && this.grounded) { this.vel[1] = this.jumpSpeed; this.grounded = false; jumped = true; }
    if (!this.grounded) this.vel[1] -= this.gravity * dt;
    const next = [this.pos[0] + this.vel[0] * dt, this.pos[1] + this.vel[1] * dt, this.pos[2] + this.vel[2] * dt];
    const p = this.solid(next, this.pos);
    const floor = this.ground(p[0], p[2], this.pos[1]);
    if (p[1] <= floor + 1e-4 && this.vel[1] <= 0) { p[1] = floor; this.vel[1] = 0; this.grounded = true; }
    else if (this.grounded && p[1] - floor > 0.06) { this.grounded = false; }            // walked off an edge
    else if (this.grounded) p[1] = floor;
    this.pos = p;
    const sp = Math.hypot(this.vel[0], this.vel[2]);
    if (sp > 0.05) {
      const want = Math.atan2(this.vel[0], this.vel[2]);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * dampFactor(dt, this.turnTau);
    }
    return { speed: sp, grounded: this.grounded, vy: this.vel[1], jumped };
  }
}

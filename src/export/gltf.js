/* =====================================================================
 * GLB export — the character as a node hierarchy (root → torso → head,
 * arms, legs) with every animation baked as glTF animations.
 * Rotations are sampled from the clips (30 fps by default) as quaternions,
 * the root offset as translation, so any engine that reads glTF 2.0
 * plays the same motion. Selection outlines and the eye glow sprites are
 * editor-only and are not exported.
 * ===================================================================== */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { sampleClip, eulerToQuat } from '../core/anim.js';
import { JOINT_IDS } from '../core/rig.js';

/** THREE.AnimationClip for one Cylio clip. */
export function bakeClip(clip, layoutInfo, fps = 30) {
  const n = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = [], q = {}, pos = [];
  for (const id of JOINT_IDS) q[id] = [];
  const pv = layoutInfo.joints.root;
  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.duration, i / fps);
    times.push(t);
    const pose = sampleClip(clip, clip.loop && i === n - 1 ? 0 : t, layoutInfo.legLength);
    for (const id of JOINT_IDS) q[id].push(...eulerToQuat(pose[id].rot));
    pos.push(pv[0] + pose.root.pos[0], pv[1] + pose.root.pos[1], pv[2] + pose.root.pos[2]);
  }
  // keep successive quaternions on the same hemisphere (no flips when the engine slerps)
  for (const id of JOINT_IDS) {
    const a = q[id];
    for (let i = 4; i < a.length; i += 4) if (a[i] * a[i - 4] + a[i + 1] * a[i - 3] + a[i + 2] * a[i - 2] + a[i + 3] * a[i - 1] < 0) for (let k = 0; k < 4; k++) a[i + k] = -a[i + k];
  }
  const tracks = JOINT_IDS.map(id => new THREE.QuaternionKeyframeTrack(`${id}.quaternion`, times, q[id]));
  tracks.push(new THREE.VectorKeyframeTrack('root.position', times, pos));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * @param char  Character3D (the editor's live character)
 * @param clips project animations
 * @returns Promise<ArrayBuffer> (GLB)
 */
export async function exportGLB(char, clips, o = {}) {
  const hidden = [];
  char.group.traverse(obj => { if ((obj.isSprite || obj.userData.outline || obj.userData.editorOnly) && obj.visible) { obj.visible = false; hidden.push(obj); } });
  const saved = { p: char.group.position.clone(), r: char.group.rotation.clone() };
  char.group.position.set(0, 0, 0); char.group.rotation.set(0, 0, 0);
  try {
    const animations = (clips || []).map(c => bakeClip(c, char.layout, o.fps || 30));
    const res = await new GLTFExporter().parseAsync(char.group, { binary: true, animations, onlyVisible: true, maxTextureSize: 1024 });
    return res;
  } finally {
    for (const obj of hidden) obj.visible = true;
    char.group.position.copy(saved.p); char.group.rotation.copy(saved.r);
  }
}

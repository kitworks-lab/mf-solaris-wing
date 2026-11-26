import * as THREE from 'three';
import { getTerrainHeight, getSeaLevel, RUNWAY_SPEC } from './terrainWorld.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const floorAt = (x, z) => Math.max(getTerrainHeight(x, z), getSeaLevel()) + 3;

export function createCameraRig(camera) {
  return {
    camera, mode: 'chase', pos: camera.position.clone(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
    fov: 58, orbit: 0, lastMode: null, forward: new THREE.Vector3(0, 0, -1),
  };
}

export function setCameraMode(rig, mode) { rig.mode = mode; }

export function updateCameraRig(rig, state, aircraftRig, dt, immediate = false) {
  const camera = rig.camera;
  const k = (rate) => (immediate ? 1 : damp(rate, dt));
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.q);
  const flat = new THREE.Vector3(forward.x, 0, forward.z);
  if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
  flat.normalize();
  let mode = rig.mode;
  if ((state.crashed || state.landed) && mode !== 'debrief' && mode !== 'crash') mode = state.crashed ? 'crash' : 'debrief';
  if (rig.mode === 'cockpit' && !state.crashed && !state.landed) mode = 'cockpit';
  const changed = rig.lastMode !== mode;
  rig.lastMode = mode;
  const snap = immediate || changed;

  if (aircraftRig) {
    const inside = mode === 'cockpit';
    aircraftRig.cockpit.visible = inside;
    aircraftRig.exterior.visible = !inside;
  }

  let targetFov = 58;
  if (mode === 'chase') {
    const speedFactor = clamp((state.kts - 60) / 160, 0, 1);
    targetFov = 58 + 6 * speedFactor + (state.boosting ? 4 : 0);
    const dir = flat.clone().lerp(forward, 0.35).normalize();
    const desired = state.pos.clone().addScaledVector(dir, -17 - speedFactor * 3);
    desired.y += 5.2;
    const minY = floorAt(desired.x, desired.z) + 2;
    if (desired.y < minY) desired.y = minY;
    if (snap) rig.pos.copy(desired); else {
      rig.pos.x += (desired.x - rig.pos.x) * damp(4.5, dt);
      rig.pos.z += (desired.z - rig.pos.z) * damp(4.5, dt);
      rig.pos.y += (desired.y - rig.pos.y) * damp(5.5, dt);
    }
    if (rig.pos.y < minY) rig.pos.y = minY;
    const lookAt = state.pos.clone().addScaledVector(forward, 14);
    const bank = new THREE.Vector3(0, 1, 0).lerp(new THREE.Vector3(0, 1, 0).applyQuaternion(state.q), 0.3).normalize();
    rig.up.lerp(bank, k(3)).normalize();
    rig.look.lerp(lookAt, snap ? 1 : damp(8, dt));
    camera.position.copy(rig.pos);
    camera.up.copy(rig.up);
    camera.lookAt(rig.look);
  } else if (mode === 'cockpit') {
    targetFov = 66 + (state.boosting ? 3 : 0);
    const eye = new THREE.Vector3(0, 0.3, 0.2).applyQuaternion(state.q).add(state.pos);
    camera.position.copy(eye);
    camera.up.set(0, 1, 0).applyQuaternion(state.q);
    camera.lookAt(eye.clone().addScaledVector(forward, 50).addScaledVector(camera.up, -3.8));
    rig.pos.copy(eye);
    rig.look.copy(state.pos).addScaledVector(forward, 14);
    rig.up.copy(camera.up);
  } else {
    targetFov = 46;
    rig.orbit += dt * (state.crashed ? 0.06 : 0.035);
    const base = state.crashed ? Math.atan2(state.pos.z + 1e-3, state.pos.x + 1e-3) + 0.6 : 0.9;
    const angle = Math.min(1, snap ? 1 : 1) * (base + rig.orbit);
    const center = state.pos.clone();
    center.y += 1.5;
    const radius = state.crashed ? 34 : 26;
    const desired = state.crashed ? new THREE.Vector3(center.x + Math.cos(angle) * radius * 0.5 + 8, center.y + 7.5, center.z + Math.abs(Math.sin(angle)) * radius * 0.9 + 12) : new THREE.Vector3(center.x + 16, center.y + 5.5, center.z - 28);
    const floor = floorAt(desired.x, desired.z);
    if (desired.y < floor) desired.y = floor;
    rig.pos.lerp(desired, snap ? 1 : damp(1.5, dt));
    rig.up.set(0, 1, 0);
    camera.up.set(0, 1, 0);
    camera.position.copy(rig.pos);
    const focus = center.clone();
    focus.x -= state.crashed ? 5 : 22;
    focus.z += state.crashed ? -3 : 16;
    focus.y += 0.5;
    rig.look.lerp(focus, snap ? 1 : damp(4, dt));
    camera.lookAt(rig.look);
  }

  if (mode !== 'cockpit') {
    const floor = floorAt(camera.position.x, camera.position.z);
    if (camera.position.y < floor) camera.position.y = floor;
  }
  rig.fov += (targetFov - rig.fov) * (snap ? 1 : damp(3, dt));
  if (Math.abs(camera.fov - rig.fov) > 0.01) {
    camera.fov = rig.fov;
    camera.updateProjectionMatrix();
  }
  rig.activeMode = mode;
  return mode;
}

export function getRunwayOrbitTarget() {
  return new THREE.Vector3(0, RUNWAY_SPEC.y, 0);
}
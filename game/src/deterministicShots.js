import * as THREE from 'three';
import { RUNWAY_SPEC, getTerrainHeight, getSeaLevel } from './terrainWorld.js';
import { FT, KTS } from './flightPhysics.js';
import { updateMissionRuntime } from './missions.js';

const DEG = Math.PI / 180;
export const SHOT_NAMES = ['cover', 'cockpit', 'canyon', 'debrief'];

export function parseShotParams(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search);
  const shot = params.get('shot');
  if (!shot || !SHOT_NAMES.includes(shot)) return null;
  const seed = Number.parseInt(params.get('seed') ?? '1', 10);
  return { shot, seed: Number.isFinite(seed) ? seed : 1 };
}

function seedRandom(seed) {
  let a = (seed * 2654435761) >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function orient(state, headingDeg, pitchDeg, rollDeg) {
  state.q.setFromEuler(new THREE.Euler(pitchDeg * DEG, -headingDeg * DEG, 0, 'YXZ'));
  state.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -rollDeg * DEG));
  state.w.set(0, 0, 0);
}

function refresh(state) {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(state.q);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(state.q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.q);
  state.kts = state.vel.length() * KTS;
  state.altM = state.pos.y;
  state.ft = state.pos.y * FT;
  const onRwy = Math.abs(state.pos.z) <= RUNWAY_SPEC.halfWidth && state.pos.x >= RUNWAY_SPEC.x0 && state.pos.x <= RUNWAY_SPEC.x1;
  const ground = onRwy ? RUNWAY_SPEC.y : Math.max(getTerrainHeight(state.pos.x, state.pos.z), getSeaLevel());
  state.aglM = Math.max(0, state.pos.y - (state.onGround ? 1.9 : 0) - ground);
  state.aglFt = state.aglM * FT;
  state.headingDeg = Math.round((Math.atan2(fwd.x, -fwd.z) / DEG + 360) % 360) % 360;
  state.pitchDeg = Math.asin(Math.max(-1, Math.min(1, fwd.y))) / DEG;
  state.rollDeg = Math.atan2(-right.y, up.y) / DEG;
  state.vsFpm = state.vel.y * 196.85;
  state.fuelPct = state.fuel;
  state.hullPct = state.hull;
  state.stallSpeedKts = 45;
}

function placeActiveRing(rt, index, pos) {
  const target = rt.targets[index];
  target.pos.copy(pos);
  target.visual.group.position.copy(pos);
  target.normal.set(1, 0, 0);
  target.visual.group.rotation.y = Math.PI / 2;
}

function clearFirst(rt, count) {
  rt.targets.forEach((target, i) => { target.cleared = i < count; });
  rt.cleared = count;
  rt.idx = count;
  rt.phase = count >= rt.targets.length ? 'land' : 'fly';
  rt.score = count * 140;
  rt.time = 164;
  rt.combo = 0;
}

function warm(ctx, frames) {
  const { game } = ctx;
  const dt = 1 / 60;
  const origin = game.state.pos.clone();
  const moving = game.state.vel.clone();
  game.state.pos.addScaledVector(moving, -frames * dt);
  for (let i = 0; i < frames; i++) {
    game.state.pos.addScaledVector(moving, dt);
    ctx.stepVisual(dt, i === frames - 1);
  }
  game.state.pos.copy(origin);
}

function fly(state, spec) {
  state.pos.set(spec.x, spec.y, spec.z);
  orient(state, spec.heading, spec.pitch, spec.roll);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(state.q);
  state.vel.copy(fwd).multiplyScalar(spec.kts / KTS);
  state.throttle = spec.throttle ?? 0.7;
  state.fuel = spec.fuel;
  state.hull = 100;
  state.gearProgress = spec.gear ?? 0;
  state.flapsProgress = spec.flaps ?? 0;
  state.boosting = !!spec.boost;
  state.gLoad = spec.g ?? 1;
  state.onGround = false;
  refresh(state);
  state.gLoad = spec.g ?? 1;
}

export function applyDeterministicShot(shotName, ctx) {
  const params = parseShotParams('?shot=' + shotName + '&seed=' + (ctx.seed ?? 1));
  seedRandom(params ? params.seed : 1);
  const { game, camRig, ui } = ctx;
  ui.hide();
  game.mode = 'shot';
  game.papiOverride = null;
  const R = RUNWAY_SPEC;

  if (shotName === 'cover') {
    ctx.loadMission(0);
    fly(game.state, { x: -860, y: 440 / FT, z: -40, heading: 92, pitch: -3, roll: -16, kts: 138, fuel: 84, gear: 0, flaps: 0, throttle: 0.75, g: 2.5 });
    clearFirst(game.rt, 4);
    placeActiveRing(game.rt, 4, new THREE.Vector3(-650, 132, 6));
    game.input.cameraMode = 'chase'; game.input.cockpitView = false;
    camRig.mode = 'chase';
    warm(ctx, 50);
  } else if (shotName === 'cockpit') {
    ctx.loadMission(0);
    fly(game.state, { x: -520, y: 46, z: 0, heading: 90, pitch: -3, roll: 0, kts: 78, fuel: 71, gear: 1, flaps: 2, throttle: 0.35, g: 1 });
    game.state.vel.y = -(78 / KTS) * Math.sin(3 * DEG);
    clearFirst(game.rt, 7);
    placeActiveRing(game.rt, 7, new THREE.Vector3(-330, 38, 0));
    game.papiOverride = { pos: new THREE.Vector3(-520, R.y + 340 * Math.tan(3.0 * DEG), 0) };
    game.input.cameraMode = 'cockpit'; game.input.cockpitView = true;
    camRig.mode = 'cockpit';
    warm(ctx, 6);
  } else if (shotName === 'canyon') {
    ctx.loadMission(1);
    const zc = 300 + 90 * Math.sin(300 / 260) + 40 * Math.sin(300 / 90);
    fly(game.state, { x: 160, y: 365 / FT, z: zc - 6, heading: 88, pitch: 1, roll: 22, kts: 156, fuel: 58, gear: 0, flaps: 0, throttle: 1, boost: true, g: 2.6 });
    clearFirst(game.rt, 3);
    placeActiveRing(game.rt, 3, new THREE.Vector3(360, 126, 300 + 90 * Math.sin(360 / 260) + 40 * Math.sin(360 / 90) + 34));
    game.input.cameraMode = 'chase'; game.input.cockpitView = false;
    camRig.mode = 'chase';
    warm(ctx, 50);
  } else if (shotName === 'debrief') {
    ctx.loadMission(0);
    const state = game.state;
    fly(state, { x: 55, y: 18.8, z: 0, heading: 90, pitch: 0, roll: 0, kts: 0, fuel: 64, gear: 1, flaps: 2, throttle: 0 });
    state.hull = 98;
    state.vel.set(0, 0, 0);
    state.onGround = true; state.onRunway = true; state.touchedDown = true; state.landed = true;
    state.touchdownX = -170;
    state.landing = { touchdownFpm: 118, centerlineOffsetM: 1.2, touchdownSpeedKts: 71, touchdownBankDeg: 0.8, headingErrorDeg: 0.6, distanceFromThresholdM: 120, grade: 'BUTTER', rolloutM: 225 };
    refresh(state);
    state.hullPct = 98;
    clearFirst(game.rt, 8);
    game.rt.time = 296;
    game.rt.score = 920;
    updateMissionRuntime(game.rt, state, {}, 1 / 60);
    camRig.mode = 'debrief';
    state.kts = 30; state.vsFpm = 0;
    state.landing.rolloutM = 20;
    warm(ctx, 24);
    state.kts = 0;
    ui.showDebrief(game.rt.debrief);
    game.mode = 'shot';
  }
  ctx.snapCamera();
}
import * as THREE from 'three';
import { RUNWAY_SPEC, getTerrainHeight } from './terrainWorld.js';

const canyonZ = (x) => 300 + 90 * Math.sin(x / 260) + 40 * Math.sin(x / 90);
const ground = (x, z) => Math.max(getTerrainHeight(x, z), 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const MISSIONS = [
  {
    id: 'archipelago', name: 'Archipelago Ring Run', short: 'RING RUN', mood: 'golden', kind: 'ring', unit: 'RINGS', color: '#ffb23a',
    brief: 'Thread eight golden rings from the coast over the lighthouse, through the canyon and around the caldera, then land on Runway 09.',
    spawn: { x: -1400, y: 140, z: 0, heading: 90, speedKts: 110, throttle: 0.6, fuel: 100 },
    wind: { base: [2, 0, 1.5], gust: 0.5 },
    targets: [[-1000, 125, -120], [-500, 150, -220], [250, 140, canyonZ(250)], [700, 160, canyonZ(700)], [900, 430, -320], [1230, 420, -650], [-400, 260, -520], [-950, 75, 0]],
    parTime: 330,
  },
  {
    id: 'storm', name: 'Storm Watch Recon', short: 'STORM WATCH', mood: 'dusk', kind: 'ring', unit: 'BEACONS', color: '#ff7a55',
    brief: 'Fly past six storm beacons in gusty dusk crosswinds on a tight fuel reserve, then make a lit instrument landing on Runway 09.',
    spawn: { x: -1400, y: 150, z: 0, heading: 90, speedKts: 115, throttle: 0.65, fuel: 72 },
    wind: { base: [0, 0, 7], gust: 5 },
    targets: [[-900, 140, 120], [-400, 170, -240], [300, 150, canyonZ(300)], [800, 170, canyonZ(800)], [1000, 430, -330], [-700, 90, 0]],
    parTime: 260,
  },
  {
    id: 'alpine', name: 'Alpine Supply Drop', short: 'SUPPLY DROP', mood: 'morning', kind: 'drop', unit: 'DROPS', color: '#ff8a2a',
    brief: 'Reach three mountain ridge zones marked by orange smoke. Fly through the ring or press X below 180 ft AGL to drop a crate, then land short-field.',
    spawn: { x: -1400, y: 160, z: 0, heading: 90, speedKts: 110, throttle: 0.6, fuel: 90 },
    wind: { base: [3, 0, -2], gust: 1, lift: 2.2 },
    targets: [[900, 0, -320], [1220, 0, -650], [680, 0, -880]],
    parTime: 300,
  },
];

function makeRing(color, radius, label) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#d9ad4f', emissive: color, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.32 });
  group.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.65, 16, 96), mat));
  const glow = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius * 0.97, 72),
    new THREE.MeshBasicMaterial({ color: '#fff1c0', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  group.add(glow);
  const chevrons = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.9, radius * 0.16, 0.9), mat);
    const a = (i / 4) * Math.PI * 2;
    bracket.position.set(Math.cos(a) * (radius + 1.4), Math.sin(a) * (radius + 1.4), 0);
    bracket.rotation.z = a - Math.PI / 2;
    chevrons.add(bracket);
  }
  group.add(chevrons);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20,24,30,0.75)'; ctx.beginPath(); ctx.arc(64, 64, 56, 0, 7); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(label), 64, 68);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false, fog: false }));
  beacon.scale.set(radius * 0.55, radius * 0.55, 1);
  beacon.position.y = radius * 1.3;
  group.add(beacon);
  return { group, chevrons, glow, mat, beacon };
}

function makeSmoke(color) {
  const group = new THREE.Group();
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
    group.add(puff);
    puffs.push(puff);
  }
  return { group, puffs };
}

function makeCrate() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), new THREE.MeshStandardMaterial({ color: '#b98a4e' })));
  const chute = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#ff8a2a', side: THREE.DoubleSide, emissive: '#a03c00', emissiveIntensity: 0.4 }));
  chute.position.y = 4.2;
  group.add(chute);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    V(-3, 4.2, 0), V(-0.6, 0.5, 0), V(3, 4.2, 0), V(0.6, 0.5, 0), V(0, 4.2, -3), V(0, 0.5, -0.6), V(0, 4.2, 3), V(0, 0.5, 0.6),
  ]), new THREE.LineBasicMaterial({ color: '#f4efe6' }));
  group.add(lines);
  return { group, chute, lines };
}

export function createMissionRuntime(missionIndex, scene, world) {
  const mission = MISSIONS[missionIndex] ?? MISSIONS[0];
  const group = new THREE.Group();
  group.name = 'Mission:' + mission.id;
  scene.add(group);
  const radius = mission.kind === 'drop' ? 30 : 19;
  const targets = mission.targets.map((point, index) => {
    const [x, yRaw, z] = point;
    const gy = ground(x, z);
    const y = mission.kind === 'drop' ? gy + 70 : yRaw;
    const pos = V(x, y, z);
    const visual = makeRing(mission.color, radius, index + 1);
    visual.group.position.copy(pos);
    group.add(visual.group);
    let smoke = null;
    if (mission.kind === 'drop') {
      smoke = makeSmoke('#ff8a2a');
      smoke.group.position.set(x, gy, z);
      group.add(smoke.group);
    }
    return { index, pos, groundY: gy, radius, cleared: false, visual, smoke, normal: V(1, 0, 0) };
  });
  const start = V(mission.spawn.x, mission.spawn.y, mission.spawn.z);
  targets.forEach((target, i) => {
    const previous = i === 0 ? start : targets[i - 1].pos;
    const next = i === targets.length - 1 ? V(RUNWAY_SPEC.x0, RUNWAY_SPEC.y, 0) : targets[i + 1].pos;
    target.normal.copy(next).sub(previous).setY(0);
    if (target.normal.lengthSq() < 1) target.normal.set(1, 0, 0);
    target.normal.normalize();
    target.visual.group.rotation.y = Math.atan2(target.normal.x, target.normal.z);
  });

  const runwayGlow = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY_SPEC.length, RUNWAY_SPEC.width + 8),
    new THREE.MeshBasicMaterial({ color: mission.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  runwayGlow.rotation.x = -Math.PI / 2;
  runwayGlow.position.set(0, RUNWAY_SPEC.y + 0.12, 0);
  group.add(runwayGlow);

  return {
    mission, missionIndex, scene, world, group, targets, runwayGlow, crates: [], events: [],
    idx: 0, cleared: 0, score: 0, combo: 0, comboTimer: 0, time: 0, phase: 'fly', landReady: false,
    prevPos: null, prevDrop: false, debrief: null, finished: false, flash: 0, breakdown: { objectives: 0, landing: 0, fuel: 0, time: 0 },
    total: targets.length,
  };
}

export function getMissionWind(rt, state, time = 0) {
  const w = rt.mission.wind;
  const gust = Math.sin(time * 0.7) * Math.sin(time * 1.9 + 1) * w.gust;
  const lift = w.lift && state && Math.hypot(state.pos.x - 900, state.pos.z + 650) < 520 ? w.lift : 0;
  return { x: w.base[0] + gust * 0.4, y: lift + gust * 0.1, z: w.base[2] + gust };
}

export function getActiveTarget(rt) {
  if (rt.phase === 'fly' && rt.idx < rt.targets.length) {
    const target = rt.targets[rt.idx];
    return { kind: rt.mission.kind, pos: target.pos, label: String(rt.idx + 1), index: rt.idx };
  }
  if (rt.phase === 'land') return { kind: 'runway', pos: V(RUNWAY_SPEC.x0 + 60, RUNWAY_SPEC.y, 0), label: 'RWY 09', index: -1 };
  return null;
}

function award(rt, label) {
  rt.combo = rt.comboTimer > 0 ? rt.combo + 1 : 1;
  rt.comboTimer = 14;
  rt.score += 100 * Math.min(rt.combo, 5);
  rt.cleared += 1;
  rt.flash = 1;
  rt.events.push(label);
  const target = rt.targets[rt.idx];
  target.cleared = true;
  rt.idx += 1;
  if (rt.idx >= rt.targets.length) {
    rt.phase = 'land';
    rt.landReady = true;
    rt.events.push('landready');
  }
}

function medalFor(rt, state) {
  const crashed = state.crashed;
  const ratio = rt.cleared / rt.total;
  let points = ratio * 60 + (crashed ? 0 : 20);
  if (state.landing) points += state.landing.grade === 'BUTTER' ? 20 : state.landing.grade === 'FIRM' ? 12 : 5;
  if (crashed) return 'NONE';
  if (points >= 92 && rt.time <= rt.mission.parTime * 1.15) return 'GOLD';
  if (points >= 75) return 'SILVER';
  return 'BRONZE';
}

function buildDebrief(rt, state) {
  const crashed = state.crashed;
  const landing = state.landing;
  const landingBonus = crashed || !landing ? 0 : landing.grade === 'BUTTER' ? 500 : landing.grade === 'FIRM' ? 300 : 120;
  const centerBonus = crashed || !landing ? 0 : Math.max(0, Math.round(150 - Math.abs(landing.centerlineOffsetM) * 10));
  const fuelBonus = crashed ? 0 : Math.round(state.fuelPct * 2);
  const timeBonus = crashed ? 0 : Math.max(0, Math.round((rt.mission.parTime - rt.time) * 1.5));
  rt.breakdown = { objectives: rt.score, landing: landingBonus + centerBonus, fuel: fuelBonus, time: timeBonus };
  const total = rt.score + landingBonus + centerBonus + fuelBonus + timeBonus;
  return {
    crashed, reason: state.crashReason, missionName: rt.mission.name,
    grade: crashed ? 'CRASH \u2014 ' + state.crashReason : landing ? (landing.grade === 'BUTTER' ? 'BUTTER TOUCHDOWN' : landing.grade + ' TOUCHDOWN') : 'NO TOUCHDOWN',
    touchdownFpm: landing ? landing.touchdownFpm : (state.impact ? state.impact.impactFpm : 0),
    touchdownKts: landing ? landing.touchdownSpeedKts : (state.impact ? state.impact.impactSpeedKts : 0),
    centerlineM: landing ? landing.centerlineOffsetM : 0,
    fuelPct: Math.round(state.fuelPct), hullPct: Math.round(state.hullPct),
    cleared: rt.cleared, total: rt.total, unit: rt.mission.unit,
    time: rt.time, score: total, breakdown: rt.breakdown, medal: medalFor(rt, state),
  };
}

function updateCrates(rt, dt) {
  for (const crate of rt.crates) {
    if (crate.landed) { crate.t += dt; continue; }
    crate.t += dt;
    crate.vy = Math.max(-5.5, crate.vy - 9.81 * dt * 0.4);
    crate.group.position.y += crate.vy * dt;
    crate.group.position.x += 1.2 * dt;
    crate.group.rotation.z = Math.sin(crate.t * 1.6) * 0.12;
    crate.chute.scale.setScalar(Math.min(1, crate.t * 1.5));
    if (crate.group.position.y <= crate.groundY + 0.55) {
      crate.group.position.y = crate.groundY + 0.55;
      crate.landed = true;
      crate.chute.visible = false;
      crate.lines.visible = false;
    }
  }
}

export function updateMissionRuntime(rt, state, input = {}, dt = 1 / 60) {
  rt.events.length = 0;
  const time = (rt.clock = (rt.clock ?? 0) + dt);
  const active = !rt.finished;
  if (active && !state.onGround || (active && state.touchedDown !== true)) rt.time += dt;
  rt.comboTimer = Math.max(0, rt.comboTimer - dt);
  if (rt.comboTimer === 0) rt.combo = 0;
  rt.flash = Math.max(0, rt.flash - dt * 2);
  if (input.landReady && rt.phase === 'fly') { rt.phase = 'land'; rt.landReady = true; rt.events.push('landready'); }

  rt.targets.forEach((target, i) => {
    const visual = target.visual;
    const isActive = rt.phase === 'fly' && i === rt.idx;
    visual.glow.material.opacity = target.cleared ? 0.05 : isActive ? 0.3 + 0.2 * Math.sin(time * 6) : 0.18;
    visual.mat.emissiveIntensity = target.cleared ? 0.1 : isActive ? 1.2 + 0.4 * Math.sin(time * 6) : 0.6;
    visual.group.scale.setScalar(1);
    visual.beacon.position.y = target.radius * 1.3 + Math.sin(time * 2 + i);
    if (target.smoke) {
      target.smoke.group.visible = !target.cleared;
      target.smoke.puffs.forEach((puff, j) => {
        const phase = ((time * 0.18 + j / target.smoke.puffs.length) % 1);
        puff.position.set(Math.sin(phase * 5 + j) * 4 + phase * 10, phase * 110, Math.cos(phase * 4 + j) * 3);
        puff.scale.setScalar(3 + phase * 12);
        puff.material.opacity = 0.55 * (1 - phase);
      });
    }
  });
  rt.runwayGlow.material.opacity = rt.phase === 'land' ? 0.16 + 0.1 * Math.sin(time * 4) : 0;

  if (active && !state.crashed) {
    const pos = state.pos;
    const prev = rt.prevPos ?? pos.clone();
    const target = rt.phase === 'fly' ? rt.targets[rt.idx] : null;
    if (target) {
      const before = prev.clone().sub(target.pos).dot(target.normal);
      const after = pos.clone().sub(target.pos).dot(target.normal);
      const offset = pos.clone().sub(target.pos);
      offset.addScaledVector(target.normal, -offset.dot(target.normal));
      const passed = before * after <= 0 && before !== after && offset.length() < target.radius * 1.15;
      const near = pos.distanceTo(target.pos) < target.radius * 0.8;
      if (rt.mission.kind === 'drop') {
        const wantsDrop = input.drop && !rt.prevDrop;
        const horizontal = Math.hypot(pos.x - target.pos.x, pos.z - target.pos.z);
        if (wantsDrop && state.aglFt < 180 && horizontal < 140) {
          const crate = makeCrate();
          crate.group.position.copy(pos);
          rt.group.add(crate.group);
          rt.crates.push({ ...crate, vy: 0, t: 0, landed: false, groundY: target.groundY });
          rt.events.push('drop');
          award(rt, 'drop-clear');
        } else if (passed || near) {
          award(rt, 'ring');
        }
      } else if (passed || near) {
        award(rt, 'ring');
      }
    }
    rt.prevPos = pos.clone();
  }
  rt.prevDrop = !!input.drop;
  updateCrates(rt, dt);

  if (!rt.finished && (state.crashed || state.landed)) {
    rt.finished = true;
    rt.phase = 'done';
    rt.debrief = buildDebrief(rt, state);
    rt.events.push(state.crashed ? 'crash' : 'landed');
  }
  return rt;
}

export function disposeMissionRuntime(rt) {
  rt.scene.remove(rt.group);
  rt.group.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) { if (node.material.map) node.material.map.dispose(); node.material.dispose(); }
  });
}
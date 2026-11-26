import * as THREE from 'three';

export const KTS = 1.943844;
export const FT = 3.280840;
const G = 9.81;
const FPM = 196.8504;
const DEG = 180 / Math.PI;
const RWY = { x0: -260, x1: 260, halfWidth: 18, y: 18 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const approach = (cur, target, rate, dt) => cur + clamp(target - cur, -rate * dt, rate * dt);
const smooth = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

export function createFlightState(spawn = {}) {
  const heading = ((spawn.heading ?? 90) * Math.PI) / 180;
  const speed = (spawn.speedKts ?? 110) / KTS;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((spawn.pitch ?? 0) * Math.PI / 180, -heading, 0, 'YXZ'));
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return {
    pos: new THREE.Vector3(spawn.x ?? -1400, spawn.y ?? 140, spawn.z ?? 0),
    vel: fwd.multiplyScalar(speed),
    q,
    w: new THREE.Vector3(),
    time: 0,
    throttle: spawn.throttle ?? 0.6,
    boosting: false,
    fuel: spawn.fuel ?? 100,
    hull: 100,
    gearProgress: spawn.gearDown === false ? 0 : 1,
    flapsProgress: 0,
    brakeProgress: 0,
    onGround: !!spawn.onGround,
    onRunway: false,
    stall: false,
    engineOut: false,
    crashed: false,
    crashReason: null,
    impact: null,
    landed: false,
    landing: null,
    touchedDown: false,
    kts: speed * KTS,
    altM: spawn.y ?? 140,
    ft: (spawn.y ?? 140) * FT,
    aglM: 0,
    aglFt: 0,
    headingDeg: spawn.heading ?? 90,
    pitchDeg: 0,
    rollDeg: 0,
    vsFpm: 0,
    aoaDeg: 0,
    gLoad: 1,
    fuelPct: spawn.fuel ?? 100,
    hullPct: 100,
    thrustN: 0,
  };
}

function crash(state, reason, fpm) {
  if (state.crashed) return;
  state.crashed = true;
  state.crashReason = reason;
  state.impact = {
    reason,
    impactFpm: Math.round(fpm),
    impactSpeedKts: Math.round(state.vel.length() * KTS),
    x: state.pos.x,
    y: state.pos.y,
    z: state.pos.z,
  };
  state.hull = 0;
  state.vel.set(0, 0, 0);
  state.w.set(0, 0, 0);
  state.throttle = 0;
}

function gradeOf(fpm) {
  if (fpm < 180) return 'BUTTER';
  if (fpm < 380) return 'FIRM';
  return 'HARD';
}

export function stepFlightPhysics(state, input = {}, dt = 1 / 60, world = {}, wind = null) {
  dt = clamp(dt, 0, 0.05);
  const terrain = world.getTerrainHeight ?? (() => 0);
  const sea = world.getSeaLevel ? world.getSeaLevel() : 0;
  const rwy = world.RUNWAY_SPEC && world.RUNWAY_SPEC.x0 !== undefined ? world.RUNWAY_SPEC : RWY;
  if (state.crashed || dt === 0) return state;
  state.time += dt;

  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(state.q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.q);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(state.q);

  state.gearProgress = approach(state.gearProgress, input.gear === false ? 0 : 1, 0.4, dt);
  const flapTarget = clamp(input.flaps ?? 0, 0, 2);
  state.flapsProgress = approach(state.flapsProgress, flapTarget, 1.2, dt);
  state.brakeProgress = approach(state.brakeProgress, input.brake ? 1 : 0, 3, dt);
  state.throttle = clamp(input.throttle ?? state.throttle, 0, 1);

  const airVel = state.vel.clone();
  if (wind) airVel.sub(new THREE.Vector3(wind.x ?? 0, wind.y ?? 0, wind.z ?? 0));
  const speed = airVel.length();
  const invQ = state.q.clone().invert();
  const vb = airVel.clone().applyQuaternion(invQ);
  const aoa = speed > 3 ? Math.atan2(-vb.y, -vb.z) : 0;
  const beta = speed > 3 ? Math.atan2(vb.x, -vb.z) : 0;

  const stallKts = 52 - 7 * Math.min(state.flapsProgress, 1) - 7 * Math.max(state.flapsProgress - 1, 0);
  const stallSpeed = stallKts / KTS;
  const aoaStall = 0.26;
  const aoaEff = aoa + 0.045 * state.flapsProgress;
  let cln = clamp(aoaEff / aoaStall, -0.8, 1);
  const stalling = !state.onGround && (speed < stallSpeed * 0.98 || aoa > aoaStall * 1.05);
  if (aoa > aoaStall) cln = Math.max(0.55, 1 - (aoa - aoaStall) * 3);
  const unstalled = aoa <= aoaStall;
  state.stall = stalling;

  let liftAccel = G * (speed / stallSpeed) ** 2 * cln;
  liftAccel = clamp(liftAccel, -4 * G, 9.5 * G);

  const dragCoef =
    0.00018 + 0.0002 * state.gearProgress + 0.00012 * state.flapsProgress + 0.0006 * state.brakeProgress + 0.00022 * cln * cln;
  const dragAccel = dragCoef * speed * speed;

  state.fuel = Math.max(0, state.fuel);
  state.engineOut = state.fuel <= 0;
  state.boosting = !!input.boost && state.throttle > 0.85 && !state.engineOut;
  let thrustFactor = state.engineOut ? 0 : 1;
  if (!state.engineOut && state.fuel < 3) thrustFactor = Math.sin(state.time * 37) > -0.2 ? 0.9 : 0.1;
  const thrustAccel =
    thrustFactor * state.throttle * (state.boosting ? 27 * (1 - speed / 420) : 15 * (1 - speed / 330));
  const burn = (0.03 + 0.11 * state.throttle ** 1.5) * (state.boosting ? 3.5 : 1);
  state.fuel = Math.max(0, state.fuel - burn * dt * (state.engineOut ? 0 : 1));
  state.thrustN = thrustAccel;

  const authority = clamp(speed / (stallSpeed * 2.2), 0.45, 1.25);
  const targetRates = new THREE.Vector3(
    (input.pitch ?? 0) * 1.0 * authority,
    -(input.yaw ?? 0) * 0.45 * authority,
    -(input.roll ?? 0) * 2.1 * authority,
  );
  if (!state.onGround) {
    const trim = 0.03 + 0.04 * state.flapsProgress;
    targetRates.x += -clamp(aoa - trim, -0.5, 0.5) * 0.6;
    targetRates.y += -clamp(beta, -0.5, 0.5) * 1.4;
    if (stalling) targetRates.x -= 0.7 * clamp((stallSpeed - speed) / (stallSpeed * 0.2) + 0.4, 0.2, 1.5);
    if (!unstalled) targetRates.x -= 0.5;
  }
  state.w.x = smooth(state.w.x, targetRates.x, 5, dt);
  state.w.y = smooth(state.w.y, targetRates.y, 4, dt);
  state.w.z = smooth(state.w.z, targetRates.z, 6, dt);

  const bank = Math.atan2(-right.y, up.y);
  if (!state.onGround) {
    const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(state.w.x * dt, state.w.y * dt, state.w.z * dt, 'XYZ'));
    state.q.multiply(dq);
    const assist = 0.85 * (1 - Math.min(1, Math.abs(input.yaw ?? 0)));
    const turn = (G * Math.tan(clamp(bank, -1.2, 1.2))) / Math.max(speed, 25);
    const wq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -turn * assist * dt);
    state.q.premultiply(wq);
    const pitchComp = Math.abs(Math.sin(bank)) * Math.abs(turn) * assist * dt * 0.6;
    state.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchComp));
    state.q.normalize();
  }

  const accel = new THREE.Vector3(0, -G, 0);
  accel.addScaledVector(fwd, thrustAccel);
  accel.addScaledVector(up, liftAccel);
  if (speed > 0.1) accel.addScaledVector(airVel, -dragAccel / speed);
  const sideSpeed = state.vel.dot(right);
  accel.addScaledVector(right, -sideSpeed * 1.2);

  const nz = (liftAccel + thrustAccel * Math.sin(aoa)) / G;
  const wasAirborne = !state.onGround;
  const prevVy = state.vel.y;

  if (state.onGround) {
    const flatFwd = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    const along = state.vel.dot(flatFwd);
    const brakeDecel = (input.wheelBrake ? 5.5 : 0.25) + state.brakeProgress * 2.5;
    let newAlong = along + (thrustAccel - Math.sign(along) * (brakeDecel + dragAccel)) * dt;
    if (along > 0 && newAlong < 0 && thrustAccel < 0.5) newAlong = 0;
    const steer = (input.yaw ?? 0) * clamp(Math.abs(newAlong) / 12, 0.1, 1) * 0.5 - (input.roll ?? 0) * 0.0;
    const heading = Math.atan2(fwd.x, -fwd.z) + steer * dt;
    const pitchNow = Math.asin(clamp(fwd.y, -1, 1));
    const canRotate = speed > stallSpeed * 1.15;
    const pitchTarget = canRotate ? clamp((input.pitch ?? 0) * 0.2, 0, 0.2) : 0;
    const pitch = smooth(pitchNow, pitchTarget, 4, dt);
    state.q.setFromEuler(new THREE.Euler(pitch, -heading, 0, 'YXZ'));
    const nf = new THREE.Vector3(0, 0, -1).applyQuaternion(state.q);
    state.vel.set(nf.x, 0, nf.z).normalize().multiplyScalar(Math.max(newAlong, 0));
    const verticalNet = liftAccel * Math.cos(pitch) - G;
    state.vel.y = verticalNet > 0.5 && canRotate ? Math.min(verticalNet * dt * 4, 4) : 0;
    state.w.set(0, 0, 0);
  } else {
    state.vel.addScaledVector(accel, dt);
  }
  state.pos.addScaledVector(state.vel, dt);

  const onRunwayXZ = state.pos.x >= rwy.x0 && state.pos.x <= rwy.x1 && Math.abs(state.pos.z) <= rwy.halfWidth;
  state.onRunway = onRunwayXZ;
  const groundH = onRunwayXZ ? rwy.y : Math.max(terrain(state.pos.x, state.pos.z), sea);
  const offset = 0.55 + 1.35 * state.gearProgress;
  const heightAbove = state.pos.y - offset - groundH;
  const fwdNow = new THREE.Vector3(0, 0, -1).applyQuaternion(state.q);
  const rightNow = new THREE.Vector3(1, 0, 0).applyQuaternion(state.q);
  const upNow = new THREE.Vector3(0, 1, 0).applyQuaternion(state.q);
  const bankNow = Math.atan2(-rightNow.y, upNow.y) * DEG;
  const sinkFpm = Math.max(0, -(wasAirborne ? state.vel.y : prevVy)) * FPM;
  const headingNow = (Math.atan2(fwdNow.x, -fwdNow.z) * DEG + 360) % 360;

  if (heightAbove <= 0 && !state.crashed) {
    const overWater = !onRunwayXZ && terrain(state.pos.x, state.pos.z) <= sea + 0.2;
    if (state.onGround) {
      state.pos.y = groundH + offset;
      if (!onRunwayXZ) {
        if (overWater) crash(state, 'WATER DITCHING', 0);
        else if (state.vel.length() > 6) crash(state, 'RUNWAY EXCURSION', 0);
        else state.vel.set(0, 0, 0);
      }
    } else if (overWater) {
      state.pos.y = groundH;
      crash(state, 'WATER DITCHING', sinkFpm);
    } else if (!onRunwayXZ) {
      crash(state, 'TERRAIN IMPACT', sinkFpm);
    } else {
      const axisError = Math.min(Math.abs(headingNow - 90), Math.abs(headingNow - 270));
      if (state.gearProgress < 0.9) crash(state, 'GEAR RETRACTED ON TOUCHDOWN', sinkFpm);
      else if (sinkFpm >= 620) crash(state, 'EXCESSIVE SINK RATE', sinkFpm);
      else if (Math.abs(bankNow) >= 18) crash(state, 'WING STRIKE ON LANDING', sinkFpm);
      else if (axisError > 30) crash(state, 'GEAR COLLAPSE - MISALIGNED', sinkFpm);
      else {
        state.onGround = true;
        state.pos.y = groundH + offset;
        state.vel.y = 0;
        if (!state.touchedDown) {
          state.touchedDown = true;
          let stress = 0;
          if (Math.abs(bankNow) >= 15) stress += 8;
          if (axisError > 12) stress += 10;
          state.hull = Math.max(1, state.hull - stress);
          state.landing = {
            touchdownFpm: Math.round(sinkFpm),
            centerlineOffsetM: Math.round(state.pos.z * 10) / 10,
            touchdownSpeedKts: Math.round(state.vel.length() * KTS),
            touchdownBankDeg: Math.round(bankNow * 10) / 10,
            headingErrorDeg: Math.round(axisError * 10) / 10,
            distanceFromThresholdM: Math.round(state.pos.x - rwy.x0),
            grade: gradeOf(sinkFpm),
            rolloutM: 0,
          };
          state.touchdownX = state.pos.x;
        }
      }
    }
  } else if (state.onGround && heightAbove > 0.4 && state.vel.y > 0) {
    state.onGround = false;
  }

  if (state.onGround && state.landing && !state.landed) {
    state.landing.rolloutM = Math.round(Math.abs(state.pos.x - state.touchdownX));
    if (state.vel.length() * KTS < 2 && !input.throttle) {
      state.landed = true;
    } else if (state.vel.length() * KTS < 2 && state.throttle < 0.05) {
      state.landed = true;
    }
  }

  if (!state.crashed && nz > 6.5) state.hull = Math.max(0, state.hull - (nz - 6.5) * 4 * dt);
  if (!state.crashed && state.hull <= 0) crash(state, 'STRUCTURAL FAILURE', 0);
  if (!state.crashed && (state.pos.x < -1750 || Math.abs(state.pos.x) > 1790 || Math.abs(state.pos.z) > 1790)) {
    state.pos.x = clamp(state.pos.x, -1790, 1790);
    state.pos.z = clamp(state.pos.z, -1790, 1790);
  }

  const f2 = new THREE.Vector3(0, 0, -1).applyQuaternion(state.q);
  const r2 = new THREE.Vector3(1, 0, 0).applyQuaternion(state.q);
  const u2 = new THREE.Vector3(0, 1, 0).applyQuaternion(state.q);
  state.kts = state.vel.length() * KTS;
  state.tasKts = speed * KTS;
  state.altM = state.pos.y;
  state.ft = state.pos.y * FT;
  const ground = onRunwayXZ ? rwy.y : Math.max(terrain(state.pos.x, state.pos.z), sea);
  state.aglM = Math.max(0, state.pos.y - offset - ground);
  state.aglFt = state.aglM * FT;
  state.headingDeg = Math.round((Math.atan2(f2.x, -f2.z) * DEG + 360) % 360) % 360;
  state.pitchDeg = Math.asin(clamp(f2.y, -1, 1)) * DEG;
  state.rollDeg = Math.atan2(-r2.y, u2.y) * DEG;
  state.vsFpm = state.vel.y * FPM;
  state.aoaDeg = aoa * DEG;
  state.gLoad = state.onGround ? 1 : nz;
  state.fuelPct = state.fuel;
  state.hullPct = state.hull;
  state.stallSpeedKts = stallKts;
  return state;
}

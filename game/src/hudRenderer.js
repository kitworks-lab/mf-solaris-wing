import * as THREE from 'three';
import { RUNWAY_SPEC, getTerrainHeight } from './terrainWorld.js';
import { getActiveTarget } from './missions.js';

const FONT = 'ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace';
const GREEN = '#7dffb0';
const AMBER = '#f2a93b';
const RED = '#ff4b3a';
const IVORY = '#f4efe6';
const DEG = Math.PI / 180;
const tmp = new THREE.Vector3();

export function createHudRenderer(canvas) {
  const hud = { canvas, ctx: canvas.getContext('2d'), w: 0, h: 0, dpr: 1, cameraMode: 'chase', time: 0, mapCache: null, flash: '' };
  hud.resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    hud.dpr = dpr;
    hud.w = canvas.clientWidth || window.innerWidth;
    hud.h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(hud.w * dpr);
    canvas.height = Math.round(hud.h * dpr);
  };
  hud.resize();
  return hud;
}

function text(ctx, str, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size * 0.28);
  ctx.strokeStyle = 'rgba(8,12,18,0.82)';
  ctx.lineJoin = 'round';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function line(ctx, x1, y1, x2, y2, color, width = 2) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(8,12,18,0.7)';
  ctx.lineWidth = width + 2.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function pad(value, length = 3) { return String(Math.max(0, Math.round(value))).padStart(length, '0'); }
function wrap360(a) { return ((a % 360) + 360) % 360; }
function wrap180(a) { return ((a + 540) % 360) - 180; }

function tape(ctx, opts) {
  const { x, top, height, value, span, step, side, color, label, fmt, bands } = opts;
  const mid = top + height / 2;
  const perPx = height / span;
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 60, top, 120, height); ctx.clip();
  ctx.fillStyle = 'rgba(8,14,22,0.28)';
  ctx.fillRect(side < 0 ? x - 56 : x - 4, top, 60, height);
  if (bands) for (const band of bands) {
    const y1 = mid - (band.to - value) * perPx;
    const y2 = mid - (band.from - value) * perPx;
    ctx.fillStyle = band.color;
    ctx.fillRect(x + (side < 0 ? 0 : -6), y1, 6, y2 - y1);
    if (band.hatch) {
      ctx.strokeStyle = RED; ctx.lineWidth = 2;
      for (let y = y1; y < y2; y += 8) { ctx.beginPath(); ctx.moveTo(x - 18 * side * -1 - 12, y); ctx.lineTo(x + 6, y + 8); ctx.stroke(); }
    }
  }
  const first = Math.floor((value - span / 2) / step) * step;
  for (let v = first; v <= value + span / 2; v += step) {
    if (v < 0) continue;
    const y = mid - (v - value) * perPx;
    const major = v % (step * 2) === 0;
    line(ctx, x, y, x - side * (major ? 14 : 8), y, color, 2);
    if (major) text(ctx, fmt ? fmt(v) : String(v), x - side * 20, y, 13, color, side < 0 ? 'left' : 'right');
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(8,14,22,0.82)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const bx = side < 0 ? x - 8 : x - 70;
  ctx.beginPath();
  ctx.rect(bx, mid - 15, 78, 30);
  ctx.fill(); ctx.stroke();
  text(ctx, fmt ? fmt(Math.round(value)) : String(Math.round(value)), bx + 39, mid, 20, '#ffffff', 'center');
  text(ctx, label, x - side * 28 - (side < 0 ? 0 : 0), top - 12, 12, color, 'center');
}

function projectPoint(point, camera, w, h) {
  tmp.copy(point).project(camera);
  const behind = tmp.z > 1;
  return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, behind, ndcX: tmp.x, ndcY: tmp.y };
}

function drawCompass(ctx, w, state, activeTarget, cockpit) {
  const cx = w / 2;
  const top = cockpit ? 60 : 52;
  const width = Math.min(520, w * 0.42);
  const hdg = state.headingDeg;
  const span = 70;
  ctx.save();
  ctx.beginPath(); ctx.rect(cx - width / 2, top - 12, width, 48); ctx.clip();
  ctx.fillStyle = 'rgba(8,14,22,0.3)';
  ctx.fillRect(cx - width / 2, top - 12, width, 48);
  for (let d = Math.floor((hdg - span / 2) / 5) * 5; d <= hdg + span / 2; d += 5) {
    const x = cx + ((d - hdg) / span) * width;
    const deg = wrap360(d);
    const major = deg % 10 === 0;
    line(ctx, x, top + 18, x, top + (major ? 6 : 12), GREEN, 2);
    if (deg % 90 === 0) text(ctx, 'NESW'[deg / 90], x, top - 2, 16, '#fff', 'center');
    else if (deg % 30 === 0) text(ctx, pad(deg / 10, 2), x, top - 2, 12, GREEN, 'center');
  }
  const rwyBearing = 90;
  const rx = cx + (wrap180(rwyBearing - hdg) / span) * width;
  if (Math.abs(wrap180(rwyBearing - hdg)) < span / 2) {
    ctx.fillStyle = AMBER; ctx.fillRect(rx - 5, top + 20, 10, 5);
  }
  if (activeTarget) {
    const bearing = wrap360(Math.atan2(activeTarget.pos.x - state.pos.x, -(activeTarget.pos.z - state.pos.z)) / DEG);
    const delta = wrap180(bearing - hdg);
    const bx = cx + (Math.max(-span / 2, Math.min(span / 2, delta)) / span) * width;
    ctx.fillStyle = AMBER; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx, top + 24); ctx.lineTo(bx + 7, top + 31); ctx.lineTo(bx, top + 38); ctx.lineTo(bx - 7, top + 31); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(8,14,22,0.85)'; ctx.strokeStyle = GREEN; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.rect(cx - 44, top - 42, 88, 26); ctx.fill(); ctx.stroke();
  text(ctx, 'HDG ' + pad(hdg) + '\u00B0', cx, top - 29, 17, '#fff', 'center');
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(cx, top + 20); ctx.lineTo(cx - 5, top + 28); ctx.lineTo(cx + 5, top + 28); ctx.closePath(); ctx.fill();
}

function drawHorizon(ctx, cx, cy, state, scale, cockpit, clipY) {
  if (cockpit) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 100000, clipY); ctx.clip(); }
  const roll = state.rollDeg * DEG;
  const pitchPx = scale;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const hy = state.pitchDeg * pitchPx;
  line(ctx, -190, hy, -50, hy, GREEN, 2.5);
  line(ctx, 50, hy, 190, hy, GREEN, 2.5);
  for (const p of [-30, -20, -10, 10, 20, 30]) {
    const y = hy - p * pitchPx;
    const half = Math.abs(p) % 20 === 0 ? 60 : 44;
    const dashed = p < 0;
    if (dashed) {
      line(ctx, -half, y, -half / 3, y, GREEN, 2); line(ctx, half / 3, y, half, y, GREEN, 2);
    } else {
      line(ctx, -half, y, -18, y, GREEN, 2); line(ctx, 18, y, half, y, GREEN, 2);
    }
    line(ctx, -half, y, -half, y + (p > 0 ? 7 : -7), GREEN, 2);
    line(ctx, half, y, half, y + (p > 0 ? 7 : -7), GREEN, 2);
    text(ctx, String(Math.abs(p)), -half - 16, y, 12, GREEN, 'center');
    text(ctx, String(Math.abs(p)), half + 16, y, 12, GREEN, 'center');
  }
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const ang = a * DEG - Math.PI / 2;
    const r = 150 + (cockpit ? 0 : 20);
    line(ctx, Math.cos(ang) * r, Math.sin(ang) * r, Math.cos(ang) * (r - (a % 30 === 0 ? 14 : 8)), Math.sin(ang) * (r - (a % 30 === 0 ? 14 : 8)), GREEN, 2);
  }
  ctx.restore();
  if (cockpit) ctx.restore();
  line(ctx, cx - 26, cy + 8, cx, cy - 6, '#ffffff', 3);
  line(ctx, cx + 26, cy + 8, cx, cy - 6, '#ffffff', 3);
}

function drawVelocityVector(ctx, state, camera, w, h) {
  if (state.kts < 15) return;
  tmp.copy(state.vel).normalize().multiplyScalar(300).add(state.pos);
  const p = projectPoint(tmp, camera, w, h);
  if (p.behind) return;
  ctx.strokeStyle = 'rgba(8,12,18,0.7)'; ctx.lineWidth = 4.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 7); ctx.stroke();
  ctx.strokeStyle = GREEN; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 7); ctx.stroke();
  line(ctx, p.x - 20, p.y, p.x - 9, p.y, GREEN, 2);
  line(ctx, p.x + 9, p.y, p.x + 20, p.y, GREEN, 2);
  line(ctx, p.x, p.y - 9, p.x, p.y - 17, GREEN, 2);
}

function drawWaypoint(ctx, state, target, camera, w, h) {
  if (!target) return;
  const dist = Math.round(target.pos.distanceTo(state.pos));
  const p = projectPoint(target.pos, camera, w, h);
  const margin = 54;
  const onScreen = !p.behind && p.x > margin && p.x < w - margin && p.y > margin && p.y < h - margin;
  if (onScreen) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = 'rgba(8,12,18,0.8)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(16, 0); ctx.lineTo(0, 16); ctx.lineTo(-16, 0); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = AMBER; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    text(ctx, dist + ' m', p.x, p.y + 32, 15, AMBER, 'center');
    text(ctx, target.label, p.x, p.y - 28, 13, '#fff', 'center');
  } else {
    let dx = p.behind ? -p.ndcX : p.ndcX;
    let dy = p.behind ? p.ndcY : p.ndcY;
    if (p.behind && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) dx = 1;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const ex = w / 2 + dx * (w / 2 - margin) * Math.min(1, 0.95);
    const ey = h / 2 - dy * (h / 2 - margin);
    const ang = Math.atan2(-dy, dx);
    ctx.save();
    ctx.translate(Math.max(margin, Math.min(w - margin, ex)), Math.max(margin, Math.min(h - margin, ey)));
    ctx.rotate(ang);
    ctx.fillStyle = AMBER; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-10, -11); ctx.lineTo(-4, 0); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    text(ctx, dist + ' m', Math.max(margin, Math.min(w - margin, ex)), Math.max(margin, Math.min(h - margin, ey)) + 24, 13, AMBER, 'center');
  }
}

function annunciator(ctx, x, y, label, on, color, flashing, time) {
  const lit = on && (!flashing || Math.sin(time * 14) > -0.2);
  ctx.fillStyle = lit ? color : 'rgba(10,16,24,0.55)';
  ctx.strokeStyle = lit ? '#fff' : 'rgba(244,239,230,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(x, y, 78, 20); ctx.fill(); ctx.stroke();
  ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = lit ? '#10141a' : 'rgba(244,239,230,0.35)';
  ctx.fillText(label, x + 39, y + 10.5);
}

function drawSystems(ctx, x, y, state, time, compact) {
  const fuelColor = state.fuelPct < 25 ? AMBER : GREEN;
  ctx.fillStyle = 'rgba(8,14,22,0.45)';
  ctx.fillRect(x - 8, y - 10, 190, compact ? 86 : 176);
  if (!compact) text(ctx, 'THR ' + Math.round(state.throttle * 100) + '%', x, y + 6, 16, GREEN);
  text(ctx, 'FUEL ' + Math.round(state.fuelPct) + '%', x, y + 28, 16, fuelColor);
  text(ctx, 'HULL ' + Math.round(state.hullPct) + '%', x, y + 50, 16, state.hullPct < 40 ? RED : GREEN);
  if (!compact) text(ctx, 'G ' + state.gLoad.toFixed(1), x + 112, y + 6, 16, state.gLoad > 5 ? AMBER : GREEN);
  const gearDown = state.gearProgress > 0.5;
  const flaps = Math.round(state.flapsProgress);
  annunciator(ctx, x, y + 68, gearDown ? 'GEAR DN' : 'GEAR UP', true, gearDown ? '#46e08a' : AMBER, false, time);
  annunciator(ctx, x + 88, y + 68, flaps ? 'FLAPS ' + flaps : 'FLAPS 0', flaps > 0, '#46e08a', false, time);
  if (compact) return;
  annunciator(ctx, x, y + 92, 'AIRBRAKE', state.brakeProgress > 0.4, AMBER, false, time);
  annunciator(ctx, x + 88, y + 92, 'BOOST', state.boosting, '#ff9a3a', false, time);
  annunciator(ctx, x, y + 116, 'STALL', state.stall, RED, true, time);
  annunciator(ctx, x + 88, y + 116, 'LOW FUEL', state.fuelPct < 25, AMBER, state.fuelPct < 10, time);
}

function islandMap(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const extent = 1800;
  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const wx = (px / size - 0.5) * 2 * extent;
    const wz = (py / size - 0.5) * 2 * extent;
    const hgt = getTerrainHeight(wx, wz);
    const i = (py * size + px) * 4;
    if (hgt > 1) { const s = Math.min(1, 0.35 + hgt / 400); img.data[i] = 90 * s + 40; img.data[i + 1] = 130 * s + 40; img.data[i + 2] = 100 * s + 30; img.data[i + 3] = 200; }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function drawRadar(ctx, cx, cy, radius, state, rt, time, hud) {
  const range = 1300;
  if (!hud.mapCache) hud.mapCache = islandMap(96);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 7); ctx.fillStyle = 'rgba(8,16,24,0.72)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = GREEN; ctx.stroke();
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-state.headingDeg * DEG);
  const scale = radius / range;
  const mapPx = (3600 * scale);
  ctx.globalAlpha = 0.8;
  ctx.drawImage(hud.mapCache, (-state.pos.x - 1800) * scale, (-state.pos.z - 1800) * scale, mapPx, mapPx);
  ctx.globalAlpha = 1;
  const rx = (v) => (v - state.pos.x) * scale, rz = (v) => (v - state.pos.z) * scale;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(rx(RUNWAY_SPEC.x0), rz(0)); ctx.lineTo(rx(RUNWAY_SPEC.x1), rz(0)); ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.font = `bold 9px ${FONT}`; ctx.textAlign = 'center';
  if (rt) {
    const next = rt.phase === 'fly' ? rt.idx : -1;
    rt.targets.forEach((target, i) => {
      if (target.cleared) return;
      const px = rx(target.pos.x), pz = rz(target.pos.z);
      ctx.strokeStyle = i === next ? '#ffffff' : AMBER;
      ctx.lineWidth = i === next ? 2.5 : 1.5;
      const r = i === next ? 6 + 2.5 * Math.sin(time * 6) : 4;
      ctx.beginPath(); ctx.arc(px, pz, r, 0, 7); ctx.stroke();
    });
    if (rt.phase === 'land') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rx(-200), rz(0), 6 + 2 * Math.sin(time * 6), 0, 7); ctx.stroke(); }
  }
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(125,255,176,0.18)';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius * 0.9, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  text(ctx, 'N', cx - Math.sin(-state.headingDeg * DEG) * (radius - 9) * -1, cy - Math.cos(state.headingDeg * DEG) * (radius - 9), 11, '#fff', 'center');
  text(ctx, 'HSI', cx, cy + radius + 12, 11, GREEN, 'center');
}

function drawStrip(ctx, rt, hud) {
  const x = 14, y = 14;
  ctx.fillStyle = 'rgba(8,14,22,0.55)';
  ctx.fillRect(x - 6, y - 6, 270, 66);
  ctx.fillStyle = AMBER; ctx.fillRect(x - 6, y - 6, 3, 66);
  if (rt) {
    text(ctx, rt.mission.name.toUpperCase(), x + 4, y + 8, 14, IVORY);
    text(ctx, `${rt.mission.unit} ${rt.cleared} / ${rt.total}`, x + 4, y + 28, 14, AMBER);
    const sec = Math.floor(rt.time);
    text(ctx, `${pad(Math.floor(sec / 60), 2)}:${pad(sec % 60, 2)}`, x + 150, y + 28, 14, IVORY);
    text(ctx, 'SCORE ' + rt.score, x + 4, y + 48, 14, IVORY);
    if (rt.combo > 1) text(ctx, 'x' + Math.min(rt.combo, 5), x + 110, y + 48, 14, AMBER);
  }
  text(ctx, hud.cameraMode === 'cockpit' ? 'COCKPIT [V]' : 'CHASE [V]', x + 255, y + 48, 12, GREEN, 'right');
}

export function renderHud(hud, state, missionRt, camera, world) {
  const ctx = hud.ctx;
  hud.time += 1 / 60;
  const dpr = hud.dpr;
  const w = hud.w, h = hud.h;
  if (hud.canvas.width !== Math.round(w * dpr)) hud.resize();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, hud.w, hud.h);
  void world;
  const cockpit = hud.cameraMode === 'cockpit';
  const small = hud.w < 900;
  const over = state.landed || state.crashed;
  const target = missionRt ? getActiveTarget(missionRt) : null;
  const cx = w / 2, cy = cockpit ? h * 0.42 : h * 0.5;
  const sideX = Math.max(96, w * (cockpit ? 0.24 : 0.17));
  const tapeTop = cockpit ? h * 0.2 : h * 0.26;
  const tapeH = cockpit ? h * 0.3 : h * 0.4;

  if (!over) tape(ctx, {
    x: sideX, top: tapeTop, height: tapeH, value: state.kts, span: 80, step: 10, side: -1, color: GREEN, label: 'KTS',
    bands: [{ from: 0, to: Math.max(state.stallSpeedKts ?? 50, 1), color: 'rgba(255,60,50,0.55)', hatch: true }, { from: 300, to: 400, color: 'rgba(242,169,59,0.7)' }],
  });
  if (!over) tape(ctx, { x: w - sideX, top: tapeTop, height: tapeH, value: state.ft, span: 600, step: 100, side: 1, color: GREEN, label: 'FT' });
  const rightX = w - sideX;
  if (!over) text(ctx, 'VSI ' + Math.round(state.vsFpm / 10) * 10 + ' FPM', rightX - 66, tapeTop + tapeH + 16, 13, Math.abs(state.vsFpm) > 1500 ? AMBER : GREEN, 'left');
  if (!over) text(ctx, 'AGL ' + Math.round(state.aglFt) + ' FT', rightX - 66, tapeTop + tapeH + 34, 13, state.aglFt < 100 ? AMBER : GREEN, 'left');

  drawCompass(ctx, w, state, target, cockpit);
  if (!over) drawHorizon(ctx, cx, cy, state, small ? 6 : 8, cockpit, h * 0.56);
  drawVelocityVector(ctx, state, camera, w, h);
  drawWaypoint(ctx, state, target, camera, w, h);
  if (target && target.kind === 'runway') text(ctx, 'LAND RWY 09', cx, h - 40, 16, AMBER, 'center');
  if (missionRt && missionRt.mission.kind === 'drop' && missionRt.phase === 'fly') text(ctx, state.aglFt < 180 ? 'PRESS X \u2014 DROP' : 'DESCEND BELOW 180 FT AGL TO DROP [X]', cx, h - 40, 14, AMBER, 'center');

  if (!cockpit || h > 500) drawSystems(ctx, 20, over ? h - 90 : h - 180, state, hud.time, over);
  if (!over) drawRadar(ctx, w - 20 - (small ? 56 : 74), h - 24 - (small ? 56 : 74) - 14, small ? 56 : 74, state, missionRt, hud.time, hud);
  drawStrip(ctx, missionRt, hud);

  if (missionRt && missionRt.flash > 0) {
    ctx.globalAlpha = missionRt.flash * 0.9;
    text(ctx, missionRt.mission.kind === 'drop' ? 'DROP ZONE CLEARED' : 'TARGET CLEARED', cx, h * 0.3, 22, AMBER, 'center');
    ctx.globalAlpha = 1;
  }
  if (state.stall && !state.onGround && !over) text(ctx, 'STALL', cx, h * 0.62, 26, Math.sin(hud.time * 14) > 0 ? RED : '#ffffff', 'center');
}